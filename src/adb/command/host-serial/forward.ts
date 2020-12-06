import Command from '../../command';
import Protocol from '../../protocol';

export default class ForwardCommand extends Command<boolean> {
    async execute(serial: string, local: string, remote: string): Promise<boolean> {
        this._send(`host-serial:${serial}:forward:${local};${remote}`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return this.parser.readAscii(4).then((reply_1) => {
                    switch (reply_1) {
                        case Protocol.OKAY:
                            return true;
                        case Protocol.FAIL:
                            return this.parser.readError();
                        default:
                            return this.parser.unexpected(reply_1, 'OKAY or FAIL');
                    }
                });
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
