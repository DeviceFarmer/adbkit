import Command from '../../command';
import Protocol from '../../protocol';

export default class HostKillCommand extends Command<boolean> {
    execute(): Promise<boolean> {
        this._send('host:kill');
        return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
                case Protocol.OKAY:
                    return true;
                case Protocol.FAIL:
                    return this.parser.readError();
                default:
                    return this.parser.unexpected(reply, 'OKAY or FAIL');
            }
        });
    }
}
