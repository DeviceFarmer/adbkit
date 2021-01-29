import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

export default class RebootCommand extends Command<boolean> {
  execute(): Bluebird<boolean> {
    this._send('reboot:');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().return(true);
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
