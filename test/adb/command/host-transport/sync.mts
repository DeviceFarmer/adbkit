import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import SyncCommandModule from '../../../../dist/src/adb/command/host-transport/sync.js';

const Protocol = ProtocolModule.default;
const SyncCommand = SyncCommandModule.default;

describe('SyncCommand', function () {
  return it("should send 'sync:'", function () {
    const conn = new MockConnection();
    const cmd = new SyncCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      expect(chunk.toString()).to.equal(Protocol.encodeData('sync:').toString());
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute();
  });
});
