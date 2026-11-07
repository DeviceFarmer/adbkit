import Protocol from '../../protocol';
import Command from '../../command';

export default class RebootCommand extends Command<boolean> {
  execute(target?: string): Promise<boolean> {
    // Only a string is a target. Older docs listed a callback as reboot()'s
    // argument; sending a function's source as the target would reboot into
    // who knows what, so anything else means a plain reboot.
    this._send(`reboot:${typeof target === 'string' ? target : ''}`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readAll().then(() => true);
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }
}
