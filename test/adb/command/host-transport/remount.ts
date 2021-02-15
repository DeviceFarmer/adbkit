import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import RemountCommand from '../../../../src/adb/command/host-transport/remount';

describe('RemountCommand', function () {
    return it("should send 'remount:'", function () {
        const conn = new MockConnection();
        const cmd = new RemountCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            expect(chunk.toString()).to.equal(Protocol.encodeData('remount:').toString());
            conn.getSocket().causeRead(Protocol.OKAY);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute();
    });
});
