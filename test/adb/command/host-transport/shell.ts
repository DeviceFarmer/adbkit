import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import Parser from '../../../../src/adb/parser';
import ShellCommand from '../../../../src/adb/command/host-transport/shell';

describe('ShellCommand', function () {
    it('should pass String commands as-is', function (done) {
        const conn = new MockConnection();
        const cmd = new ShellCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData("shell:foo 'bar").toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute("foo 'bar").then(function () {
            return done();
        });
    });
    it('should escape Array commands', function (done) {
        const conn = new MockConnection();
        const cmd = new ShellCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo' ''"'"'bar'"'"'' '"'`).toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(['foo', "'bar'", '"']).then(function () {
            return done();
        });
    });
    it('should not escape numbers in arguments', function (done) {
        const conn = new MockConnection();
        const cmd = new ShellCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo' 67`).toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(['foo', 67]).then(function () {
            return done();
        });
    });
    return it('should reject with FailError on ADB failure (not command failure)', function (done) {
        const conn = new MockConnection();
        const cmd = new ShellCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo'`).toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.FAIL);
            conn.getSocket().causeRead(Protocol.encodeData('mystery'));
            return conn.getSocket().causeEnd();
        });
        return cmd.execute(['foo']).catch(Parser.FailError, function () {
            return done();
        });
    });
});
