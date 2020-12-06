import Stream from 'stream';
Promise = require('bluebird');
import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import LogcatCommand from '../../../../src/adb/command/host-transport/logcat';

describe('LogcatCommand', function () {
    it("should send 'echo && logcat -B *:I'", function (done) {
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
        return cmd.execute().then(function (stream) {
            return done();
        });
    });
    it("should send 'echo && logcat -c && logcat -B *:I' if options.clear is set", function (done) {
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
            .then(function (stream) {
                return done();
            });
    });
    it('should resolve with the logcat stream', function (done) {
        const conn = new MockConnection();
        const cmd = new LogcatCommand(conn);
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        return cmd.execute().then(function (stream) {
            stream.end();
            expect(stream).to.be.an.instanceof(Stream.Readable);
            return done();
        });
    });
    it('should perform CRLF transformation by default', function (done) {
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
                return done();
            });
    });
    return it('should not perform CRLF transformation if not needed', function (done) {
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
                return done();
            });
    });
});
