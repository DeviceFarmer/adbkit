import Protocol from '../../protocol';
import Command from '../../command';
import Bluebird from 'bluebird';
import { Properties } from '../../../Properties';

const RE_KEYVAL = /^\[([\s\S]*?)\]: \[([\s\S]*?)\]\r?$/gm;

// FIXME(intentional any): not "any" will break it all
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default class GetPropertiesCommand extends Command<any> {
  execute(): Bluebird<Properties> {
    this._send('shell:getprop');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then((data) => {
            return this._parseProperties(data.toString());
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  private _parseProperties(value: string): Properties {
    const properties = {};
    let match;
    while ((match = RE_KEYVAL.exec(value))) {
      properties[match[1]] = match[2];
    }
    return properties;
  }
}
