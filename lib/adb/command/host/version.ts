import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

class HostVersionCommand extends Command<number> {
	execute(): Bluebird<number> {
		this._send('host:version');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readValue().then((value) => {
						return this._parseVersion(value.toString());
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this._parseVersion(reply);
			}
		});
	}

	_parseVersion(version: string): number {
		return parseInt(version, 16);
	}
}

export = HostVersionCommand;
