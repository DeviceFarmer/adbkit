import Command from '../../command';
import Protocol from '../../protocol';
import PairResult from '../../../PairResult';

// The server pairs in a service thread, so it answers OKAY as soon as that
// thread starts, then sends the outcome:
// - success: "Successfully paired to 192.168.1.5:37000 [guid=adb-...]" as a
//   length-prefixed string
// - failure: a second status, FAIL, and the message, for example
//   "Failed: Unable to start pairing client." (nothing listens on the port),
//   "Failed: Wrong password or connection was dropped." or
//   "Invalid port while parsing address [192.168.1.5]"
// Servers older than platform-tools 30 reply FAIL right away.
const RE_SUCCESS = /^Successfully paired to (\S+)(?: \[guid=([^\]]*)\])?/;
const RE_LENGTH = /^[0-9a-fA-F]{4}$/;

export default class HostPairCommand extends Command<PairResult> {
  execute(host: string, port: number, code: string): Promise<PairResult> {
    this._send(`host:pair:${code}:${host}:${port}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this._readOutcome();
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  private _readOutcome(): Promise<PairResult> {
    return this.parser
      .readAscii(4)
      .then((status) => {
        // Rule out FAIL first: parseInt() would read 'FAIL' as 0xFA.
        if (status === Protocol.FAIL) {
          return this.parser.readError();
        }
        if (status === Protocol.OKAY) {
          return this.parser.readValue();
        }
        if (RE_LENGTH.test(status)) {
          return this.parser.readBytes(Protocol.decodeLength(status));
        }
        return this.parser.unexpected(status, 'FAIL or a length-prefixed reply');
      })
      .then((value) => {
        // The server closes the connection after the reply; end our side too.
        this.connection.end();
        const reply = value.toString();
        const match = RE_SUCCESS.exec(reply);
        if (!match) {
          throw new Error(reply);
        }
        const result: PairResult = { address: match[1], reply };
        if (match[2]) {
          result.guid = match[2];
        }
        return result;
      });
  }
}
