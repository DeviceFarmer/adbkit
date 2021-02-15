import Protocol from '../../protocol';
import Command from '../../command';
import Reverse from '../../../Reverse';
import Bluebird from 'bluebird';

export default class ListReversesCommand extends Command<Reverse[]> {
  execute(): Bluebird<Reverse[]> {
    this._send('reverse:list-forward');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readValue().then((value) => {
            return this._parseReverses(value);
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  private _parseReverses(value: Buffer): Reverse[] {
    const reverses: Reverse[] = [];
    const ref = value.toString().split('\n');
    for (let i = 0, len = ref.length; i < len; i++) {
      const reverse = ref[i];
      if (reverse) {
        const [, remote, local] = reverse.split(/\s+/);
        reverses.push({ remote, local });
      }
    }
    return reverses;
  }
}
