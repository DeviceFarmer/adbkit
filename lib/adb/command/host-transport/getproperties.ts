import Protocol from '../../protocol';
import Command from '../../command';
import * as Bluebird from 'bluebird';
import { Properties } from '../../../Properties';

const RE_KEYVAL = /^\[([\s\S]*?)\]: \[([\s\S]*?)\]\r?$/gm;

class GetPropertiesCommand extends Command<Properties> {
	execute(): Bluebird<Properties> {
		this._send('shell:getprop');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readAll().then((data) => {
						return this._parseProperties(data.toString());
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	private _parseProperties(value: string): Properties {
		const properties = {};
		let match;
		while ((match = RE_KEYVAL.exec(value))) {
			properties[match[1]] = match[2];
		}
		return properties;
	}
}

export = GetPropertiesCommand;
