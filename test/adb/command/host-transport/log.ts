import Stream from 'stream';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import LogCommand from '../../../../src/adb/command/host-transport/log';

describe('LogCommand', function () {
    it("should send 'log:<log>'", function () {
        const conn = new MockConnection();
        const cmd = new LogCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('log:main').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('main');
    });
    return it('should resolve with the log stream', function () {
        const conn = new MockConnection();
        const cmd = new LogCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute('main').then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
        });
    });
});
