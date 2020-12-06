import Stream from 'stream';
Promise = require('bluebird');
import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import MonkeyCommand from '../../../../src/adb/command/host-transport/monkey';

describe('MonkeyCommand', function () {
    it("should send 'monkey --port <port> -v'", function (done) {
        const conn = new MockConnection();
        const cmd = new MonkeyCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData('shell:EXTERNAL_STORAGE=/data/local/tmp monkey --port 1080 -v').toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeRead(':Monkey: foo\n');
        });
        return cmd.execute(1080).then(function () {
            return done();
        });
    });
    it('should resolve with the output stream', function (done) {
        const conn = new MockConnection();
        const cmd = new MonkeyCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeRead(':Monkey: foo\n');
        });
        return cmd.execute(1080).then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
            return done();
        });
    });
    return it("should resolve after a timeout if result can't be judged from output", function (done) {
        const conn = new MockConnection();
        const cmd = new MonkeyCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute(1080).then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
            return done();
        });
    });
});
