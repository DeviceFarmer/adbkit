import Monkey from '@devicefarmer/adbkit-monkey';
import Logcat from '@devicefarmer/adbkit-logcat';
import Connection from './connection';
import Sync from './sync';
import Parser from './parser';
import ProcStat from './proc/stat';

import { HostTransportCommand } from './command/host';
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
import d from 'debug';
import Forward from '../Forward';
import Reverse from '../Reverse';
import StartActivityOptions from '../StartActivityOptions';
import StartServiceOptions from '../StartServiceOptions';
import Bluebird from 'bluebird';
import { Duplex } from 'stream';
import Stats from './sync/stats';
import Entry from './sync/entry';
import PushTransfer from './sync/pushtransfer';
import { ReadStream } from 'fs';
import PullTransfer from './sync/pulltransfer';
import { Properties } from '../Properties';
import { Features } from '../Features';
import FramebufferStreamWithMeta from '../FramebufferStreamWithMeta';
import WithToString from '../WithToString';
import JdwpTracker from './jdwptracker';
import DeviceWithPath from '../DeviceWithPath';
import Client from './client';

const debug = d('adb:client');

const NoUserOptionError = (err: Error) => err.message.indexOf('--user') !== -1;

export default class DeviceClient {
    constructor(public readonly client: Client, public readonly serial: string) {
        // no code
    }

    public getSerialNo(): Bluebird<string> {
        return this.client.connection().then((conn) => new GetSerialNoCommand(conn).execute(this.serial));
    }

    public getDevicePath(): Bluebird<DeviceWithPath['path']> {
        return this.client.connection().then((conn) => new GetDevicePathCommand(conn).execute(this.serial));
    }

    public getState(): Bluebird<string> {
        return this.client.connection().then((conn) => new GetStateCommand(conn).execute(this.serial));
    }

    public getProperties(): Bluebird<Properties> {
        return this.transport().then((transport) => new GetPropertiesCommand(transport).execute());
    }

    public getFeatures(): Bluebird<Features> {
        return this.transport().then((transport) => new GetFeaturesCommand(transport).execute());
    }

    public getPackages(): Bluebird<string[]> {
        return this.transport().then((transport) => new GetPackagesCommand(transport).execute());
    }

    public getDHCPIpAddress(iface = 'wlan0'): Bluebird<string> {
        return this.getProperties().then((properties) => {
            const ip = properties['dhcp.' + iface + '.ipaddress'];
            if (ip) {
                return ip;
            }
            throw Error(`Unable to find ipaddress for '${iface}'`);
        });
    }

    public forward(local: string, remote: string): Bluebird<boolean> {
        return this.client.connection().then((conn) => new ForwardCommand(conn).execute(this.serial, local, remote));
    }

    public listForwards(): Bluebird<Forward[]> {
        return this.client.connection().then((conn) => new ListForwardsCommand(conn).execute(this.serial));
    }

    public reverse(remote: string, local: string): Bluebird<boolean> {
        return this.transport().then((transport) => new ReverseCommand(transport).execute(remote, local));
    }

    public listReverses(): Bluebird<Reverse[]> {
        return this.transport().then((transport) => new ListReversesCommand(transport).execute());
    }

    public transport(): Bluebird<Connection> {
        return this.client
            .connection()
            .then((conn) => new HostTransportCommand(conn).execute(this.serial).return(conn));
    }

    public shell(command: string | ArrayLike<WithToString>): Bluebird<Duplex> {
        return this.transport().then((transport) => new ShellCommand(transport).execute(command));
    }

    public reboot(): Bluebird<boolean> {
        return this.transport().then((transport) => new RebootCommand(transport).execute());
    }

    public remount(): Bluebird<boolean> {
        return this.transport().then((transport) => new RemountCommand(transport).execute());
    }

    public root(): Bluebird<boolean> {
        return this.transport().then((transport) => new RootCommand(transport).execute());
    }

    public trackJdwp(): Bluebird<JdwpTracker> {
        return this.transport().then((transport) => new TrackJdwpCommand(transport).execute());
    }

    public framebuffer(format = 'raw'): Bluebird<FramebufferStreamWithMeta> {
        return this.transport().then((transport) => new FrameBufferCommand(transport).execute(format));
    }

    public screencap(): Bluebird<Duplex> {
        return this.transport().then((transport) =>
            new ScreencapCommand(transport).execute().catch((err) => {
                debug(`Emulating screencap command due to '${err}'`);
                return this.framebuffer('png');
            }),
        );
    }

    public openLocal(path: string): Bluebird<Duplex> {
        return this.transport().then((transport) => new LocalCommand(transport).execute(path));
    }

    public openLog(name: string): Bluebird<Duplex> {
        return this.transport().then((transport) => new LogCommand(transport).execute(name));
    }

    public openTcp(port: number, host?: string): Bluebird<Duplex> {
        return this.transport().then((transport) => new TcpCommand(transport).execute(port, host));
    }

    public openMonkey(port = 1080): Bluebird<Duplex> {
        const tryConnect = (times: number): Bluebird<Duplex> => {
            return this.openTcp(port)
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
        return tryConnect(1).catch(() => {
            return this.transport()
                .then((transport) => new MonkeyCommand(transport).execute(port))
                .then((out) => {
                    return tryConnect(20).then((monkey) => monkey.once('end', () => out.end()));
                });
        });
    }

    public openLogcat(options: { clear?: boolean } = {}): Bluebird<Logcat> {
        return this.transport()
            .then((transport) => new LogcatCommand(transport).execute(options))
            .then((stream) => Logcat.readStream(stream, { fixLineFeeds: false }));
    }

    public openProcStat(): Bluebird<ProcStat> {
        return this.syncService().then((sync) => new ProcStat(sync));
    }

    public clear(pkg: string): Bluebird<boolean> {
        return this.transport().then((transport) => new ClearCommand(transport).execute(pkg));
    }

    public install(apk: string | ReadStream): Bluebird<boolean> {
        const temp = Sync.temp(typeof apk === 'string' ? apk : '_stream.apk');
        return this.push(apk, temp).then((transfer) => {
            let endListener: () => void;
            let errorListener: (err: Error) => void;
            return new Bluebird<boolean>((resolve, reject) => {
                errorListener = (err: Error) => reject(err);
                endListener = () => this.installRemote(temp).then((value: boolean) => resolve(value));
                transfer.on('error', errorListener);
                transfer.on('end', endListener);
            }).finally(() => {
                transfer.removeListener('error', errorListener);
                transfer.removeListener('end', endListener);
            });
        });
    }

    public installRemote(apk: string): Bluebird<boolean> {
        return this.transport().then((transport) => {
            return new InstallCommand(transport)
                .execute(apk)
                .then(() => this.shell(['rm', '-f', apk]))
                .then((stream) => new Parser(stream).readAll())
                .then(() => true);
        });
    }

    public uninstall(pkg: string): Bluebird<boolean> {
        return this.transport().then((transport) => new UninstallCommand(transport).execute(pkg));
    }

    public isInstalled(pkg: string): Bluebird<boolean> {
        return this.transport().then((transport) => new IsInstalledCommand(transport).execute(pkg));
    }

    public startActivity(options: StartActivityOptions): Bluebird<boolean> {
        return this.transport()
            .then((transport) => new StartActivityCommand(transport).execute(options))
            .catch(NoUserOptionError, () => {
                options.user = undefined;
                return this.startActivity(options);
            });
    }

    public startService(options: StartServiceOptions): Bluebird<boolean> {
        return this.transport()
            .then((transport) => {
                if (!(options.user || options.user === null)) {
                    options.user = 0;
                }
                return new StartServiceCommand(transport).execute(options);
            })
            .catch(NoUserOptionError, () => {
                options.user = undefined;
                return this.startService(options);
            });
    }

    public syncService(): Bluebird<Sync> {
        return this.transport().then((transport) => new SyncCommand(transport).execute());
    }

    public stat(path: string): Bluebird<Stats> {
        return this.syncService().then((sync) => sync.stat(path).finally(() => sync.end()));
    }

    public readdir(path: string): Bluebird<Entry[]> {
        return this.syncService().then((sync) => sync.readdir(path).finally(() => sync.end()));
    }

    public pull(path: string): Bluebird<PullTransfer> {
        return this.syncService().then((sync) => sync.pull(path).on('end', () => sync.end()));
    }

    public push(contents: string | ReadStream, path: string, mode?: number): Bluebird<PushTransfer> {
        return this.syncService().then((sync) => sync.push(contents, path, mode).on('end', () => sync.end()));
    }

    public tcpip(port = 5555): Bluebird<number> {
        return this.transport().then((transport) => new TcpIpCommand(transport).execute(port));
    }

    public usb(): Bluebird<boolean> {
        return this.transport().then((transport) => new UsbCommand(transport).execute());
    }

    public waitBootComplete(): Bluebird<boolean> {
        return this.transport().then((transport) => new WaitBootCompleteCommand(transport).execute());
    }

    public waitForDevice(): Bluebird<string> {
        return this.client.connection().then((conn) => new WaitForDeviceCommand(conn).execute(this.serial));
    }
}
