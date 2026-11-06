import Command from '../../command';
import Protocol from '../../protocol';
import DeviceWithPath from '../../../DeviceWithPath';

export default class HostDevicesWithPathsCommand extends Command<DeviceWithPath[]> {
  execute(): Promise<DeviceWithPath[]> {
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

  public _readDevices(): Promise<DeviceWithPath[]> {
    return this.parser.readValue().then(this._parseDevices);
  }

  private _parseDevices(value: Buffer): DeviceWithPath[] {
    return value
      .toString('ascii')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
      .map(parseDevice);
  }
}

// The key:value fields adb may print after the state, in any order, each
// only when known: `usb:` (the device path, missing for emulators, network
// devices and on Windows), `product:`, `model:`, `device:` and
// `transport_id:`.
const FIELD = /^(usb|product|model|device|transport_id):(.*)$/;

function parseDevice(line: string): DeviceWithPath {
  // The columns are separated by spaces instead of tabs. The state can
  // contain spaces too, e.g. "no permissions (...); see [http://...]".
  const [id, ...tokens] = line.split(/\s+/);
  const state: string[] = [];
  const fields: Record<string, string> = {};
  for (const token of tokens) {
    const field = state.length > 0 ? FIELD.exec(token) : null;
    if (field) {
      fields[field[1]] = field[2];
    } else if (Object.keys(fields).length === 0) {
      state.push(token);
    }
  }
  return {
    id,
    type: state.join(' ') as DeviceWithPath['type'],
    path: fields.usb === undefined ? undefined : `usb:${fields.usb}`,
    product: fields.product,
    model: fields.model,
    device: fields.device,
    transportId: fields.transport_id,
  };
}
