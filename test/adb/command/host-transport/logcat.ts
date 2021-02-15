import Stream from 'stream';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import LogcatCommand from '../../../../src/adb/command/host-transport/logcat';

describe('LogcatCommand', function () {
    it("should send 'echo && logcat -B *:I'", function () {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData('shell:echo && logcat -B *:I 2>/dev/null').toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute();
    });
    it("should send 'echo && logcat -c && logcat -B *:I' if options.clear is set", function () {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData('shell:echo && logcat -c 2>/dev/null && logcat -B *:I 2>/dev/null').toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd
            .execute({
                clear: true,
            })
    });
    it('should resolve with the logcat stream', function () {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute().then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
        });
    });
    it('should perform CRLF transformation by default', function () {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('\r\nfoo\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd
            .execute()
            .then(function (stream) {
                return new Parser(stream).readAll();
            })
            .then(function (out) {
                expect(out.toString()).to.equal('foo\n');
            });
    });
    return it('should not perform CRLF transformation if not needed', function () {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('\nfoo\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd
            .execute()
            .then(function (stream) {
                return new Parser(stream).readAll();
            })
            .then(function (out) {
                expect(out.toString()).to.equal('foo\r\n');
            });
    });
});
