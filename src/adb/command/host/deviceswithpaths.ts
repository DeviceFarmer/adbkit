import Command from '../../command';
import Protocol from '../../protocol';
import DeviceWithPath from '../../../DeviceWithPath';

export default class HostDevicesWithPathsCommand extends Command<DeviceWithPath[]> {
    async execute(): Promise<DeviceWithPath[]> {
        this._send('host:devices-l');
        const reply = await this.parser.readAscii(4);
        switch (reply) {
            case Protocol.OKAY:
                return this._readDevices();
            case Protocol.FAIL:
                return this.parser.readError();
            default:
                return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
    }

    public async _readDevices(): Promise<DeviceWithPath[]> {
        const value = await this.parser.readValue();
        return this._parseDevices(value);
    }

    private _parseDevices(value: Buffer): DeviceWithPath[] {
        const devices: DeviceWithPath[] = [];
        if (!value.length) {
            return devices;
        }
        const ref = value.toString('ascii').split('\n');
        for (let i = 0, len = ref.length; i < len; i++) {
            const line = ref[i];
            if (line) {
                // For some reason, the columns are separated by spaces instead of tabs
                const [id, type, path, product, model, device, transportId] = line.split(/\s+/);
                devices.push({
                    id,
                    type: type as 'emulator' | 'device' | 'offline',
                    path,
                    product,
                    model,
                    device,
                    transportId,
                });
            }
        }
        return devices;
    }
}
