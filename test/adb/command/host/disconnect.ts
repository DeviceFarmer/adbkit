import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import DisconnectCommand from '../../../../src/adb/command/host/disconnect';
import Connection from '../../../../src/adb/connection';

describe('DisconnectCommand', function () {
    it("should send 'host:disconnect:<host>:<port>'", function (done) {
        const conn = new MockConnection();
        const cmd = new DisconnectCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData('host:disconnect:192.168.2.2:5555').toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData(''));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).then(function () {
            return done();
        });
    });
    it('should resolve with the new device id if disconnected', function (done) {
        const conn = new MockConnection();
        const cmd = new DisconnectCommand(conn as Connection);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData(''));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).then(function (val) {
            expect(val).to.be.equal('192.168.2.2:5555');
            return done();
        });
    });
    return it('should reject with error if unable to disconnect', function (done) {
        const conn = new MockConnection();
        const cmd = new DisconnectCommand(conn as Connection);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('No such device 192.168.2.2:5555'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).catch(function (err) {
            expect(err.message).to.eql('No such device 192.168.2.2:5555');
            return done();
        });
    });
});
