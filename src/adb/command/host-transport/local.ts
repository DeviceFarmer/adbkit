import Protocol from '../../protocol';
import Command from '../../command';
import { Duplex } from 'stream';
import Bluebird from 'bluebird';

export default class LocalCommand extends Command<Duplex> {
  execute(path: string): Bluebird<Duplex> {
    this._send(/:/.test(path) ? path : `localfilesystem:${path}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.raw();
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
