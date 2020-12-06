import Protocol from '../../protocol';
import Parser from '../../parser';
import Command from '../../command';

export default class IsInstalledCommand extends Command<boolean> {
    async execute(pkg: string): Promise<boolean> {
        this._send(`shell:pm path ${pkg} 2>/dev/null`);
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return this.parser
                    .readAscii(8)
                    .then((reply) => {
                        switch (reply) {
                            case 'package:':
                                return true;
                            default:
                                return this.parser.unexpected(reply, "'package:'");
                        }
                    })
                    .catch(Parser.PrematureEOFError, function () {
                        return false;
                    });
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
