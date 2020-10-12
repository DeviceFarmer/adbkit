import Protocol from '../../protocol';
import Sync from '../../sync';
import Command from '../../command';
import Bluebird from 'bluebird';

class SyncCommand extends Command<Sync> {
	execute(): Bluebird<Sync> {
		this._send('sync:');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return new Sync(this.connection);
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = SyncCommand;
