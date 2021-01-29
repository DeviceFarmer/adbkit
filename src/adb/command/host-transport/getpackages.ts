import Command from '../../command';
import Protocol from '../../protocol';
import Bluebird from 'bluebird';

export default class GetPackagesCommand extends Command<string[]> {
  execute(flags?: string): Bluebird<string[]> {
    if (flags) {
      this._send(`shell:pm list packages ${flags} 2>/dev/null`);
    } else {
      this._send('shell:pm list packages 2>/dev/null');
    }
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then((data) => {
            return this._parsePackages(data.toString());
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  private _parsePackages(value: string): string[] {
    const packages: string[] = [];
    const RE_PACKAGE = /^package:(.*?)\r?$/gm;
    while (true) {
      const match = RE_PACKAGE.exec(value);
      if (match) {
        packages.push((match as unknown)[1]);
      } else {
        break;
      }
    }
    return packages;
  }
}
