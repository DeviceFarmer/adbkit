import Bluebird from 'bluebird';
import Parser from './parser';
import { EventEmitter } from 'events';
import Device from '../Device';
import HostDevicesCommand from './command/host/devices';
import HostDevicesWithPathsCommand from './command/host/deviceswithpaths';
import TrackerChangeSet from '../TrackerChangeSet';

export default class Tracker extends EventEmitter {
  private deviceList: Device[] = [];
  private deviceMap: Record<string, Device> = {};
  private reader: Bluebird<boolean | Device[]>;

  constructor(private readonly command: HostDevicesCommand | HostDevicesWithPathsCommand) {
    super();
    this.reader = this.read()
      .catch(Bluebird.CancellationError, () => true)
      .catch(Parser.PrematureEOFError, () => {
        throw new Error('Connection closed');
      })
      .catch((err) => this.emit('error', err))
      .finally(() => {
        this.command.parser.end().then(() => this.emit('end'));
      });
  }

  public read(): Bluebird<Device[]> {
    return this.command._readDevices().then((list) => {
      this.update(list);
      return this.read();
    });
  }

  public update(newList: Device[]): Tracker {
    const changeSet: TrackerChangeSet = {
      removed: [],
      changed: [],
      added: [],
    };
    const newMap: Record<string, Device> = {};
    for (let i = 0, len = newList.length; i < len; i++) {
      const device = newList[i];
      const oldDevice = this.deviceMap[device.id];
      if (oldDevice) {
        if (oldDevice.type !== device.type) {
          changeSet.changed.push(device);
          this.emit('change', device, oldDevice);
        }
      } else {
        changeSet.added.push(device);
        this.emit('add', device);
      }
      newMap[device.id] = device;
    }
    const ref = this.deviceList;
    for (let i = 0, len = ref.length; i < len; i++) {
      const device = ref[i];
      if (!newMap[device.id]) {
        changeSet.removed.push(device);
        this.emit('remove', device);
      }
    }
    this.emit('changeSet', changeSet);
    this.deviceList = newList;
    this.deviceMap = newMap;
    return this;
  }

  public end(): Tracker {
    this.reader.cancel();
    return this;
  }
}
