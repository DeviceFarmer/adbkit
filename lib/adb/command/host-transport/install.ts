import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

class InstallCommand extends Command<boolean> {
	execute(apk: string): Bluebird<boolean> {
		this._send(`shell:pm install -r ${this._escapeCompat(apk)}`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser
						.searchLine(/^(Success|Failure \[(.*?)\])$/)
						.then(function (match) {
							let code, err;
							if (match[1] === 'Success') {
								return true;
							} else {
								code = match[2];
								err = new Error(`${apk} could not be installed [${code}]`);
								err.code = code;
								throw err;
							}
						})
						.finally(() => {
							// Consume all remaining content to "naturally" close the
							// connection.
							return this.parser.readAll();
						});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = InstallCommand;
