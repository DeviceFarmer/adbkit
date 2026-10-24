import Command from '../../command';
import Protocol from '../../protocol';

// Possible replies:
// "No such device 192.168.2.2:5555"
// ""
// "disconnected 192.168.2.2:5555"

const RE_OK = /^$/;
const RE_DISC = /^disconnected.*$/;

export default class HostDisconnectCommand extends Command<string> {
  execute(host: string, port: number): Promise<string> {
    this._send(`host:disconnect:${host}:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readValue().then(function (value) {
            if (RE_OK.test(value.toString()) || RE_DISC.test(value.toString())) {
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
