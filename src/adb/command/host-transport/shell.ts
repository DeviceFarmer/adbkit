import Protocol from '../../protocol';
import Command from '../../command';
import { Duplex } from 'stream';
import Bluebird from 'bluebird';
import WithToString from '../../../WithToString';

export default class ShellCommand extends Command<Duplex> {
  execute(command: string | ArrayLike<WithToString>): Bluebird<Duplex> {
    if (Array.isArray(command)) {
      command = command.map(this._escape).join(' ');
    }
    this._send(`shell:${command}`);
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
