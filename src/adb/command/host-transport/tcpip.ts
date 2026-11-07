import Protocol from '../../protocol';
import Command from '../../command';
import { checkRestartReply } from './restartreply';

export default class TcpIpCommand extends Command<number> {
  execute(port: number): Promise<number> {
    this._send(`tcpip:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(function (value) {
            checkRestartReply(value);
            return port;
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
