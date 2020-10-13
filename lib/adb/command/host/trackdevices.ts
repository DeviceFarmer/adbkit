import Protocol from '../../protocol';
import Tracker from '../../tracker';
import HostDevicesCommand from './devices';
import Bluebird from 'bluebird';

class HostTrackDevicesCommand extends HostDevicesCommand {
	execute(): Bluebird<any> {
		this._send('host:track-devices');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return new Tracker(this);
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = HostTrackDevicesCommand;
