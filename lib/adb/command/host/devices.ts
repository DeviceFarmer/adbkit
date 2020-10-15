import Command from '../../command';
import Protocol from '../../protocol';
import { Device } from '../../../Device';
import Bluebird from 'bluebird';

class HostDevicesCommand extends Command<Device[]> {
	execute(): Bluebird<Device[]> {
		this._send('host:devices');
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

	public _readDevices(): Bluebird<Device[]> {
		return this.parser.readValue().then((value) => {
			return this._parseDevices(value);
		});
	}

	_parseDevices(value: Buffer): Device[] {
		let i, id, len, line, type;
		const devices: Device[] = [];
		if (!value.length) {
			return devices;
		}
		const ref = value.toString('ascii').split('\n');
		for (i = 0, len = ref.length; i < len; i++) {
			line = ref[i];
			if (line) {
				[id, type] = line.split('\t');
				devices.push({
					id: id,
					type: type,
				});
			}
		}
		return devices;
	}
}

export = HostDevicesCommand;
