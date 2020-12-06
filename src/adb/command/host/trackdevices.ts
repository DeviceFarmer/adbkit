import Protocol from '../../protocol';
import Tracker from '../../tracker';
import HostDevicesCommand from './devices';

export default class HostTrackDevicesCommand extends HostDevicesCommand {
    // FIXME(intentional any): correct return value: `Bluebird<Tracker>`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async execute(): Promise<any> {
        this._send('host:track-devices');
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return new Tracker(this);
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }
}
