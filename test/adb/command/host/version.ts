import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import HostVersionCommand from '../../../../src/adb/command/host/version';

describe('HostVersionCommand', function () {
    it("should send 'host:version'", function () {
        const conn = new MockConnection();
        const cmd = new HostVersionCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('host:version').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('0000'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute()
    });
    it('should resolve with version', function () {
        const conn = new MockConnection();
        const cmd = new HostVersionCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData((0x1234).toString(16)));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function (version) {
            expect(version).to.equal(0x1234);
        });
    });
    return it('should handle old-style version', function () {
        const conn = new MockConnection();
        const cmd = new HostVersionCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead((0x1234).toString(16));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function (version) {
            expect(version).to.equal(0x1234);
        });
    });
});
