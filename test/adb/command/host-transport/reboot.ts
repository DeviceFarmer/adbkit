import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import RebootCommand from '../../../../src/adb/command/host-transport/reboot';

describe('RebootCommand', function () {
    it("should send 'reboot:'", function () {
        const conn = new MockConnection();
        const cmd = new RebootCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('reboot:').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute();
    });
    return it('should send wait for the connection to end', function () {
        const conn = new MockConnection();
        const cmd = new RebootCommand(conn);
        let ended = false;
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('reboot:').toString());
        });
        setImmediate(function () {
            return conn.getSocket().causeRead(Protocol.OKAY);
        });
        setImmediate(function () {
            ended = true;
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function () {
            expect(ended).to.be.true;
        });
    });
});
