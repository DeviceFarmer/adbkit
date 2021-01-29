import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import d from 'debug';
import Bluebird from 'bluebird';
import PacketReader from './packetreader';
import RollingCounter from './rollingcounter';
import Packet from './packet';
import Auth from '../auth';
import Client from '../client';
import * as Net from 'net';
import ServiceMap from './servicemap';
import Service from './service';
import SocketOptions from '../../SocketOptions';

const debug = d('adb:tcpusb:socket');
const UINT32_MAX = 0xffffffff;
const UINT16_MAX = 0xffff;
const AUTH_TOKEN = 1;
const AUTH_SIGNATURE = 2;
const AUTH_RSAPUBLICKEY = 3;
const TOKEN_LENGTH = 20;

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AuthError.prototype);
    this.name = 'AuthError';
    Error.captureStackTrace(this, Socket.AuthError);
  }
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized access');
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
    this.name = 'UnauthorizedError';
    Error.captureStackTrace(this, Socket.UnauthorizedError);
  }
}

export default class Socket extends EventEmitter {
  public static AuthError = AuthError;
  public static UnauthorizedError = UnauthorizedError;

  private ended = false;
  private reader: PacketReader;
  private authorized = false;
  private syncToken = new RollingCounter(UINT32_MAX);
  private remoteId = new RollingCounter(UINT32_MAX);
  private services = new ServiceMap();
  private remoteAddress?: string;
  private token?: Buffer;
  private signature?: Buffer;
  public version = 1;
  public maxPayload = 4096;

  constructor(
    private readonly client: Client,
    private readonly serial: string,
    private socket: Net.Socket,
    private options: SocketOptions = {},
  ) {
    super();

    let base: SocketOptions;
    (base = this.options).auth || (base.auth = () => Bluebird.resolve(true));
    this.socket.setNoDelay(true);
    this.reader = new PacketReader(this.socket)
      .on('packet', this._handle.bind(this))
      .on('error', (err) => {
        debug(`PacketReader error: ${err.message}`);
        return this.end();
      })
      .on('end', this.end.bind(this));
    this.remoteAddress = this.socket.remoteAddress;
    this.token = undefined;
    this.signature = undefined;
  }

  public end(): Socket {
    if (this.ended) {
      return this;
    }
    // End services first so that they can send a final payload before FIN.
    this.services.end();
    this.socket.end();
    this.ended = true;
    this.emit('end');
    return this;
  }

  private _error(err: Error): Socket {
    this.emit('error', err);
    return this.end();
  }

  private _handle(packet: Packet): Bluebird<boolean> {
    if (this.ended) {
      return Bluebird.resolve(false);
    }
    this.emit('userActivity', packet);
    return Bluebird.try(() => {
      switch (packet.command) {
        case Packet.A_SYNC:
          return Bluebird.resolve(this._handleSyncPacket());
        case Packet.A_CNXN:
          return this._handleConnectionPacket(packet);
        case Packet.A_OPEN:
          return this._handleOpenPacket(packet).then((r) => !!r);
        case Packet.A_OKAY:
        case Packet.A_WRTE:
        case Packet.A_CLSE:
          return this._forwardServicePacket(packet).then((r) => !!r);
        case Packet.A_AUTH:
          return this._handleAuthPacket(packet);
        default:
          throw new Error(`Unknown command ${packet.command}`);
      }
    })
      .catch(Socket.AuthError, () => {
        this.end();
        return false;
      })
      .catch(Socket.UnauthorizedError, () => {
        this.end();
        return false;
      })
      .catch((err) => {
        this._error(err);
        return false;
      });
  }

  private _handleSyncPacket(): boolean {
    // No need to do anything?
    debug('I:A_SYNC');
    debug('O:A_SYNC');
    return this.write(Packet.assemble(Packet.A_SYNC, 1, this.syncToken.next()));
  }

  private _handleConnectionPacket(packet): Bluebird<boolean> {
    debug('I:A_CNXN', packet);
    this.version = Packet.swap32(packet.arg0);
    this.maxPayload = Math.min(UINT16_MAX, packet.arg1);
    return this._createToken().then((token) => {
      this.token = token;
      debug(`Created challenge '${this.token.toString('base64')}'`);
      debug('O:A_AUTH');
      return this.write(Packet.assemble(Packet.A_AUTH, AUTH_TOKEN, 0, this.token));
    });
  }

  private _handleAuthPacket(packet: Packet): Bluebird<boolean> {
    debug('I:A_AUTH', packet);
    switch (packet.arg0) {
      case AUTH_SIGNATURE:
        // Store first signature, ignore the rest
        if (packet.data) debug(`Received signature '${packet.data.toString('base64')}'`);
        if (!this.signature) {
          this.signature = packet.data;
        }
        debug('O:A_AUTH');
        const b = this.write(Packet.assemble(Packet.A_AUTH, AUTH_TOKEN, 0, this.token));
        return Bluebird.resolve(b);
      case AUTH_RSAPUBLICKEY:
        if (!this.signature) {
          throw new Socket.AuthError('Public key sent before signature');
        }
        if (!packet.data || packet.data.length < 2) {
          throw new Socket.AuthError('Empty RSA public key');
        }
        debug(`Received RSA public key '${packet.data.toString('base64')}'`);
        return Auth.parsePublicKey(this._skipNull(packet.data).toString())
          .then((key) => {
            const digest = this.token.toString('binary');
            const sig = this.signature.toString('binary');
            if (!key.verify(digest, sig)) {
              debug('Signature mismatch');
              throw new Socket.AuthError('Signature mismatch');
            }
            debug('Signature verified');
            return key;
          })
          .then((key) => {
            if (!this.options.auth) return;
            return this.options.auth(key).catch(() => {
              debug('Connection rejected by user-defined auth handler');
              throw new Socket.AuthError('Rejected by user-defined handler');
            });
          })
          .then(() => {
            return this._deviceId();
          })
          .then((id) => {
            this.authorized = true;
            debug('O:A_CNXN');
            return this.write(Packet.assemble(Packet.A_CNXN, Packet.swap32(this.version), this.maxPayload, id));
          });
      default:
        throw new Error(`Unknown authentication method ${packet.arg0}`);
    }
  }

  private _handleOpenPacket(packet: Packet): Bluebird<boolean | Service> {
    if (!this.authorized) {
      throw new Socket.UnauthorizedError();
    }
    const remoteId = packet.arg0;
    const localId = this.remoteId.next();
    if (!(packet.data && packet.data.length >= 2)) {
      throw new Error('Empty service name');
    }
    const name = this._skipNull(packet.data);
    debug(`Calling ${name}`);
    const service = new Service(this.client, this.serial, localId, remoteId, this);
    return new Bluebird<boolean | Service>((resolve, reject) => {
      service.on('error', reject);
      service.on('end', resolve);
      this.services.insert(localId, service);
      debug(`Handling ${this.services.count} services simultaneously`);
      return service.handle(packet);
    })
      .catch(() => true)
      .finally(() => {
        this.services.remove(localId);
        debug(`Handling ${this.services.count} services simultaneously`);
        return service.end();
      });
  }

  private _forwardServicePacket(packet: Packet): Promise<boolean | Service> {
    if (!this.authorized) {
      throw new Socket.UnauthorizedError();
    }
    const localId = packet.arg1;
    const service = this.services.get(localId);
    if (service) {
      return service.handle(packet);
    } else {
      debug('Received a packet to a service that may have been closed already');
      return Promise.resolve(false);
    }
  }

  public write(chunk: Buffer | string): boolean {
    if (this.ended) {
      return false;
    }
    return this.socket.write(chunk);
  }

  private _createToken(): Bluebird<Buffer> {
    return Bluebird.promisify(crypto.randomBytes)(TOKEN_LENGTH);
  }

  private _skipNull(data: Buffer): Buffer {
    return data.slice(0, -1); // Discard null byte at end
  }

  private _deviceId(): Bluebird<Buffer> {
    debug('Loading device properties to form a standard device ID');
    return this.client
      .getDevice(this.serial)
      .getProperties()
      .then(function (properties) {
        const id = (function () {
          const ref = ['ro.product.name', 'ro.product.model', 'ro.product.device'];
          const results = [];
          for (let i = 0, len = ref.length; i < len; i++) {
            const prop = ref[i];
            results.push(`${prop}=${properties[prop]};`);
          }
          return results;
        })().join('');
        return Buffer.from(`device::${id}\x00`);
      });
  }
}
