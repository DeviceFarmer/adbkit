import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import InstallCommand from '../../../../src/adb/command/host-transport/install';

describe('InstallCommand', function () {
    it("should send 'pm install -r <apk>'", function () {
        const conn = new MockConnection();
        const cmd = new InstallCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('shell:pm install -r "foo"').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo');
    });
    it("should succeed when command responds with 'Success'", function () {
        const conn = new MockConnection();
        const cmd = new InstallCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo');
    });
    it("should reject if command responds with 'Failure [REASON]'", function (done) {
        const conn = new MockConnection();
        const cmd = new InstallCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Failure [BAR]\r\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute('foo').catch(function (err) {
            done();
        });
    });
    it("should give detailed reason in rejection's code property", function (done) {
        const conn = new MockConnection();
        const cmd = new InstallCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Failure [ALREADY_EXISTS]\r\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute('foo').catch(function (err) {
            expect(err.code).to.equal('ALREADY_EXISTS');
            done();
        });
    });
    return it('should ignore any other data', function () {
        const conn = new MockConnection();
        const cmd = new InstallCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('open: Permission failed\r\n');
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo');
    });
});
