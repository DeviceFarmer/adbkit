import Stream from 'stream';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import LocalCommand from '../../../../src/adb/command/host-transport/local';

describe('LocalCommand', function () {
    it("should send 'localfilesystem:<path>'", function () {
        const conn = new MockConnection();
        const cmd = new LocalCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('localfilesystem:/foo.sock').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('/foo.sock')
    });
    it("should send '<type>:<path>' if <path> prefixed with '<type>:'", function () {
        const conn = new MockConnection();
        const cmd = new LocalCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('localabstract:/foo.sock').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('localabstract:/foo.sock').then(function (stream) {
        });
    });
    return it('should resolve with the stream', function () {
        const conn = new MockConnection();
        const cmd = new LocalCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute('/foo.sock').then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
        });
    });
});
