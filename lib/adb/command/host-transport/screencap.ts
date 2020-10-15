import LineTransform from '../../linetransform';
import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';
import Bluebird from 'bluebird';
import { Duplex } from 'stream';

class ScreencapCommand extends Command<Duplex> {
	execute(): Bluebird<Duplex> {
		this._send('shell:echo && screencap -p 2>/dev/null');
		return this.parser.readAscii(4).then((reply) => {
			let transform;
			switch (reply) {
				case Protocol.OKAY:
					transform = new LineTransform();
					return this.parser
						.readBytes(1)
						.then((chunk) => {
							transform = new LineTransform({
								autoDetect: true,
							});
							transform.write(chunk);
							return this.parser.raw().pipe(transform);
						})
						.catch(Parser.PrematureEOFError, function () {
							throw new Error('No support for the screencap command');
						});
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = ScreencapCommand;
