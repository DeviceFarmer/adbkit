import Protocol from '../../protocol';
import Command from '../../command';

const RE_OK = /restarting in/;

export default class UsbCommand extends Command<boolean> {
    execute(): Promise<boolean> {
        this._send('usb:');
        return this.parser.readAscii(4).then((reply) => {
            switch (reply) {
                case Protocol.OKAY:
                    return this.parser.readAll().then(function (value) {
                        if (RE_OK.test(value.toString())) {
                            return true;
                        } else {
                            throw new Error(value.toString().trim());
                        }
                    });
                case Protocol.FAIL:
                    return this.parser.readError();
                default:
                    return this.parser.unexpected(reply, 'OKAY or FAIL');
            }
        });
    }
}
