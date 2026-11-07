import { expect } from 'chai';
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import HostDevicesWithPathsCommandModule from '../../../../dist/src/adb/command/host/deviceswithpaths.js';
import type Connection from '../../../../dist/src/adb/connection.js';

const Protocol = ProtocolModule.default;
const HostDevicesWithPathsCommand = HostDevicesWithPathsCommandModule.default;

describe('HostDevicesWithPathsCommand', function () {
  const list = (output: string) => {
    const conn = new MockConnection();
    const cmd = new HostDevicesWithPathsCommand(conn as Connection);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData(output));
    });
    return cmd.execute();
  };

  it("should send 'host:devices-l'", function () {
    const conn = new MockConnection();
    const cmd = new HostDevicesWithPathsCommand(conn as Connection);
    conn.getSocket().on('write', function (chunk) {
      expect(chunk.toString()).to.equal(Protocol.encodeData('host:devices-l').toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData(''));
    });
    return cmd.execute();
  });
  it('should parse a USB device with a path (Linux)', async function () {
    const devices = await list(
      '0123456789ABCDEF       device usb:1-1.2 product:OnePlus7 model:GM1903 device:OnePlus7 transport_id:2\n',
    );
    expect(devices).to.eql([
      {
        id: '0123456789ABCDEF',
        type: 'device',
        path: 'usb:1-1.2',
        product: 'OnePlus7',
        model: 'GM1903',
        device: 'OnePlus7',
        transportId: '2',
      },
    ]);
  });
  it('should parse a device without a path (Windows, #222)', async function () {
    const devices = await list(
      'AAAAAAAA               device product:OnePlus7 model:GM1903 device:OnePlus7 transport_id:1\n',
    );
    expect(devices).to.eql([
      {
        id: 'AAAAAAAA',
        type: 'device',
        path: undefined,
        product: 'OnePlus7',
        model: 'GM1903',
        device: 'OnePlus7',
        transportId: '1',
      },
    ]);
  });
  it('should parse emulators and network devices, which have no path', async function () {
    // Real output of an Android 30 emulator, also connected over TCP.
    const devices = await list(
      'emulator-5620          device product:sdk_gphone_arm64 model:sdk_gphone_arm64 device:emulator_arm64 transport_id:8\n' +
        'localhost:5621         device product:sdk_gphone_arm64 model:sdk_gphone_arm64 device:emulator_arm64 transport_id:19\n',
    );
    expect(devices.map((d) => [d.id, d.type, d.path, d.product, d.model, d.device, d.transportId])).to.eql([
      ['emulator-5620', 'device', undefined, 'sdk_gphone_arm64', 'sdk_gphone_arm64', 'emulator_arm64', '8'],
      ['localhost:5621', 'device', undefined, 'sdk_gphone_arm64', 'sdk_gphone_arm64', 'emulator_arm64', '19'],
    ]);
  });
  it('should parse the fields in any order', async function () {
    const [device] = await list('X  device transport_id:5 model:M usb:2-1 device:D product:P\n');
    expect(device).to.eql({
      id: 'X',
      type: 'device',
      path: 'usb:2-1',
      product: 'P',
      model: 'M',
      device: 'D',
      transportId: '5',
    });
  });
  it('should leave the fields adb does not print undefined', async function () {
    const devices = await list(
      'ABC                    unauthorized usb:1-1 transport_id:3\nemulator-5554          offline transport_id:6\n',
    );
    expect(devices).to.eql([
      {
        id: 'ABC',
        type: 'unauthorized',
        path: 'usb:1-1',
        product: undefined,
        model: undefined,
        device: undefined,
        transportId: '3',
      },
      {
        id: 'emulator-5554',
        type: 'offline',
        path: undefined,
        product: undefined,
        model: undefined,
        device: undefined,
        transportId: '6',
      },
    ]);
  });
  it('should keep a state that contains spaces and colons', async function () {
    const [device] = await list(
      'ABC                    no permissions (missing udev rules? user is in the plugdev group); see [http://developer.android.com/tools/device.html] usb:1-1 transport_id:4\n',
    );
    expect(device.type).to.equal(
      'no permissions (missing udev rules? user is in the plugdev group); see [http://developer.android.com/tools/device.html]',
    );
    expect(device.path).to.equal('usb:1-1');
    expect(device.transportId).to.equal('4');
  });
  it("should keep '(no serial number)' whole as the id", async function () {
    const [device] = await list('(no serial number)     device usb:1-1 product:P model:M device:D transport_id:7\n');
    expect(device).to.eql({
      id: '(no serial number)',
      type: 'device',
      path: 'usb:1-1',
      product: 'P',
      model: 'M',
      device: 'D',
      transportId: '7',
    });
  });
  it('should keep spaces in product and device, which adb does not replace', async function () {
    const [device] = await list(
      'ABC                    device usb:1-1 product:My Product model:My_Model device:my device x transport_id:3\n',
    );
    expect(device).to.eql({
      id: 'ABC',
      type: 'device',
      path: 'usb:1-1',
      product: 'My Product',
      model: 'My_Model',
      device: 'my device x',
      transportId: '3',
    });
  });
  it('should resolve with an empty list when no device is attached', async function () {
    expect(await list('')).to.eql([]);
  });
});
