import Command from '../../command';
import Protocol from '../../protocol';
import { Forward } from '../../../Forward';
import Bluebird from 'bluebird';

class ListForwardsCommand extends Command<Forward[]> {
	execute(serial: string): Bluebird<Forward[]> {
		this._send(`host-serial:${serial}:list-forward`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readValue().then((value) => {
						return this._parseForwards(value);
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	private _parseForwards(value): Forward[] {
		let forward, i, len, local, remote, serial;
		const forwards: Forward[] = [];
		const ref = value.toString().split('\n');
		for (i = 0, len = ref.length; i < len; i++) {
			forward = ref[i];
			if (forward) {
				[serial, local, remote] = forward.split(/\s+/);
				forwards.push({
					serial: serial,
					local: local,
					remote: remote,
				});
			}
		}
		return forwards;
	}
}

export = ListForwardsCommand;
