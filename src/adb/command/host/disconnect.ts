import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

// Possible replies:
// "No such device 192.168.2.2:5555"
// ""
const RE_OK = /^$/;

export default class HostDisconnectCommand extends Command<string> {
  execute(host: string, port: number): Bluebird<string> {
    this._send(`host:disconnect:${host}:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readValue().then(function (value) {
            if (RE_OK.test(value.toString())) {
              return `${host}:${port}`;
            } else {
              throw new Error(value.toString());
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
