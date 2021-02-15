import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import StartServiceCommand from '../../../../src/adb/command/host-transport/startservice';

describe('StartServiceCommand', function () {
    it("should succeed when 'Success' returned", function () {
        const conn = new MockConnection();
        const cmd = new StartServiceCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success');
            return conn.getSocket().causeEnd();
        });
        const options = {
            component: 'com.dummy.component/.Main',
        };
        return cmd.execute(options);
    });
    it("should fail when 'Error' returned", function (done) {
        const conn = new MockConnection();
        const cmd = new StartServiceCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Error: foo\n');
            return conn.getSocket().causeEnd();
        });
        const options = {
            component: 'com.dummy.component/.Main',
        };
        cmd.execute(options).catch(function (err) {
            expect(err).to.be.be.an.instanceOf(Error);
            done();
        });
    });
    it("should send 'am startservice --user 0 -n <pkg>'", function () {
        const conn = new MockConnection();
        const cmd = new StartServiceCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData("shell:am startservice -n 'com.dummy.component/.Main' --user 0").toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\n');
            return conn.getSocket().causeEnd();
        });
        const options = {
            component: 'com.dummy.component/.Main',
            user: 0,
        };
        return cmd.execute(options);
    });
    return it("should not send user option if not set'", function () {
        const conn = new MockConnection();
        const cmd = new StartServiceCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(
                Protocol.encodeData("shell:am startservice -n 'com.dummy.component/.Main'").toString(),
            );
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('Success\n');
            return conn.getSocket().causeEnd();
        });
        const options = {
            component: 'com.dummy.component/.Main',
        };
        return cmd.execute(options);
    });
});
