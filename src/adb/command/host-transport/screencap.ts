import LineTransform from '../../linetransform';
import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';
import { Duplex } from 'stream';

export default class ScreencapCommand extends Command<Duplex> {
  execute(): Promise<Duplex> {
    this._send('shell:echo && screencap -p 2>/dev/null');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY: {
          let transform = new LineTransform();
          return this.parser
            .readBytes(1)
            .then((chunk) => {
              transform = new LineTransform({ autoDetect: true });
              transform.write(chunk);
              return this.parser.raw().pipe(transform);
            })
            .catch((err) => {
              if (err instanceof Parser.PrematureEOFError) {
                throw Error('No support for the screencap command');
              }
              throw err;
            });
        }
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
