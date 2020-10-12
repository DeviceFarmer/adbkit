import Protocol from '../../protocol';
import Command from '../../command';
import { Reverse } from '../../../Reverse';
import Bluebird from 'bluebird';

class ListReversesCommand extends Command<Reverse[]> {
	execute(): Bluebird<Reverse[]> {
		this._send('reverse:list-forward');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readValue().then((value) => {
						return this._parseReverses(value);
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	private _parseReverses(value: Buffer): Reverse[] {
		let i, len, local, remote;
		const reverses = [];
		const ref = value.toString().split('\n');
		for (i = 0, len = ref.length; i < len; i++) {
			const reverse = ref[i];
			if (reverse) {
				[, remote, local] = reverse.split(/\s+/);
				reverses.push({
					remote: remote,
					local: local,
				});
			}
		}
		return reverses;
	}
}

export = ListReversesCommand;
