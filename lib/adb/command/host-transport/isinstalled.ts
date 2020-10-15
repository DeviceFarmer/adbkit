import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';
import Bluebird from 'bluebird';

class IsInstalledCommand extends Command<boolean> {
	execute(pkg: string): Bluebird<boolean> {
		this._send(`shell:pm path ${pkg} 2>/dev/null`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser
						.readAscii(8)
						.then((reply) => {
							switch (reply) {
								case 'package:':
									return true;
								default:
									return this.parser.unexpected(reply, "'package:'");
							}
						})
						.catch(Parser.PrematureEOFError, function () {
							return false;
						});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = IsInstalledCommand;
