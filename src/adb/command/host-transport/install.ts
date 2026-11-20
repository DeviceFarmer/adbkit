import Protocol from '../../protocol';
import Command from '../../command';
import InstallOptions from '../../../InstallOptions';

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
  execute(apk: string, options?: InstallOptions): Promise<boolean> {
    // The README used to list a callback as the second argument of install()
    // and installRemote(), so anything but an object means no options.
    const opts: InstallOptions = typeof options === 'object' && options !== null ? options : {};
    const args: string[] = [];
    if (opts.reinstall !== false) {
      args.push('-r');
    }
    if (opts.allowDowngrade) {
      args.push('-d');
    }
    if (opts.grantPermissions) {
      args.push('-g');
    }
    if (opts.allowTestPackages) {
      args.push('-t');
    }
    for (const arg of opts.args ?? []) {
      args.push(`${this._escapeCompat(arg)}`);
    }
    args.push(`${this._escapeCompat(apk)}`);
    this._send(`shell:pm install ${args.join(' ')}`);
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
