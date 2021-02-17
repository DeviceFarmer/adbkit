import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import RootCommand from '../../../../src/adb/command/host-transport/root';

describe('RootCommand', function () {
    it("should send 'root:'", function () {
        const conn = new MockConnection();
        const cmd = new RootCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('root:').toString());
        });
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('restarting adbd as root\n');
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function (val) {
            expect(val).to.be.true;
        });
    });
    return it('should reject on unexpected reply', function (done) {
        const conn = new MockConnection();
        const cmd = new RootCommand(conn);
        setImmediate(function () {
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead('adbd cannot run as root in production builds\n');
            return conn.getSocket().causeEnd();
        });
        cmd.execute().catch(function (err) {
            expect(err.message).to.eql('adbd cannot run as root in production builds');
            done();
        });
    });
});
