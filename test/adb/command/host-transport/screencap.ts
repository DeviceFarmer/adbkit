import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import ScreencapCommand from '../../../../src/adb/command/host-transport/screencap';

describe('ScreencapCommand', function () {
    it("should send 'screencap -p'", function (done) {
        const conn = new MockConnection();
        const cmd = new ScreencapCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData('shell:echo && screencap -p 2>/dev/null').toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('\r\nlegit image');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function (stream) {
            return done();
        });
    });
    it('should resolve with the PNG stream', function (done) {
        const conn = new MockConnection();
        const cmd = new ScreencapCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('\r\nlegit image');
            return conn.getSocket().causeEnd();
        });
        return cmd
            .execute()
            .then(function (stream) {
                return new Parser(stream).readAll();
            })
            .then(function (out) {
                expect(out.toString()).to.equal('legit image');
                return done();
            });
    });
    it('should reject if command not supported', function (done) {
        const conn = new MockConnection();
        const cmd = new ScreencapCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().catch(function () {
            return done();
        });
    });
    it('should perform CRLF transformation by default', function (done) {
        const conn = new MockConnection();
        const cmd = new ScreencapCommand(conn);
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
        const cmd = new ScreencapCommand(conn);
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
