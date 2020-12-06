import { EventEmitter } from 'events';
import Monkey from '@devicefarmer/adbkit-monkey';
import Logcat from '@devicefarmer/adbkit-logcat';
import Connection from './connection';
import Sync from './sync';
import Parser from './parser';
import ProcStat from './proc/stat';

import {
    HostVersionCommand,
    HostConnectCommand,
    HostDevicesCommand,
    HostDevicesWithPathsCommand,
    HostDisconnectCommand,
    HostTrackDevicesCommand,
    HostKillCommand,
    HostTransportCommand,
} from './command/host';
import {
    ClearCommand,
    FrameBufferCommand,
    GetFeaturesCommand,
    GetPackagesCommand,
    GetPropertiesCommand,
    InstallCommand,
    IsInstalledCommand,
    ListReversesCommand,
    LocalCommand,
    LogcatCommand,
    LogCommand,
    MonkeyCommand,
    RebootCommand,
    RemountCommand,
    ReverseCommand,
    RootCommand,
    ScreencapCommand,
    ShellCommand,
    StartActivityCommand,
    StartServiceCommand,
    SyncCommand,
    TcpCommand,
    TcpIpCommand,
    TrackJdwpCommand,
    UninstallCommand,
    UsbCommand,
    WaitBootCompleteCommand,
} from './command/host-transport';
import {
    ForwardCommand,
    GetDevicePathCommand,
    GetSerialNoCommand,
    GetStateCommand,
    ListForwardsCommand,
    WaitForDeviceCommand,
} from './command/host-serial';
import TcpUsbServer from './tcpusb/server';
import d from 'debug';
import { Callback } from '../Callback';
import Device from '../Device';
import Forward from '../Forward';
import Reverse from '../Reverse';
import StartActivityOptions from '../StartActivityOptions';
import StartServiceOptions from '../StartServiceOptions';
import Bluebird from 'bluebird';
import { ClientOptions } from '../ClientOptions';
import { Duplex } from 'stream';
import SocketOptions from '../SocketOptions';
import Stats from './sync/stats';
import Entry from './sync/entry';
import PushTransfer from './sync/pushtransfer';
import { ReadStream } from 'fs';
import PullTransfer from './sync/pulltransfer';
import { Properties } from '../Properties';
import { Features } from '../Features';
import FramebufferStreamWithMeta from '../FramebufferStreamWithMeta';
import WithToString from '../WithToString';
import Tracker from './tracker';
import JdwpTracker from './jdwptracker';
import DeviceWithPath from '../DeviceWithPath';

const debug = d('adb:client');

const NoUserOptionError = (err: Error) => err.message.indexOf('--user') !== -1;

export default class Client extends EventEmitter {
    public readonly options: ClientOptions;
    public readonly port: number | string;
    public readonly bin: string;

    constructor({ port = 5037, bin = 'adb' }: ClientOptions = { port: 5037 }) {
        super();
        this.port = port;
        this.bin = bin;
        this.options = { port, bin };
    }

    public createTcpUsbBridge(serial: string, options: SocketOptions): TcpUsbServer {
        return new TcpUsbServer(this, serial, options);
    }

    public connection(): Bluebird<Connection> {
        const connection = new Connection(this.options);
        // Reemit unhandled connection errors, so they can be handled externally.
        // If not handled at all, these will crash node.
        connection.on('error', (err) => this.emit('error', err));
        return connection.connect();
    }

    public version(callback?: Callback<number>): Bluebird<number> {
        return this.connection()
            .then((conn) => new HostVersionCommand(conn).execute())
            .nodeify(callback);
    }

    public connect(host: string, port: number | typeof callback = 5555, callback?: Callback<string>): Bluebird<string> {
        let p: number;
        if (typeof port === 'function') {
            callback = port;
            p = 5555;
        } else {
            p = port;
        }
        if (host.indexOf(':') !== -1) {
            const [h, portString] = host.split(':', 2);
            host = h;
            const parsed = parseInt(portString, 10);
            if (!isNaN(parsed)) {
                p = parsed;
            }
        }
        return this.connection()
            .then((conn) => new HostConnectCommand(conn).execute(host, p))
            .nodeify(callback);
    }

    public disconnect(
        host: string,
        port: number | typeof callback = 5555,
        callback?: Callback<string>,
    ): Bluebird<string> {
        let p: number;
        if (typeof port === 'function') {
            callback = port;
            p = 5555;
        } else {
            p = port;
        }
        if (host.indexOf(':') !== -1) {
            const [h, portString] = host.split(':', 2);
            host = h;
            const parsed = parseInt(portString, 10);
            if (!isNaN(parsed)) {
                p = parsed;
            }
        }
        return this.connection()
            .then((conn) => new HostDisconnectCommand(conn).execute(host, p))
            .nodeify(callback);
    }

    public listDevices(callback?: Callback<Device[]>): Bluebird<Device[]> {
        return this.connection()
            .then((conn) => new HostDevicesCommand(conn).execute())
            .nodeify(callback);
    }

    public listDevicesWithPaths(callback?: Callback<DeviceWithPath[]>): Bluebird<DeviceWithPath[]> {
        return this.connection()
            .then((conn) => new HostDevicesWithPathsCommand(conn).execute())
            .nodeify(callback);
    }

    public trackDevices(callback?: Callback<Tracker>): Bluebird<Tracker> {
        return this.connection()
            .then((conn) => new HostTrackDevicesCommand(conn).execute())
            .nodeify(callback);
    }

    public kill(callback?: Callback<boolean>): Bluebird<boolean> {
        return this.connection()
            .then((conn) => new HostKillCommand(conn).execute())
            .nodeify(callback);
    }

    public getSerialNo(serial: string, callback?: Callback<string>): Bluebird<string> {
        return this.connection()
            .then((conn) => new GetSerialNoCommand(conn).execute(serial))
            .nodeify(callback);
    }

    public getDevicePath(
        serial: string,
        callback?: Callback<DeviceWithPath['path']>,
    ): Bluebird<DeviceWithPath['path']> {
        return this.connection()
            .then((conn) => new GetDevicePathCommand(conn).execute(serial))
            .nodeify(callback);
    }

    public getState(serial: string, callback?: Callback<string>): Bluebird<string> {
        return this.connection()
            .then((conn) => new GetStateCommand(conn).execute(serial))
            .nodeify(callback);
    }

    public getProperties(serial: string, callback?: Callback<Properties>): Bluebird<Properties> {
        return this.transport(serial)
            .then((transport) => new GetPropertiesCommand(transport).execute())
            .nodeify(callback);
    }

    public getFeatures(serial: string, callback?: Callback<Features>): Bluebird<Features> {
        return this.transport(serial)
            .then((transport) => new GetFeaturesCommand(transport).execute())
            .nodeify(callback);
    }

    public getPackages(serial: string, callback?: Callback<string[]>): Bluebird<string[]> {
        return this.transport(serial)
            .then((transport) => new GetPackagesCommand(transport).execute())
            .nodeify(callback);
    }

    public getDHCPIpAddress(
        serial: string,
        iface?: string | typeof callback,
        callback?: Callback<string>,
    ): Bluebird<string> {
        if (typeof iface === 'function') {
            callback = iface;
            iface = 'wlan0';
        }
        return this.getProperties(serial)
            .then((properties) => {
                const ip = properties['dhcp.' + iface + '.ipaddress'];
                if (ip) {
                    return ip;
                }
                throw new Error(`Unable to find ipaddress for '${iface}'`);
            })
            .nodeify(callback);
    }

    public forward(serial: string, local: string, remote: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.connection()
            .then((conn) => new ForwardCommand(conn).execute(serial, local, remote))
            .nodeify(callback);
    }

    public listForwards(serial: string, callback?: Callback<Forward[]>): Bluebird<Forward[]> {
        return this.connection()
            .then((conn) => new ListForwardsCommand(conn).execute(serial))
            .nodeify(callback);
    }

    public reverse(serial: string, remote: string, local: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new ReverseCommand(transport).execute(remote, local))
            .nodeify(callback);
    }

    public listReverses(serial: string, callback?: Callback<Reverse[]>): Bluebird<Reverse[]> {
        return this.transport(serial)
            .then((transport) => new ListReversesCommand(transport).execute())
            .nodeify(callback);
    }

    public transport(serial: string, callback?: Callback<Connection>): Bluebird<Connection> {
        return this.connection()
            .then((conn) => new HostTransportCommand(conn).execute(serial).return(conn))
            .nodeify(callback);
    }

    public shell(
        serial: string,
        command: string | ArrayLike<WithToString>,
        callback?: Callback<Duplex>,
    ): Bluebird<Duplex> {
        return this.transport(serial)
            .then((transport) => new ShellCommand(transport).execute(command))
            .nodeify(callback);
    }

    public reboot(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new RebootCommand(transport).execute())
            .nodeify(callback);
    }

    public remount(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new RemountCommand(transport).execute())
            .nodeify(callback);
    }

    public root(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new RootCommand(transport).execute())
            .nodeify(callback);
    }

    public trackJdwp(serial: string, callback?: Callback<JdwpTracker>): Bluebird<JdwpTracker> {
        return this.transport(serial)
            .then((transport) => new TrackJdwpCommand(transport).execute())
            .nodeify(callback);
    }

    public framebuffer(
        serial: string,
        format?: string | typeof callback,
        callback?: Callback<FramebufferStreamWithMeta>,
    ): Bluebird<FramebufferStreamWithMeta> {
        let f: string;
        if (typeof format === 'function') {
            callback = format;
            f = 'raw';
        } else {
            f = format;
        }
        return this.transport(serial)
            .then((transport) => new FrameBufferCommand(transport).execute(f))
            .nodeify(callback);
    }

    public screencap(serial: string, callback?: Callback<Duplex>): Bluebird<Duplex> {
        return this.transport(serial)
            .then((transport) => {
                return new ScreencapCommand(transport).execute().catch((err) => {
                    debug(`Emulating screencap command due to '${err}'`);
                    return this.framebuffer(serial, 'png');
                });
            })
            .nodeify(callback);
    }

    public openLocal(serial: string, path: string, callback?: Callback<Duplex>): Bluebird<Duplex> {
        return this.transport(serial)
            .then((transport) => new LocalCommand(transport).execute(path))
            .nodeify(callback);
    }

    public openLog(serial: string, name: string, callback?: Callback<Duplex>): Bluebird<Duplex> {
        return this.transport(serial)
            .then((transport) => new LogCommand(transport).execute(name))
            .nodeify(callback);
    }

    public openTcp(
        serial: string,
        port: number,
        host?: string | typeof callback,
        callback?: Callback<Duplex>,
    ): Bluebird<Duplex> {
        let h: string | undefined;
        if (typeof host === 'function') {
            callback = host;
        } else {
            h = host;
        }
        return this.transport(serial)
            .then((transport) => new TcpCommand(transport).execute(port, h))
            .nodeify(callback);
    }

    public openMonkey(
        serial: string,
        port: number | typeof callback = 1080,
        callback?: Callback<Duplex>,
    ): Bluebird<Duplex> {
        let p: number;
        if (typeof port === 'function') {
            callback = port;
            p = 1080;
        } else {
            p = port;
        }
        const tryConnect = (times: number) => {
            return this.openTcp(serial, p)
                .then((stream) => Monkey.connectStream(stream))
                .catch((err) => {
                    if ((times -= 1)) {
                        debug(`Monkey can't be reached, trying ${times} more times`);
                        return Bluebird.delay(100).then(() => tryConnect(times));
                    } else {
                        throw err;
                    }
                });
        };
        return tryConnect(1)
            .catch(() => {
                return this.transport(serial)
                    .then((transport) => new MonkeyCommand(transport).execute(p))
                    .then((out) => {
                        return tryConnect(20).then((monkey) => monkey.once('end', () => out.end()));
                    });
            })
            .nodeify(callback);
    }

    public openLogcat(
        serial: string,
        options?: { clear?: boolean } | typeof callback,
        callback?: Callback<Logcat>,
    ): Bluebird<Logcat> {
        let opts: { clear?: boolean };
        if (typeof options === 'function') {
            callback = options;
            opts = {};
        } else {
            opts = options;
        }
        return this.transport(serial)
            .then((transport) => new LogcatCommand(transport).execute(opts))
            .then((stream) => Logcat.readStream(stream, { fixLineFeeds: false }))
            .nodeify(callback);
    }

    public openProcStat(serial: string, callback?: Callback<ProcStat>): Bluebird<ProcStat> {
        return this.syncService(serial)
            .then((sync) => new ProcStat(sync))
            .nodeify(callback);
    }

    public clear(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new ClearCommand(transport).execute(pkg))
            .nodeify(callback);
    }

    public install(serial: string, apk: string | ReadStream, callback?: Callback<boolean>): Bluebird<boolean> {
        const temp = Sync.temp(typeof apk === 'string' ? apk : '_stream.apk');
        return this.push(serial, apk, temp)
            .then((transfer) => {
                let endListener, errorListener;
                const resolver = Bluebird.defer<boolean>();
                transfer.on('error', (errorListener = (err: Error) => resolver.reject(err)));
                transfer.on(
                    'end',
                    (endListener = () =>
                        this.installRemote(serial, temp).then((value: boolean) => resolver.resolve(value))),
                );
                return resolver.promise.finally(() => {
                    transfer.removeListener('error', errorListener);
                    return transfer.removeListener('end', endListener);
                });
            })
            .nodeify(callback);
    }

    public installRemote(serial: string, apk: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => {
                return new InstallCommand(transport)
                    .execute(apk)
                    .then(() => this.shell(serial, ['rm', '-f', apk]))
                    .then((stream) => new Parser(stream).readAll())
                    .then(() => true);
            })
            .nodeify(callback);
    }

    public uninstall(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new UninstallCommand(transport).execute(pkg))
            .nodeify(callback);
    }

    public isInstalled(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new IsInstalledCommand(transport).execute(pkg))
            .nodeify(callback);
    }

    public startActivity(
        serial: string,
        options: StartActivityOptions,
        callback?: Callback<boolean>,
    ): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new StartActivityCommand(transport).execute(options))
            .catch(NoUserOptionError, () => {
                options.user = null;
                return this.startActivity(serial, options);
            })
            .nodeify(callback);
    }

    public startService(serial: string, options: StartServiceOptions, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => {
                if (!(options.user || options.user === null)) {
                    options.user = 0;
                }
                return new StartServiceCommand(transport).execute(options);
            })
            .catch(NoUserOptionError, () => {
                options.user = null;
                return this.startService(serial, options);
            })
            .nodeify(callback);
    }

    public syncService(serial: string, callback?: Callback<Sync>): Bluebird<Sync> {
        return this.transport(serial)
            .then((transport) => new SyncCommand(transport).execute())
            .nodeify(callback);
    }

    public stat(serial: string, path: string, callback?: Callback<Stats>): Bluebird<Stats> {
        return this.syncService(serial)
            .then((sync) => sync.stat(path).finally(() => sync.end()))
            .nodeify(callback);
    }

    public readdir(serial: string, path: string, callback?: Callback<Entry[]>): Bluebird<Entry[]> {
        return this.syncService(serial)
            .then((sync) => sync.readdir(path).finally(() => sync.end()))
            .nodeify(callback);
    }

    public pull(serial: string, path: string, callback?: Callback<PullTransfer>): Bluebird<PullTransfer> {
        return this.syncService(serial)
            .then((sync) => sync.pull(path).on('end', () => sync.end()))
            .nodeify(callback);
    }

    public push(
        serial: string,
        contents: string | ReadStream,
        path: string,
        mode?: number | typeof callback,
        callback?: Callback<PushTransfer>,
    ): Bluebird<PushTransfer> {
        let m: number | undefined;
        if (typeof mode === 'function') {
            callback = mode;
        } else {
            m = mode;
        }
        return this.syncService(serial)
            .then((sync) => sync.push(contents, path, m).on('end', () => sync.end()))
            .nodeify(callback);
    }

    public tcpip(serial: string, port: number | typeof callback = 5555, callback?: Callback<number>): Bluebird<number> {
        let p: number;
        if (typeof port === 'function') {
            callback = port;
            p = 5555;
        } else {
            p = port;
        }
        return this.transport(serial)
            .then((transport) => new TcpIpCommand(transport).execute(p))
            .nodeify(callback);
    }

    public usb(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new UsbCommand(transport).execute())
            .nodeify(callback);
    }

    public waitBootComplete(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
        return this.transport(serial)
            .then((transport) => new WaitBootCompleteCommand(transport).execute())
            .nodeify(callback);
    }

    public waitForDevice(serial: string, callback?: Callback<string>): Bluebird<string> {
        return this.connection()
            .then((conn) => new WaitForDeviceCommand(conn).execute(serial))
            .nodeify(callback);
    }
}
