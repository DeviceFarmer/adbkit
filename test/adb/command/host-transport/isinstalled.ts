import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';

import IsInstalledCommand from '../../../../src/adb/command/host-transport/isinstalled';

describe('IsInstalledCommand', function () {
    it("should send 'pm path <pkg>'", function () {
        const conn = new MockConnection();
        const cmd = new IsInstalledCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('shell:pm path foo 2>/dev/null').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('package:foo\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo');
    });
    it('should resolve with true if package returned by command', function () {
        const conn = new MockConnection();
        const cmd = new IsInstalledCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('package:bar\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo').then(function (found) {
            expect(found).to.be.true;
        });
    });
    it('should resolve with false if no package returned', function () {
        const conn = new MockConnection();
        const cmd = new IsInstalledCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo').then(function (found) {
            expect(found).to.be.false;
        });
    });
    return it('should fail if any other data is received', function (done) {
        const conn = new MockConnection();
        const cmd = new IsInstalledCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('open: Permission failed\r\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute('foo').catch(function (err) {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });
});
