import Protocol from '../../protocol';
import Command from '../../command';

export default class ReverseCommand extends Command<boolean> {
  execute(remote: string, local: string): Promise<boolean> {
    this._send(`reverse:forward:${remote};${local}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
              case Protocol.OKAY:
                // A new tcp: reverse is followed by the port the device bound.
                // Read it to the end, so that the socket can close.
                return this.parser.readAll().then(() => true);
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
