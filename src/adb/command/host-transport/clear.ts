import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

export default class ClearCommand extends Command<boolean> {
  execute(pkg: string): Bluebird<boolean> {
    this._send(`shell:pm clear ${pkg}`);
    return this.parser.readAscii(4).then((reply: string) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser
            .searchLine(/^(Success|Failed)$/)
            .finally(() => {
              return this.parser.end();
            })
            .then(function (result) {
              switch (result[0]) {
                case 'Success':
                  return true;
                case 'Failed':
                  // Unfortunately, the command may stall at this point and we
                  // have to kill the connection.
                  throw new Error(`Package '${pkg}' could not be cleared`);
              }
              return false;
            });
        case Protocol.FAIL:
          return this.parser.readError() as Promise<boolean>;
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL') as Promise<boolean>;
      }
    });
  }
}
