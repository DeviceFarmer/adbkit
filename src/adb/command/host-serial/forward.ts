import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

export default class ForwardCommand extends Command<number> {
  execute(serial: string, local: string, remote: string): Bluebird<number> {
    this._send(`host-serial:${serial}:forward:${local};${remote}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
              case Protocol.OKAY:
                return this.parser.readValue().then((buffer) => {
                  return Number(buffer.toString());
                }).catch(_ => 0);
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
