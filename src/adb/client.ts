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
  HostPairCommand,
} from './command/host';
import TcpUsbServer from './tcpusb/server';
import Device from '../Device';
import { ClientOptions } from '../ClientOptions';
import SocketOptions from '../SocketOptions';
import Tracker from './tracker';
import DeviceWithPath from '../DeviceWithPath';
import DeviceClient from './DeviceClient';
import PairResult from '../PairResult';

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

  /**
   * Pairs the ADB server with a device for wireless debugging (Android 11 and newer). Same as `adb pair <host>:<port> <code>`. The ADB server does the pairing itself, so it must come from platform-tools 30 or newer; older servers reject the request.
   *
   * Pairing only exchanges keys. To use the device afterwards, call `client.connect()` with the device's IP address and its connect port, both shown on its Wireless debugging screen. The connect port is not the pairing port.
   *
   * @param host The device's IP address, as shown in the "Pair device with pairing code" dialog.
   * @param port The pairing port from that dialog.
   * @param code The six-digit pairing code from that dialog, as a string (it can start with `0`).
   * @returns The pairing address and the device's GUID, as reported by the server. Rejects with the server's message if pairing fails, e.g. `Failed: Unable to start pairing client.` when nothing answers on the port. A peer that doesn't answer at all can take about 10 seconds to fail.
   */
  public pair(host: string, port: number, code: string): Promise<PairResult> {
    return this.connection().then((conn) => new HostPairCommand(conn).execute(host, port, code));
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
