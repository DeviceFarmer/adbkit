import Bluebird from 'bluebird';
import Protocol from '../../protocol';
import Command from '../../command';
import JdwpTracker from '../../jdwptracker';

class TrackJdwpCommand extends Command<JdwpTracker> {
	execute(): Bluebird<JdwpTracker> {
		this._send('track-jdwp');
		return this.parser.readAscii(4).then((reply) => {
			switch (reply) {
				case Protocol.OKAY:
					return new JdwpTracker(this);
				case Protocol.FAIL:
					return this.parser.readError();
				default:
					return this.parser.unexpected(reply, 'OKAY or FAIL');
			}
		});
	}
}

export = TrackJdwpCommand;
