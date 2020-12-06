import Command from '../../command';
import Protocol from '../../protocol';

export default class HostTransportCommand extends Command<boolean> {
    async execute(serial: string): Promise<boolean> {
        this._send(`host:transport:${serial}`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return true;
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
