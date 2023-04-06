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
import { Duplex, Readable } from 'stream';
import Stats from './sync/stats';
import Entry from './sync/entry';
import PushTransfer from './sync/pushtransfer';
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

  /**
   * Gets the serial number of the device identified by the given serial number. With our API this doesn't really make much sense, but it has been implemented for completeness. _FYI: in the raw ADB protocol you can specify a device in other ways, too._
   *
   * @returns The serial number of the device.
   */
  public getSerialNo(): Bluebird<string> {
    return this.connection().then((conn) => new GetSerialNoCommand(conn).execute(this.serial));
  }

  /**
   * Gets the device path of the device identified by the given serial number.
   * @returns The device path. This corresponds to the device path in `client.listDevicesWithPaths()`.
   */
  public getDevicePath(): Bluebird<DeviceWithPath['path']> {
    return this.connection().then((conn) => new GetDevicePathCommand(conn).execute(this.serial));
  }
  /**
   * Gets the state of the device identified by the given serial number.
   *
   * @returns The device state. This corresponds to the device type in `client.listDevices()`.
   */
  public getState(): Bluebird<string> {
    return this.connection().then((conn) => new GetStateCommand(conn).execute(this.serial));
  }

  /**
   * Retrieves the properties of the device identified by the given serial number. This is analogous to `adb shell getprop`.
   *
   * @returns An object of device properties. Each key corresponds to a device property. Convenient for accessing things like `'ro.product.model'`.
   */
  public getProperties(): Bluebird<Properties> {
    return this.transport().then((transport) => new GetPropertiesCommand(transport).execute());
  }

  /**
   * Retrieves the features of the device identified by the given serial number. This is analogous to `adb shell pm list features`. Useful for checking whether hardware features such as NFC are available (you'd check for `'android.hardware.nfc'`).
   * @param [flags] Flags to pass to the `pm list packages` command to filter the list
   * ```
   * -d: filter to only show disabled packages
   * -e: filter to only show enabled packages
   * -s: filter to only show system packages
   * -3: filter to only show third party packages
   * ```
   * @returns An object of device features. Each key corresponds to a device feature, with the value being either `true` for a boolean feature, or the feature value as a string (e.g. `'0x20000'` for `reqGlEsVersion`).
   */
  public getFeatures(): Bluebird<Features> {
    return this.transport().then((transport) => new GetFeaturesCommand(transport).execute());
  }

  /**
   * Retrieves the list of packages present on the device. This is analogous to `adb shell pm list packages`. If you just want to see if something's installed, consider using `client.isInstalled()` instead.
   *
   * @param flags TODO
   * @returns An object of device features. Each key corresponds to a device feature, with the value being either `true` for a boolean feature, or the feature value as a string (e.g. `'0x20000'` for `reqGlEsVersion`)
   */
  public getPackages(flags?: string): Bluebird<string[]> {
    return this.transport().then((transport) => new GetPackagesCommand(transport).execute(flags));
  }

  /**
   * Attemps to retrieve the IP address of the device. Roughly analogous to `adb shell getprop dhcp.<iface>.ipaddress`.
   *
   * @param [iface] The network interface. Defaults to `'wlan0'`.
   *
   * @returns The IP address as a `String`.
   */
  public getDHCPIpAddress(iface = 'wlan0'): Bluebird<string> {
    return this.getProperties().then((properties) => {
      const ip = properties[`dhcp.${iface}.ipaddress`];
      if (ip) {
        return ip;
      }
      throw Error(`Unable to find ipaddress for '${iface}'`);
    });
  }

  /**
   * Forwards socket connections from the ADB server host (local) to the device (remote). This is analogous to `adb forward <local> <remote>`. It's important to note that if you are connected to a remote ADB server, the forward will be created on that host.
   *
   * @param local A string representing the local endpoint on the ADB host. At time of writing, can be one of:
   * -   `tcp:<port>`
   * -   `localabstract:<unix domain socket name>`
   * -   `localreserved:<unix domain socket name>`
   * -   `localfilesystem:<unix domain socket name>`
   * -   `dev:<character device name>`
   * @param remote A string representing the remote endpoint on the device. At time of writing, can be one of:
   *   Any value accepted by the `local` argument
   *   `jdwp:<process pid>`
   * @returns true
   */
  public forward(local: string, remote: string): Bluebird<boolean> {
    return this.connection().then((conn) => new ForwardCommand(conn).execute(this.serial, local, remote));
  }

  /**
   * Lists forwarded connections on the device. This is analogous to `adb forward --list`.
   *
   * @returns An array of forward objects with the following properties:
   *   -   **serial** The device serial.
   *   -   **local** The local endpoint. Same format as `client.forward()`'s `local` argument.
   *   -   **remote** The remote endpoint on the device. Same format as `client.forward()`'s `remote` argument.
   */
  public listForwards(): Bluebird<Forward[]> {
    return this.connection().then((conn) => new ListForwardsCommand(conn).execute(this.serial));
  }

  /**
   * Reverses socket connections from the device (remote) to the ADB server host (local). This is analogous to `adb reverse <remote> <local>`. It's important to note that if you are connected to a remote ADB server, the reverse will be created on that host.
   * @param remote A string representing the remote endpoint on the device. At time of writing, can be one of:
   * -   `tcp:<port>`
   * -   `localabstract:<unix domain socket name>`
   * -   `localreserved:<unix domain socket name>`
   * -   `localfilesystem:<unix domain socket name>`
   * @param local A string representing the local endpoint on the ADB host. At time of writing, can be any value accepted by the `remote` argument.
   */
  public reverse(remote: string, local: string): Bluebird<boolean> {
    return this.transport().then((transport) => new ReverseCommand(transport).execute(remote, local));
  }
  /**
   * Lists forwarded connections on the device. This is analogous to `adb reverse --list`.
   *
   * @returns An array of Reverse objects with the following properties:
   *  -   **remote** The remote endpoint on the device. Same format as `client.reverse()`'s `remote` argument.
   *  -   **local** The local endpoint on the host. Same format as `client.reverse()`'s `local` argument.
   */
  public listReverses(): Bluebird<Reverse[]> {
    return this.transport().then((transport) => new ListReversesCommand(transport).execute());
  }

  /**
   * return a new connection to ADB.
   */
  private connection(): Bluebird<Connection> {
    return this.client.connection();
  }

  /**
   * return a new connextion to the current Host devices
   */
  public transport(): Bluebird<Connection> {
    return this.connection().then((conn) => new HostTransportCommand(conn).execute(this.serial).return(conn));
  }

  /**
   * Runs a shell command on the device. Note that you'll be limited to the permissions of the `shell` user, which ADB uses.
   *
   * @param command The shell command to execute. When `String`, the command is run as-is. When `Array`, the elements will be rudimentarily escaped (for convenience, not security) and joined to form a command.
   *
   * @returns A readable stream (`Socket` actually) containing the progressive `stdout` of the command. Use with `adb.util.readAll` to get a readable String from it.
   */
  public shell(command: string | ArrayLike<WithToString>): Bluebird<Duplex> {
    return this.transport().then((transport) => new ShellCommand(transport).execute(command));
  }

  /**
   * Puts the device into root mode which may be needed by certain shell commands. A remount is generally required after a successful root call. **Note that this will only work if your device supports this feature. Production devices almost never do.**
   *
   * @return true
   */
  public reboot(): Bluebird<boolean> {
    return this.transport().then((transport) => new RebootCommand(transport).execute());
  }

  /**
   * Attempts to remount the `/system` partition in read-write mode. This will usually only work on emulators and developer devices.
   *
   * @returns true
   */
  public remount(): Bluebird<boolean> {
    return this.transport().then((transport) => new RemountCommand(transport).execute());
  }

  /**
   * Puts the device into root mode which may be needed by certain shell commands. A remount is generally required after a successful root call. **Note that this will only work if your device supports this feature. Production devices almost never do.**
   *
   * @return true
   */
  public root(): Bluebird<boolean> {
    return this.transport().then((transport) => new RootCommand(transport).execute());
  }

  /**
   * Starts a JDWP tracker for the given device.
   *
   * Note that as the tracker will keep a connection open, you must call `tracker.end()` if you wish to stop tracking JDWP processes.
   *
   * @returns The JDWP tracker, which is an [`EventEmitter`][node-events]. The following events are available:
   *  -   **add** **(pid)** Emitted when a new JDWP process becomes available, once per pid.
   *  -   **remove** **(pid)** Emitted when a JDWP process becomes unavailable, once per pid.
   *  -   **changeSet** **(changes, pids)** All changes in a single event.
   *    -   **changes** An object with the following properties always present:
   *      -   **added** An array of pids that were added. Empty if none.
   *      -   **removed** An array of pids that were removed. Empty if none.
   *    -   **pids** All currently active pids (including pids from previous runs).
   *  -   **end** Emitted when the underlying connection ends.
   *  -   **error** **(err)** Emitted if there's an error.
   */
  public trackJdwp(): Bluebird<JdwpTracker> {
    return this.transport().then((transport) => new TrackJdwpCommand(transport).execute());
  }

  /**
   * Fetches the current **raw** framebuffer (i.e. what is visible on the screen) from the device, and optionally converts it into something more usable by using [GraphicsMagick][graphicsmagick]'s `gm` command, which must be available in `$PATH` if conversion is desired. Note that we don't bother supporting really old framebuffer formats such as RGB_565. If for some mysterious reason you happen to run into a `>=2.3` device that uses RGB_565, let us know.
   *
   * Note that high-resolution devices can have quite massive framebuffers. For example, a device with a resolution of 1920x1080 and 32 bit colors would have a roughly 8MB (`1920*1080*4` byte) RGBA framebuffer. Empirical tests point to about 5MB/s bandwidth limit for the ADB USB connection, which means that it can take ~1.6 seconds for the raw data to arrive, or even more if the USB connection is already congested. Using a conversion will further slow down completion.
   *
   * @param format The desired output format. Any output format supported by [GraphicsMagick][graphicsmagick] (such as `'png'`) is supported. Defaults to `'raw'` for raw framebuffer data.
   *
   * @returns The possibly converted framebuffer stream. The stream also has a `meta`.:
   */
  public framebuffer(format = 'raw'): Bluebird<FramebufferStreamWithMeta> {
    return this.transport().then((transport) => new FrameBufferCommand(transport).execute(format));
  }

  /**
   * Takes a screenshot in PNG format using the built-in `screencap` utility. This is analogous to `adb shell screencap -p`. Sadly, the utility is not available on most Android `<=2.3` devices, but a silent fallback to the `client.framebuffer()` command in PNG mode is attempted, so you should have its dependencies installed just in case.
   *
   * Generating the PNG on the device naturally requires considerably more processing time on that side. However, as the data transferred over USB easily decreases by ~95%, and no conversion being required on the host, this method is usually several times faster than using the framebuffer. Naturally, this benefit does not apply if we're forced to fall back to the framebuffer.
   *
   * For convenience purposes, if the screencap command fails (e.g. because it doesn't exist on older Androids), we fall back to `client.framebuffer(serial, 'png')`, which is slower and has additional installation requirements.
   *
   * @return The PNG stream.
   */
  public screencap(): Bluebird<Duplex> {
    return this.transport().then((transport) =>
      new ScreencapCommand(transport).execute().catch((err) => {
        debug(`Emulating screencap command due to '${err}'`);
        return this.framebuffer('png');
      }),
    );
  }

  /**
   * Opens a direct connection to a unix domain socket in the given path.
   *
   * @param path The path to the socket. Prefixed with `'localfilesystem:'` by default, include another prefix (e.g. `'localabstract:'`) in the path to override.
   *
   * @returns The connection (i.e. [`net.Socket`][node-net]). Read and write as you please. Call `conn.end()` to end the connection.
   */
  public openLocal(path: string): Bluebird<Duplex> {
    return this.transport().then((transport) => new LocalCommand(transport).execute(path));
  }

  /**
   * Opens a direct connection to a binary log file, providing access to the raw log data. Note that it is usually much more convenient to use the `client.openLogcat()` method, described separately.
   *
   * @param name The name of the log. Available logs include `'main'`, `'system'`, `'radio'` and `'events'`.
   *
   * @returns The binary log stream. Call `log.end()` when you wish to stop receiving data.
   */
  public openLog(name: string): Bluebird<Duplex> {
    return this.transport().then((transport) => new LogCommand(transport).execute(name));
  }

  /**
     * Opens a direct TCP connection to a port on the device, without any port forwarding required.

     * @param port The port number to connect to.
     * @param host Optional. The host to connect to. Allegedly this is supposed to establish a connection to the given host from the device, but we have not been able to get it to work at all. Skip the host and everything works great.
     *
     * @returns The TCP connection (i.e. [`net.Socket`][node-net]). Read and write as you please. Call `conn.end()` to end the connection.
     */
  public openTcp(port: number, host?: string): Bluebird<Duplex> {
    return this.transport().then((transport) => new TcpCommand(transport).execute(port, host));
  }

  /**
   * Starts the built-in `monkey` utility on the device, connects to it using `client.openTcp()` and hands the connection to [adbkit-monkey][adbkit-monkey], a pure Node.js Monkey client. This allows you to create touch and key events, among other things.
   *
   * For more information, check out the [adbkit-monkey][adbkit-monkey] documentation.
   *
   * @param port Optional. The device port where you'd like Monkey to run at. Defaults to `1080`.
   *
   * @returns The Monkey client. Please see the [adbkit-monkey][adbkit-monkey] documentation for details.
   */
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
        .then((out) => tryConnect(20).then((monkey) => monkey.once('end', () => out.end())));
    });
  }

  /**
   * Calls the `logcat` utility on the device and hands off the connection to [adbkit-logcat][adbkit-logcat], a pure Node.js Logcat client. This is analogous to `adb logcat -B`, but the event stream will be parsed for you and a separate event will be emitted for every log entry, allowing for easy processing.
   *
   * For more information, check out the [adbkit-logcat][adbkit-logcat] documentation.
   *
   * @param options Optional. The following options are supported:
   * -   **clear** When `true`, clears logcat before opening the reader. Not set by default.
   *
   * @returns The Logcat client. Please see the [adbkit-logcat][adbkit-logcat] documentation for details.
   */
  public openLogcat(options: { clear?: boolean } = {}): Bluebird<Logcat> {
    return this.transport()
      .then((transport) => new LogcatCommand(transport).execute(options))
      .then((stream) => Logcat.readStream(stream, { fixLineFeeds: false }));
  }

  /**
   * Tracks `/proc/stat` and emits useful information, such as CPU load. A single sync service instance is used to download the `/proc/stat` file for processing. While doing this does consume some resources, it is very light and should not be a problem.
   *
   * @returns The `/proc/stat` tracker, which is an [`EventEmitter`][node-events]. Call `stat.end()` to stop tracking. The following events are available:
   *   -   **load** **(loads)** Emitted when a CPU load calculation is available.
   *   -   **loads** CPU loads of **online** CPUs. Each key is a CPU id (e.g. `'cpu0'`, `'cpu1'`) and the value an object with the following properties:
   *     -   **user** Percentage (0-100) of ticks spent on user programs.
   *     -   **nice** Percentage (0-100) of ticks spent on `nice`d user programs.
   *     -   **system** Percentage (0-100) of ticks spent on system programs.
   *     -   **idle** Percentage (0-100) of ticks spent idling.
   *     -   **iowait** Percentage (0-100) of ticks spent waiting for IO.
   *     -   **irq** Percentage (0-100) of ticks spent on hardware interrupts.
   *     -   **softirq** Percentage (0-100) of ticks spent on software interrupts.
   *     -   **steal** Percentage (0-100) of ticks stolen by others.
   *     -   **guest** Percentage (0-100) of ticks spent by a guest.
   *     -   **guestnice** Percentage (0-100) of ticks spent by a `nice`d guest.
   *     -   **total** Total. Always 100.
   */
  public openProcStat(): Bluebird<ProcStat> {
    return this.syncService().then((sync) => new ProcStat(sync));
  }

  /**
   * Deletes all data associated with a package from the device. This is roughly analogous to `adb shell pm clear <pkg>`.
   *
   * @param pkg The package name. This is NOT the APK.
   *
   * @returns true
   */
  public clear(pkg: string): Bluebird<boolean> {
    return this.transport().then((transport) => new ClearCommand(transport).execute(pkg));
  }

  /**
   * Installs the APK on the device, replacing any previously installed version. This is roughly analogous to `adb install -r <apk>`.
   *
   * Note that if the call seems to stall, you may have to accept a dialog on the phone first.
   *
   * @param apk When `String`, interpreted as a path to an APK file. When [`Stream`][node-stream], installs directly from the stream, which must be a valid APK.
   * @returns true
   */
  public install(apk: string | Readable): Bluebird<boolean> {
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

  /**
   * Installs an APK file which must already be located on the device file system, and replaces any previously installed version. Useful if you've previously pushed the file to the device for some reason (perhaps to have direct access to `client.push()`'s transfer stats). This is roughly analogous to `adb shell pm install -r <apk>` followed by `adb shell rm -f <apk>`.
   *
   * Note that if the call seems to stall, you may have to accept a dialog on the phone first.
   *
   * @param apk The path to the APK file on the device. The file will be removed when the command completes.
   * @returns true
   */
  public installRemote(apk: string): Bluebird<boolean> {
    return this.transport().then((transport) => {
      return new InstallCommand(transport)
        .execute(apk)
        .finally(() => {
          return this.shell(['rm', '-f', apk]).then((stream) => new Parser(stream).readAll());
        })
        .then(() => true);
    });
  }

  /**
   * Uninstalls the package from the device. This is roughly analogous to `adb uninstall <pkg>`.
   *
   * @param pkg The package name. This is NOT the APK.
   * @returns true
   */
  public uninstall(pkg: string): Bluebird<boolean> {
    return this.transport().then((transport) => new UninstallCommand(transport).execute(pkg));
  }

  /**
   * Tells you if the specific package is installed or not. This is analogous to `adb shell pm path <pkg>` and some output parsing.
   *
   * @param pkg The package name. This is NOT the APK.
   *
   * @returns `true` if the package is installed, `false` otherwise.
   */
  public isInstalled(pkg: string): Bluebird<boolean> {
    return this.transport().then((transport) => new IsInstalledCommand(transport).execute(pkg));
  }

  /**
   * Starts the configured activity on the device. Roughly analogous to `adb shell am start <options>`.
   *
   * @param options The activity configuration.
   */
  public startActivity(options: StartActivityOptions): Bluebird<boolean> {
    return this.transport()
      .then((transport) => new StartActivityCommand(transport).execute(options))
      .catch(NoUserOptionError, () => {
        options.user = undefined;
        return this.startActivity(options);
      });
  }

  /**
   * Starts the configured service on the device. Roughly analogous to `adb shell am startservice <options>`.
   * @param options The activity configuration.
   */
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

  /**
   * Establishes a new Sync connection that can be used to push and pull files. This method provides the most freedom and the best performance for repeated use, but can be a bit cumbersome to use. For simple use cases, consider using `client.stat()`, `client.push()` and `client.pull()`.
   *
   * @returns The Sync client. See below for details. Call `sync.end()` when done.
   */
  public syncService(): Bluebird<Sync> {
    return this.transport().then((transport) => new SyncCommand(transport).execute());
  }

  /**
     * Retrieves information about the given path.
     *
     * @param path The path.
     *
     * @returns An [`fs.Stats`][node-fs-stats] instance. While the `stats.is*` methods are available, only the following properties are supported:
        -   **mode** The raw mode.
        -   **size** The file size.
        -   **mtime** The time of last modification as a `Date`.
     */
  public stat(path: string): Bluebird<Stats> {
    return this.syncService().then((sync) => sync.stat(path).finally(() => sync.end()));
  }

  /**
   * A convenience shortcut for `sync.readdir()`, mainly for one-off use cases. The connection cannot be reused, resulting in poorer performance over multiple calls. However, the Sync client will be closed automatically for you, so that's one less thing to worry about.
   *
   * @param path See `sync.readdir()` for details.
   * @returns Files Lists
   */
  public readdir(path: string): Bluebird<Entry[]> {
    return this.syncService().then((sync) => sync.readdir(path).finally(() => sync.end()));
  }

  /**
   * A convenience shortcut for `sync.pull()`, mainly for one-off use cases. The connection cannot be reused, resulting in poorer performance over multiple calls. However, the Sync client will be closed automatically for you, so that's one less thing to worry about.
   *
   * @param path See `sync.pull()` for details.
   *
   * @returns A `PullTransfer` instance.
   */
  public pull(path: string): Bluebird<PullTransfer> {
    return this.syncService().then((sync) => sync.pull(path).on('end', () => sync.end()));
  }

  /**
   * A convenience shortcut for `sync.push()`, mainly for one-off use cases. The connection cannot be reused, resulting in poorer performance over multiple calls. However, the Sync client will be closed automatically for you, so that's one less thing to worry about.
   *
   * @param contents See `sync.push()` for details.
   * @param path See `sync.push()` for details.
   * @param mode See `sync.push()` for details.
   */
  public push(contents: string | Readable, path: string, mode?: number): Bluebird<PushTransfer> {
    return this.syncService().then((sync) => sync.push(contents, path, mode).on('end', () => sync.end()));
  }

  /**
   * Puts the device's ADB daemon into tcp mode, allowing you to use `adb connect` or `client.connect()` to connect to it. Note that the device will still be visible to ADB as a regular USB-connected device until you unplug it. Same as `adb tcpip <port>`.
   *
   * @param port Optional. The port the device should listen on. Defaults to `5555`.
   * @returns The port the device started listening on.
   */
  public tcpip(port = 5555): Bluebird<number> {
    return this.transport().then((transport) => new TcpIpCommand(transport).execute(port));
  }

  /**
   * Puts the device's ADB daemon back into USB mode. Reverses `client.tcpip()`. Same as `adb usb`.
   *
   * @returns true
   */
  public usb(): Bluebird<boolean> {
    return this.transport().then((transport) => new UsbCommand(transport).execute());
  }

  /**
   * Waits until the device has finished booting. Note that the device must already be seen by ADB. This is roughly analogous to periodically checking `adb shell getprop sys.boot_completed`.
   *
   * @returns true
   */
  public waitBootComplete(): Bluebird<boolean> {
    return this.transport().then((transport) => new WaitBootCompleteCommand(transport).execute());
  }

  /**
   * Waits until ADB can see the device. Note that you must know the serial in advance. Other than that, works like `adb -s serial wait-for-device`. If you're planning on reacting to random devices being plugged in and out, consider using `client.trackDevices()` instead.
   *
   * @returns The device ID. Can be useful for chaining.
   */
  public waitForDevice(): Bluebird<string> {
    return this.connection().then((conn) => new WaitForDeviceCommand(conn).execute(this.serial));
  }
}
