import Protocol from '../../protocol';
import Command from '../../command';
import { Duplex } from 'stream';
import Bluebird from 'bluebird';

class LogCommand extends Command<Duplex> {
	execute(name: string): Bluebird<Duplex> {
		this._send(`log:${name}`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.raw();
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = LogCommand;
