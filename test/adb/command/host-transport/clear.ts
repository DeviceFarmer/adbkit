import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import ClearCommand from '../../../../src/adb/command/host-transport/clear';

describe('ClearCommand', function () {
    it("should send 'pm clear <pkg>'", function () {
        const conn = new MockConnection();
        const cmd = new ClearCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            expect(chunk.toString()).to.equal(Protocol.encodeData('shell:pm clear foo.bar.c').toString());
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo.bar.c');
    });
    it("should succeed on 'Success'", function () {
        const conn = new MockConnection();
        const cmd = new ClearCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo.bar.c');
    });
    it("should error on 'Failed'", function (done) {
        const conn = new MockConnection();
        const cmd = new ClearCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Failed\r\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute('foo.bar.c').catch(function (err) {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });
    it("should error on 'Failed' even if connection not closed by device", function (done) {
        const conn = new MockConnection();
        const cmd = new ClearCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeRead('Failed\r\n');
        });
        cmd.execute('foo.bar.c').catch(function (err) {
            expect(err).to.be.an.instanceof(Error);
            done();
        });
    });
    return it('should ignore irrelevant lines', function () {
        const conn = new MockConnection();
        const cmd = new ClearCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Open: foo error\n\n');
            conn.getSocket().causeRead('Success\r\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('foo.bar.c');
    });
});
