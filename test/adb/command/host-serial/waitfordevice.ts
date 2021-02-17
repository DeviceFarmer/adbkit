import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import { WaitForDeviceCommand } from '../../../../src/adb/command/host-serial';

describe('WaitForDeviceCommand', function () {
    it("should send 'host-serial:<serial>:wait-for-any-device'", function () {
        const conn = new MockConnection();
        const cmd = new WaitForDeviceCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('host-serial:abba:wait-for-any-device').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('abba');
    });
    it('should resolve with id when the device is connected', function () {
        const conn = new MockConnection();
        const cmd = new WaitForDeviceCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('abba').then(function (id) {
            expect(id).to.equal('abba');
        });
    });
    return it('should reject with error if unable to connect', function () {
        const conn = new MockConnection();
        const cmd = new WaitForDeviceCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.FAIL);
            conn.getSocket().causeRead(Protocol.encodeData('not sure how this might happen'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('abba').catch(function (err) {
            expect(err.message).to.contain('not sure how this might happen');
        });
    });
});
