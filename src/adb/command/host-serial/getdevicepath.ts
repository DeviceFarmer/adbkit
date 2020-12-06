import Protocol from '../../protocol';
import Command from '../../command';

export default class GetDevicePathCommand extends Command<string> {
    async execute(serial: string): Promise<string> {
        this._send(`host-serial:${serial}:get-devpath`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return this.parser.readValue().then((value) => {
                    return value.toString();
                });
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
