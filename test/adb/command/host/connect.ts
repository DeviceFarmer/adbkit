import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import ConnectCommand from '../../../../src/adb/command/host/connect';

describe('ConnectCommand', function () {
    it("should send 'host:connect:<host>:<port>'", function () {
        const conn = new MockConnection();
        const cmd = new ConnectCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('host:connect:192.168.2.2:5555').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('connected to 192.168.2.2:5555'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555);
    });
    it('should resolve with the new device id if connected', function () {
        const conn = new MockConnection();
        const cmd = new ConnectCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('connected to 192.168.2.2:5555'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).then(function (val) {
            expect(val).to.be.equal('192.168.2.2:5555');
        });
    });
    it('should resolve with the new device id if already connected', function () {
        const conn = new MockConnection();
        const cmd = new ConnectCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('already connected to 192.168.2.2:5555'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).then(function (val) {
            expect(val).to.be.equal('192.168.2.2:5555');
        });
    });
    return it('should reject with error if unable to connect', function () {
        const conn = new MockConnection();
        const cmd = new ConnectCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(Protocol.encodeData('unable to connect to 192.168.2.2:5555'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('192.168.2.2', 5555).catch(function (err) {
            expect(err.message).to.eql('unable to connect to 192.168.2.2:5555');
        });
    });
});
