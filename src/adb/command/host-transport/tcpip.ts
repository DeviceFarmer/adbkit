import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

const RE_OK = /restarting in/;

export default class TcpIpCommand extends Command<number> {
  execute(port: number): Bluebird<number> {
    this._send(`tcpip:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(function (value) {
            if (RE_OK.test(value.toString())) {
              return port;
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
