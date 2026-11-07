import Protocol from '../../protocol';
import Command from '../../command';
import { checkRestartReply } from './restartreply';

export default class UsbCommand extends Command<boolean> {
  execute(): Promise<boolean> {
    this._send('usb:');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(function (value) {
            checkRestartReply(value);
            return true;
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
