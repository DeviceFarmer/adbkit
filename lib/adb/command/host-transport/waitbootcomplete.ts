import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

class WaitBootCompleteCommand extends Command<boolean> {
	execute(): Bluebird<boolean> {
		this._send('shell:while getprop sys.boot_completed 2>/dev/null; do sleep 1; done');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser
						.searchLine(/^1$/)
						.finally(() => {
							return this.parser.end();
						})
						.then(function () {
							return true;
						});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = WaitBootCompleteCommand;
