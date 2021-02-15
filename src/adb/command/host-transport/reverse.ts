import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

export default class ReverseCommand extends Command<boolean> {
  execute(remote: string, local: string): Bluebird<boolean> {
    this._send(`reverse:forward:${remote};${local}`);
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
