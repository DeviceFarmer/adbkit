import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import RemountCommandModule from '../../../../dist/src/adb/command/host-transport/remount.js';

const Protocol = ProtocolModule.default;
const RemountCommand = RemountCommandModule.default;

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
