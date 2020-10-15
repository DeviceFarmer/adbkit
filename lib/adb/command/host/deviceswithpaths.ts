import Command from '../../command';
import Protocol from '../../protocol';
import { DeviceWithPath } from '../../../DeviceWithPath';
import Bluebird from 'bluebird';

class HostDevicesWithPathsCommand extends Command<DeviceWithPath[]> {
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
		return this.parser.readValue().then((value) => {
			return this._parseDevices(value);
		});
	}

	private _parseDevices(value: Buffer): DeviceWithPath[] {
		let device, i, id, len, line, model, path, product, transportId, type;
		const devices: DeviceWithPath[] = [];
		if (!value.length) {
			return devices;
		}
		const ref = value.toString('ascii').split('\n');
		for (i = 0, len = ref.length; i < len; i++) {
			line = ref[i];
			if (line) {
				// For some reason, the columns are separated by spaces instead of tabs
				[id, type, path, product, model, device, transportId] = line.split(/\s+/);
				devices.push({
					id: id,
					type: type,
					path: path,
					product: product,
					model: model,
					device: device,
					transportId: transportId,
				});
			}
		}
		return devices;
	}
}

export = HostDevicesWithPathsCommand;
