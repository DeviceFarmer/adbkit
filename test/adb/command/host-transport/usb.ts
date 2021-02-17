import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import UsbCommand from '../../../../src/adb/command/host-transport/usb';

describe('UsbCommand', function () {
    it("should send 'usb:'", function () {
        const conn = new MockConnection();
        const cmd = new UsbCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('usb:').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('restarting in USB mode\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function (val) {
            expect(val).to.be.true;
        });
    });
    return it('should reject on unexpected reply', function (done) {
        const conn = new MockConnection();
        const cmd = new UsbCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('invalid port\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute().catch(function (err) {
            expect(err.message).to.eql('invalid port');
            done();
        });
    });
});
