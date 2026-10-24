import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';
import { Duplex } from 'stream';

const MONKEY_LINE_TIMEOUT = 1000;

export default class MonkeyCommand extends Command<Duplex> {
  execute(port: number): Promise<Duplex> {
    // Some devices have broken /sdcard (i.e. /mnt/sdcard), which monkey will
    // attempt to use to write log files to. We can cheat and set the location
    // with an environment variable, because most logs use
    // Environment.getLegacyExternalStorageDirectory() like they should. There
    // are some hardcoded logs, though. Anyway, this should enable most things.
    // Check https://github.com/android/platform_frameworks_base/blob/master/
    // core/java/android/os/Environment.java for the variables.
    this._send(`shell:EXTERNAL_STORAGE=/data/local/tmp monkey --port ${port} -v`);
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          // The monkey command is a bit weird in that it doesn't look like
          // it starts in daemon mode, but it actually does. So even though
          // the command leaves the terminal "hanging", Ctrl-C (or just
          // ending the connection) will not end the daemon. HOWEVER, on
          // some devices, such as SO-02C by Sony, it is required to leave
          // the command hanging around. In any case, if the command exits
          // by itself, it means that something went wrong.
          // On some devices (such as F-08D by Fujitsu), the monkey
          // command gives no output no matter how many verbose flags you
          // give it. So we use a fallback timeout.
          // The timeout has to cancel the search; otherwise it would keep
          // consuming the monkey's output from the stream.
          return this._searchMonkeyLine();
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  private _searchMonkeyLine(): Promise<Duplex> {
    // Cancels only this search; the stream is handed to the caller intact.
    const timedOut = new Parser.CancellationError();
    const search = new AbortController();
    const timer = setTimeout(() => search.abort(timedOut), MONKEY_LINE_TIMEOUT);
    return this.parser
      .searchLine(/^:Monkey:/, search.signal)
      .then(
        () => this.parser.raw(),
        (err) => {
          if (err === timedOut) {
            return this.parser.raw();
          }
          throw err;
        },
      )
      .finally(() => clearTimeout(timer));
  }
}
