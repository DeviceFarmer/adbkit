import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

class KillForwardCommand extends Command<boolean> {
	execute(serial: string, local: string): Bluebird<boolean> {
		this._send(`host-serial:${serial}:killforward:${local}`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readAscii(4).then((reply) => {
						switch (reply) {
							case Protocol.OKAY:
								return true;
							case Protocol.FAIL:
								return this.parser.readError();
							default:
								return this.parser.unexpected(reply, 'OKAY or FAIL');
						}
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = KillForwardCommand;
