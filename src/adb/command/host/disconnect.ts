import Command from '../../command';
import Protocol from '../../protocol';

// Possible replies:
// "No such device 192.168.2.2:5555"
// ""
const RE_OK = /^$/;

export default class HostDisconnectCommand extends Command<string> {
    async execute(host: string, port: number): Promise<string> {
        this._send(`host:disconnect:${host}:${port}`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return this.parser.readValue().then(function (value) {
                    if (RE_OK.test(value.toString())) {
                        return `${host}:${port}`;
                    } else {
                        throw new Error(value.toString());
                    }
                });
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
