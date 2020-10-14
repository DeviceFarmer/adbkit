import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

const RE_PACKAGE = /^package:(.*?)\r?$/gm;

class GetPackagesCommand extends Command<string[]> {
	execute(): Bluebird<string[]> {
		this._send('shell:pm list packages 2>/dev/null');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readAll().then((data) => {
						return this._parsePackages(data.toString());
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	private _parsePackages(value): string[] {
		const packages = [];
		let match;
		while ((match = RE_PACKAGE.exec(value))) {
			packages.push(match[1]);
		}
		return packages;
	}
}

export = GetPackagesCommand;
