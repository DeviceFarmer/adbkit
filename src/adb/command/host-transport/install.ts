import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';

const OKAY_OUTPUT_REGEXP = /^(Success|Failure \[(.*?)\]|Exception)(.*)$/;
const INSTALL_EXCEPTION_CODE = 'INSTALL_EXCEPTION';

class InstallError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export default class InstallCommand extends Command<boolean> {
  execute(apk: string): Bluebird<boolean> {
    this._send(`shell:pm install -r ${this._escapeCompat(apk)}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser
            .searchLine(OKAY_OUTPUT_REGEXP)
            .then((match) => {
              if (match[1] === 'Success') {
                return true;
              } else if (match[1] === 'Exception') {
                return this.parser.readLine().then((buffer: Buffer) => {
                  throw new InstallError(buffer.toString(), INSTALL_EXCEPTION_CODE);
                });
              } else {
                const code = match[2];
                throw new InstallError(`${apk} could not be installed [${code}]`, code);
              }
            })
            .finally(() => {
              return this.parser.readAll();
            });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
