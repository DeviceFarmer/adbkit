import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

export default class GetSerialNoCommand extends Command<string> {
  execute(serial: string): Bluebird<string> {
    this._send(`host-serial:${serial}:get-serialno`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readValue().then((value) => value.toString());
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
