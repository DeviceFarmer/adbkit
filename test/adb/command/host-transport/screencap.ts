import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import ScreencapCommand from '../../../../src/adb/command/host-transport/screencap';

describe('ScreencapCommand', function () {
    it("should send 'screencap -p'", function () {
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
        return cmd.execute()
    });
    it('should resolve with the PNG stream', function () {
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
            });
    });
    it('should reject if command not supported', function (done) {
        const conn = new MockConnection();
        const cmd = new ScreencapCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        cmd.execute().catch(function () {
            done();
        });
    });
    it('should perform CRLF transformation by default', function () {
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
            });
    });
    return it('should not perform CRLF transformation if not needed', function () {
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
            });
    });
});
