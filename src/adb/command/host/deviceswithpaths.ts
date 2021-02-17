import Command from '../../command';
import Protocol from '../../protocol';
import DeviceWithPath from '../../../DeviceWithPath';
import Bluebird from 'bluebird';

export default class HostDevicesWithPathsCommand extends Command<DeviceWithPath[]> {
  execute(): Bluebird<DeviceWithPath[]> {
    this._send('host:devices-l');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this._readDevices();
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  public _readDevices(): Bluebird<DeviceWithPath[]> {
    return this.parser.readValue().then(this._parseDevices);
  }

  private _parseDevices(value: Buffer): DeviceWithPath[] {
    return value
      .toString('ascii')
      .split('\n')
      .filter((e) => e)
      .map((line) => {
        // For some reason, the columns are separated by spaces instead of tabs
        const [id, type, path, product, model, device, transportId] = line.split(/\s+/);
        return {
          id,
          type: type as 'emulator' | 'device' | 'offline',
          path,
          product,
          model,
          device,
          transportId,
        };
      });
  }
}
