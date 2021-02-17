import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

export default class WaitForDeviceCommand extends Command<string> {
  execute(serial: string): Bluebird<string> {
    this._send(`host-serial:${serial}:wait-for-any-device`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
              case Protocol.OKAY:
                return serial;
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
