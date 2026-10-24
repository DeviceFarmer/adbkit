import { EventEmitter } from 'events';
import Connection from './connection';

import {
  HostVersionCommand,
  HostConnectCommand,
  HostDevicesCommand,
  HostDevicesWithPathsCommand,
  HostDisconnectCommand,
  HostTrackDevicesCommand,
  HostKillCommand,
} from './command/host';
import TcpUsbServer from './tcpusb/server';
import Device from '../Device';
import { ClientOptions } from '../ClientOptions';
import SocketOptions from '../SocketOptions';
import Tracker from './tracker';
import DeviceWithPath from '../DeviceWithPath';
import DeviceClient from './DeviceClient';

export default class Client extends EventEmitter {
  public readonly options: ClientOptions;
  public readonly host: string;
  public readonly port: number | string;
  public readonly bin: string;
  public readonly timeout: number;

  constructor({ host = '127.0.0.1', port = 5037, bin = 'adb', timeout = 0 }: ClientOptions = { port: 5037 }) {
    super();
    this.host = host;
    this.port = port;
    this.bin = bin;
    this.timeout = timeout;
    this.options = { host, port, bin, timeout };
  }

  public createTcpUsbBridge(serial: string, options: SocketOptions): TcpUsbServer {
    return new TcpUsbServer(this, serial, options);
  }

  public connection(): Promise<Connection> {
    const connection = new Connection(this.options);
    // Reemit unhandled connection errors, so they can be handled externally.
    // If not handled at all, these will crash node.
    connection.on('error', (err) => this.emit('error', err));
    return connection.connect();
  }

  public version(): Promise<number> {
    return this.connection().then((conn) => new HostVersionCommand(conn).execute());
  }

  public connect(host: string, port = 5555): Promise<string> {
    if (host.indexOf(':') !== -1) {
      const [h, portString] = host.split(':', 2);
      host = h;
      const parsed = parseInt(portString, 10);
      if (!isNaN(parsed)) {
        port = parsed;
      }
    }
    return this.connection().then((conn) => new HostConnectCommand(conn).execute(host, port));
  }

  public disconnect(host: string, port = 5555): Promise<DeviceClient> {
    if (host.indexOf(':') !== -1) {
      const [h, portString] = host.split(':', 2);
      host = h;
      const parsed = parseInt(portString, 10);
      if (!isNaN(parsed)) {
        port = parsed;
      }
    }
    return this.connection()
      .then((conn) => new HostDisconnectCommand(conn).execute(host, port))
      .then((deviceId) => new DeviceClient(this, deviceId));
  }

  public listDevices(): Promise<Device[]> {
    return this.connection().then((conn) => new HostDevicesCommand(conn).execute());
  }

  public listDevicesWithPaths(): Promise<DeviceWithPath[]> {
    return this.connection().then((conn) => new HostDevicesWithPathsCommand(conn).execute());
  }

  public trackDevices(): Promise<Tracker> {
    return this.connection().then((conn) => new HostTrackDevicesCommand(conn).execute());
  }

  public kill(): Promise<boolean> {
    return this.connection().then((conn) => new HostKillCommand(conn).execute());
  }

  public getDevice(serial: string): DeviceClient {
    return new DeviceClient(this, serial);
  }
}
