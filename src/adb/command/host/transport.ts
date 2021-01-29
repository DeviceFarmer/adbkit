import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

export default class HostTransportCommand extends Command<boolean> {
  execute(serial: string): Bluebird<boolean> {
    this._send(`host:transport:${serial}`);
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
  }
}
