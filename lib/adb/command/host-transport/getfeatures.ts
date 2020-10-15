import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';
import { Features } from '../../../Features';

const RE_FEATURE = /^feature:(.*?)(?:=(.*?))?\r?$/gm;

class GetFeaturesCommand extends Command<Features> {
	execute(): Bluebird<Features> {
		this._send('shell:pm list features 2>/dev/null');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readAll().then((data) => {
						return this._parseFeatures(data.toString());
					});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}

	private _parseFeatures(value): Features {
		const features = {};
		let match;
		while ((match = RE_FEATURE.exec(value))) {
			features[match[1]] = match[2] || true;
		}
		return features;
	}
}

export = GetFeaturesCommand;
