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
import ReverseStream from './reversestream';
import SocketOptions from '../../SocketOptions';
import ExtendedPublicKey from '../../ExtendedPublicKey';

const debug = d('adb:tcpusb:socket');
const UINT32_MAX = 0xffffffff;
// adb's own MAX_PAYLOAD. A stream has one packet in flight, so this bounds throughput per round trip.
const MAX_PAYLOAD = 1024 * 1024;
const AUTH_TOKEN = 1;
const AUTH_SIGNATURE = 2;
const AUTH_RSAPUBLICKEY = 3;
const TOKEN_LENGTH = 20;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

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
  private reverses = new Map<string, Net.Server>();
  private remoteAddress?: string;
  private token?: Buffer;
  private signature?: Buffer;
  public version = 1;
  public maxPayload = 4096;
  /** adb's `delayed_ack`: on when the client's banner lists it; we list it back. */
  public delayedAck = false;

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
    for (const server of this.reverses.values()) {
      server.close();
    }
    this.reverses.clear();
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
    this.maxPayload = Math.min(MAX_PAYLOAD, packet.arg1);
    const features = /features=([^;\x00]*)/.exec(packet.data ? packet.data.toString() : '');
    this.delayedAck = !!features && features[1].split(',').indexOf('delayed_ack') !== -1;
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

        const digest = this.token.toString('binary');
        const sig = this.signature.toString('binary');
        for (const key of this.options.knownPublicKeys ?? []) {
          // If signature matches one of the known public keys, we can safely accept the connection
          if (key.verify(digest, sig)) return this._acceptConnection();
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
            return this._acceptConnection();
          });
      default:
        throw new Error(`Unknown authentication method ${packet.arg0}`);
    }
  }

  /**
   * Mark the incoming connection as authorized
   * and send the connection packet
   */
  private _acceptConnection(): Bluebird<boolean> {
    return this._deviceId().then((id) => {
      this.authorized = true;
      debug('O:A_CNXN');
      return this.write(Packet.assemble(Packet.A_CNXN, Packet.swap32(this.version), this.maxPayload, id));
    });
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

  /**
   * The device's adbd connects `adb reverse` streams to its adb server, not to our client. For
   * `reverse:forward:[norebind:]<remote>;<local>`, listen locally and return the service with <local> replaced
   * by that listener, whose connections are relayed to the client. Other services are returned unchanged.
   */
  public rewriteReverseService(name: string): Bluebird<string> {
    // The adb server connects to the listener, so it only works when that server shares our host.
    if (LOOPBACK_HOSTS.indexOf(this.client.host) === -1) {
      return Bluebird.resolve(name);
    }
    const forward = /^reverse:forward:(norebind:)?([^;]+);(.+)$/.exec(name);
    if (forward) {
      const [, norebind = '', remote, local] = forward;
      return this._listenReverse(remote, local).then((port) => `reverse:forward:${norebind}${remote};tcp:${port}`);
    }
    const kill = /^reverse:killforward:(.+)$/.exec(name);
    if (kill) {
      this._closeReverse(kill[1]);
    } else if (name === 'reverse:killforward-all') {
      for (const remote of [...this.reverses.keys()]) {
        this._closeReverse(remote);
      }
    }
    return Bluebird.resolve(name);
  }

  public removeService(localId: number): void {
    this.services.remove(localId);
  }

  private _listenReverse(remote: string, local: string): Bluebird<number> {
    this._closeReverse(remote);
    return new Bluebird<number>((resolve, reject) => {
      const server = Net.createServer((conn) => this._openReverse(local, conn));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as Net.AddressInfo).port;
        this.reverses.set(remote, server);
        debug(`Reverse ${remote} => client ${local} via 127.0.0.1:${port}`);
        resolve(port);
      });
    });
  }

  private _closeReverse(remote: string): void {
    const server = this.reverses.get(remote);
    if (server) {
      server.close();
      this.reverses.delete(remote);
    }
  }

  private _openReverse(local: string, conn: Net.Socket): void {
    if (this.ended) {
      conn.destroy();
      return;
    }
    const stream = new ReverseStream(this, this.remoteId.next(), conn);
    this.services.insert(stream.localId, stream);
    stream.open(local);
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
      .then((properties) => {
        const id = (function () {
          const ref = ['ro.product.name', 'ro.product.model', 'ro.product.device'];
          const results = [];
          for (let i = 0, len = ref.length; i < len; i++) {
            const prop = ref[i];
            results.push(`${prop}=${properties[prop]};`);
          }
          return results;
        })().join('');
        // ;-terminated like the properties: the client would read the NUL as part of the last value.
        const features = this.delayedAck ? 'features=delayed_ack;' : '';
        return Buffer.from(`device::${id}${features}\x00`);
      });
  }
}
