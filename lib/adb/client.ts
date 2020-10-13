import { EventEmitter } from 'events';
import Monkey from '@devicefarmer/adbkit-monkey';
import Logcat from '@devicefarmer/adbkit-logcat';
import Connection from './connection';
import Sync from './sync';
import Parser from './parser';
import ProcStat from './proc/stat';
import HostVersionCommand from './command/host/version';
import HostConnectCommand from './command/host/connect';
import HostDevicesCommand from './command/host/devices';
import HostDevicesWithPathsCommand from './command/host/deviceswithpaths';
import HostDisconnectCommand from './command/host/disconnect';
import HostTrackDevicesCommand from './command/host/trackdevices';
import HostKillCommand from './command/host/kill';
import HostTransportCommand from './command/host/transport';
import ClearCommand from './command/host-transport/clear';
import FrameBufferCommand from './command/host-transport/framebuffer';
import GetFeaturesCommand from './command/host-transport/getfeatures';
import GetPackagesCommand from './command/host-transport/getpackages';
import GetPropertiesCommand from './command/host-transport/getproperties';
import InstallCommand from './command/host-transport/install';
import IsInstalledCommand from './command/host-transport/isinstalled';
import ListReversesCommand from './command/host-transport/listreverses';
import LocalCommand from './command/host-transport/local';
import LogcatCommand from './command/host-transport/logcat';
import LogCommand from './command/host-transport/log';
import MonkeyCommand from './command/host-transport/monkey';
import RebootCommand from './command/host-transport/reboot';
import RemountCommand from './command/host-transport/remount';
import RootCommand from './command/host-transport/root';
import ReverseCommand from './command/host-transport/reverse';
import ScreencapCommand from './command/host-transport/screencap';
import ShellCommand from './command/host-transport/shell';
import StartActivityCommand from './command/host-transport/startactivity';
import StartServiceCommand from './command/host-transport/startservice';
import SyncCommand from './command/host-transport/sync';
import TcpCommand from './command/host-transport/tcp';
import TcpIpCommand from './command/host-transport/tcpip';
import TrackJdwpCommand from './command/host-transport/trackjdwp';
import UninstallCommand from './command/host-transport/uninstall';
import UsbCommand from './command/host-transport/usb';
import WaitBootCompleteCommand from './command/host-transport/waitbootcomplete';
import ForwardCommand from './command/host-serial/forward';
import GetDevicePathCommand from './command/host-serial/getdevicepath';
import GetSerialNoCommand from './command/host-serial/getserialno';
import GetStateCommand from './command/host-serial/getstate';
import ListForwardsCommand from './command/host-serial/listforwards';
import WaitForDeviceCommand from './command/host-serial/waitfordevice';
import TcpUsbServer from './tcpusb/server';
import d from 'debug';
import { Callback } from '../Callback';
import { Device } from '../Device';
import { Forward } from '../Forward';
import { Reverse } from '../Reverse';
import { StartActivityOptions } from '../StartActivityOptions';
import { StartServiceOptions } from '../StartServiceOptions';
import Bluebird from 'bluebird';
import { ClientOptions } from '../ClientOptions';
import { Duplex } from 'stream';
import { SocketOptions } from '../SocketOptions';
import Stats from './sync/stats';
import Entry from './sync/entry';
import PushTransfer from './sync/pushtransfer';
import { ReadStream } from 'fs';
import PullTransfer from './sync/pulltransfer';
import { Properties } from '../Properties';
import { Features } from '../Features';
import { FramebufferStreamWithMeta } from '../FramebufferStreamWithMeta';
import { WithToString } from '../WithToString';
import Tracker from './tracker';
import JdwpTracker from './jdwptracker';
import { DeviceWithPath } from '../DeviceWithPath';

const debug = d('adb:client');

function NoUserOptionError(err) {
	return err.message.indexOf('--user') !== -1;
}

class Client extends EventEmitter {
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
		connection.on('error', (err) => {
			return this.emit('error', err);
		});
		return connection.connect();
	}

	public version(callback?: Callback<number>): Bluebird<number> {
		return this.connection()
			.then(function (conn) {
				return new HostVersionCommand(conn).execute();
			})
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
			.then(function (conn) {
				return new HostConnectCommand(conn).execute(host, p);
			})
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
			.then(function (conn) {
				return new HostDisconnectCommand(conn).execute(host, p);
			})
			.nodeify(callback);
	}

	public listDevices(callback?: Callback<Device[]>): Bluebird<Device[]> {
		return this.connection()
			.then(function (conn) {
				return new HostDevicesCommand(conn).execute();
			})
			.nodeify(callback);
	}

	public listDevicesWithPaths(callback?: Callback<DeviceWithPath[]>): Bluebird<DeviceWithPath[]> {
		return this.connection()
			.then(function (conn) {
				return new HostDevicesWithPathsCommand(conn).execute();
			})
			.nodeify(callback);
	}

	public trackDevices(callback?: Callback<Tracker>): Bluebird<Tracker> {
		return this.connection()
			.then(function (conn) {
				return new HostTrackDevicesCommand(conn).execute();
			})
			.nodeify(callback);
	}

	public kill(callback?: Callback<boolean>): Bluebird<boolean> {
		return this.connection()
			.then(function (conn) {
				return new HostKillCommand(conn).execute();
			})
			.nodeify(callback);
	}

	public getSerialNo(serial: string, callback?: Callback<string>): Bluebird<string> {
		return this.connection()
			.then(function (conn) {
				return new GetSerialNoCommand(conn).execute(serial);
			})
			.nodeify(callback);
	}

	public getDevicePath(serial: string, callback?: Callback<DeviceWithPath['path']>): Bluebird<DeviceWithPath['path']> {
		return this.connection()
			.then(function (conn) {
				return new GetDevicePathCommand(conn).execute(serial);
			})
			.nodeify(callback);
	}

	public getState(serial: string, callback?: Callback<string>): Bluebird<string> {
		return this.connection()
			.then(function (conn) {
				return new GetStateCommand(conn).execute(serial);
			})
			.nodeify(callback);
	}

	public getProperties(serial: string, callback?: Callback<Properties>): Bluebird<Properties> {
		return this.transport(serial)
			.then(function (transport) {
				return new GetPropertiesCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public getFeatures(serial: string, callback?: Callback<Features>): Bluebird<Features> {
		return this.transport(serial)
			.then(function (transport) {
				return new GetFeaturesCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public getPackages(serial: string, callback?: Callback<string[]>): Bluebird<string[]> {
		return this.transport(serial)
			.then(function (transport) {
				return new GetPackagesCommand(transport).execute();
			})
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
			.then(function (properties) {
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
			.then(function (conn) {
				return new ForwardCommand(conn).execute(serial, local, remote);
			})
			.nodeify(callback);
	}

	public listForwards(serial: string, callback?: Callback<Forward[]>): Bluebird<Forward[]> {
		return this.connection()
			.then(function (conn) {
				return new ListForwardsCommand(conn).execute(serial);
			})
			.nodeify(callback);
	}

	public reverse(serial: string, remote: string, local: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial).then(function (transport) {
			return new ReverseCommand(transport).execute(remote, local).nodeify(callback);
		});
	}

	public listReverses(serial: string, callback?: Callback<Reverse[]>): Bluebird<Reverse[]> {
		return this.transport(serial)
			.then(function (transport) {
				return new ListReversesCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public transport(serial: string, callback?: Callback<Connection>): Bluebird<Connection> {
		return this.connection()
			.then(function (conn) {
				return new HostTransportCommand(conn).execute(serial).return(conn);
			})
			.nodeify(callback);
	}

	public shell(
		serial: string,
		command: string | ArrayLike<WithToString>,
		callback?: Callback<Duplex>,
	): Bluebird<Duplex> {
		return this.transport(serial)
			.then(function (transport) {
				return new ShellCommand(transport).execute(command);
			})
			.nodeify(callback);
	}

	public reboot(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new RebootCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public remount(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new RemountCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public root(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new RootCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public trackJdwp(serial: string, callback?: Callback<JdwpTracker>): Bluebird<JdwpTracker> {
		return this.transport(serial)
			.then(function (transport) {
				return new TrackJdwpCommand(transport).execute();
			})
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
			.then(function (transport) {
				return new FrameBufferCommand(transport).execute(f);
			})
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
			.then(function (transport) {
				return new LocalCommand(transport).execute(path);
			})
			.nodeify(callback);
	}

	public openLog(serial: string, name: string, callback?: Callback<Duplex>): Bluebird<Duplex> {
		return this.transport(serial)
			.then(function (transport) {
				return new LogCommand(transport).execute(name);
			})
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
			.then(function (transport) {
				return new TcpCommand(transport).execute(port, h);
			})
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
		const tryConnect = (times) => {
			return this.openTcp(serial, p)
				.then(function (stream) {
					return Monkey.connectStream(stream);
				})
				.catch(function (err) {
					if ((times -= 1)) {
						debug(`Monkey can't be reached, trying ${times} more times`);
						return Bluebird.delay(100).then(function () {
							return tryConnect(times);
						});
					} else {
						throw err;
					}
				});
		};
		return tryConnect(1)
			.catch(() => {
				return this.transport(serial)
					.then(function (transport) {
						return new MonkeyCommand(transport).execute(p);
					})
					.then(function (out) {
						return tryConnect(20).then(function (monkey) {
							return monkey.once('end', function () {
								return out.end();
							});
						});
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
			.then(function (transport) {
				return new LogcatCommand(transport).execute(opts);
			})
			.then(function (stream) {
				return Logcat.readStream(stream, {
					fixLineFeeds: false,
				});
			})
			.nodeify(callback);
	}

	public openProcStat(serial: string, callback?: Callback<ProcStat>): Bluebird<ProcStat> {
		return this.syncService(serial)
			.then(function (sync) {
				return new ProcStat(sync);
			})
			.nodeify(callback);
	}

	public clear(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new ClearCommand(transport).execute(pkg);
			})
			.nodeify(callback);
	}

	public install(serial: string, apk: string, callback?: Callback<boolean>): Bluebird<boolean> {
		const temp = Sync.temp(typeof apk === 'string' ? apk : '_stream.apk');
		return this.push(serial, apk, temp)
			.then((transfer) => {
				let endListener, errorListener;
				const resolver = Bluebird.defer<boolean>();
				transfer.on(
					'error',
					(errorListener = function (err) {
						return resolver.reject(err);
					}),
				);
				transfer.on(
					'end',
					(endListener = () => {
						this.installRemote(serial, temp).then((value: boolean) => {
							return resolver.resolve(value);
						});
					}),
				);
				return resolver.promise.finally(function () {
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
					.then(() => {
						return this.shell(serial, ['rm', '-f', apk]);
					})
					.then(function (stream) {
						return new Parser(stream).readAll();
					})
					.then(function () {
						return true;
					});
			})
			.nodeify(callback);
	}

	public uninstall(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new UninstallCommand(transport).execute(pkg);
			})
			.nodeify(callback);
	}

	public isInstalled(serial: string, pkg: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new IsInstalledCommand(transport).execute(pkg);
			})
			.nodeify(callback);
	}

	public startActivity(serial: string, options: StartActivityOptions, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new StartActivityCommand(transport).execute(options);
			})
			.catch(NoUserOptionError, () => {
				options.user = null;
				return this.startActivity(serial, options);
			})
			.nodeify(callback);
	}

	public startService(serial: string, options: StartServiceOptions, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
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
			.then(function (transport) {
				return new SyncCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public stat(serial: string, path: string, callback?: Callback<Stats>): Bluebird<Stats> {
		return this.syncService(serial)
			.then(function (sync) {
				return sync.stat(path).finally(function () {
					return sync.end();
				});
			})
			.nodeify(callback);
	}

	public readdir(serial: string, path: string, callback?: Callback<Entry[]>): Bluebird<Entry[]> {
		return this.syncService(serial)
			.then(function (sync) {
				return sync.readdir(path).finally(function () {
					return sync.end();
				});
			})
			.nodeify(callback);
	}

	public pull(serial: string, path: string, callback?: Callback<PullTransfer>): Bluebird<PullTransfer> {
		return this.syncService(serial)
			.then(function (sync) {
				return sync.pull(path).on('end', function () {
					return sync.end();
				});
			})
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
			.then(function (sync) {
				return sync.push(contents, path, m).on('end', function () {
					return sync.end();
				});
			})
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
			.then(function (transport) {
				return new TcpIpCommand(transport).execute(p);
			})
			.nodeify(callback);
	}

	public usb(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new UsbCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public waitBootComplete(serial: string, callback?: Callback<boolean>): Bluebird<boolean> {
		return this.transport(serial)
			.then(function (transport) {
				return new WaitBootCompleteCommand(transport).execute();
			})
			.nodeify(callback);
	}

	public waitForDevice(serial: string, callback?: Callback<string>): Bluebird<string> {
		return this.connection()
			.then(function (conn) {
				return new WaitForDeviceCommand(conn).execute(serial);
			})
			.nodeify(callback);
	}
}

export = Client;
