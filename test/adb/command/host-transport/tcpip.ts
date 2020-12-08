import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import TcpIpCommand from '../../../../src/adb/command/host-transport/tcpip';

describe('TcpIpCommand', function () {
    it("should send 'tcp:<port>'", function () {
        const conn = new MockConnection();
        const cmd = new TcpIpCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('tcpip:5555').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('restarting in TCP mode port: 5555\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(5555)
    });
    it('should resolve with the port', function () {
        const conn = new MockConnection();
        const cmd = new TcpIpCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('restarting in TCP mode port: 5555\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(5555).then(function (port) {
            expect(port).to.equal(5555);
        });
    });
    return it('should reject on unexpected reply', function (done) {
        const conn = new MockConnection();
        const cmd = new TcpIpCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('not sure what this could be\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute(5555).catch(function (err) {
            expect(err.message).to.eql('not sure what this could be');
            done();
        });
    });
});
