import Protocol from '../../protocol';
import Command from '../../command';

const RE_OK = /restarting in/;

export default class TcpIpCommand extends Command<number> {
  execute(port: number): Promise<number> {
    this._send(`tcpip:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(function (value) {
            const output = value.toString().trim();
            // adbd restarts right after writing its message, and the message
            // sometimes doesn't make it, although the switch happened. adb
            // itself ignores the output, so no output counts as success too.
            if (output === '' || RE_OK.test(output)) {
              return port;
            } else {
              throw new Error(output);
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
