import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

// Possible replies:
// "unable to connect to 192.168.2.2:5555"
// "connected to 192.168.2.2:5555"
// "already connected to 192.168.2.2:5555"
const RE_OK = /connected to|already connected/;

class ConnectCommand extends Command<string> {
	execute(host: string, port: number): Bluebird<string> {
		this._send(`host:connect:${host}:${port}`);
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return this.parser.readValue().then(function (value) {
						if (RE_OK.test(value.toString())) {
							return `${host}:${port}`;
						} else {
							throw new Error(value.toString());
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

export = ConnectCommand;
