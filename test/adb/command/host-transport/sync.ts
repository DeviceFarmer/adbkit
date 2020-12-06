import Chai from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
const { expect } = Chai;
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import SyncCommand from '../../../../src/adb/command/host-transport/sync';

describe('SyncCommand', function () {
    return it("should send 'sync:'", function (done) {
        const conn = new MockConnection();
        const cmd = new SyncCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            expect(chunk.toString()).to.equal(Protocol.encodeData('sync:').toString());
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute().then(function () {
            return done();
        });
    });
});
