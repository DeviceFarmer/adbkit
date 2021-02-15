import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

export default class ForwardCommand extends Command<boolean> {
  execute(serial: string, local: string, remote: string): Bluebird<boolean> {
    this._send(`host-serial:${serial}:forward:${local};${remote}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
              case Protocol.OKAY:
                return true;
              case Protocol.FAIL:
                return this.parser.readError();
              default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
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
