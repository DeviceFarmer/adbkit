import Stream from 'stream';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import TcpCommand from '../../../../src/adb/command/host-transport/tcp';

describe('TcpCommand', function () {
    it("should send 'tcp:<port>' when no host given", function () {
        const conn = new MockConnection();
        const cmd = new TcpCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('tcp:8080').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(8080);
    });
    it("should send 'tcp:<port>:<host>' when host given", function () {
        const conn = new MockConnection();
        const cmd = new TcpCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('tcp:8080:127.0.0.1').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(8080, '127.0.0.1');
    });
    return it('should resolve with the tcp stream', function () {
        const conn = new MockConnection();
        const cmd = new TcpCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute(8080).then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
        });
    });
});
