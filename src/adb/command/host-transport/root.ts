import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

const RE_OK = /restarting adbd as root/;

export default class RootCommand extends Command<boolean> {
  execute(): Bluebird<boolean> {
    this._send('root:');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(function (value) {
            if (RE_OK.test(value.toString())) {
              return true;
            } else {
              throw new Error(value.toString().trim());
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
