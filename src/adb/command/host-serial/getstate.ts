import Command from '../../command';
import Protocol from '../../protocol';

export default class GetStateCommand extends Command<string> {
  execute(serial: string): Promise<string> {
    this._send(`host-serial:${serial}:get-state`);
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
