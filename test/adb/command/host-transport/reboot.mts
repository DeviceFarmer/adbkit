import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import RebootCommandModule from '../../../../dist/src/adb/command/host-transport/reboot.js';

const Protocol = ProtocolModule.default;
const RebootCommand = RebootCommandModule.default;

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
  for (const target of ['bootloader', 'recovery', 'sideload']) {
    it(`should send 'reboot:${target}' for the '${target}' target`, function () {
      const conn = new MockConnection();
      const cmd = new RebootCommand(conn);
      const writes: string[] = [];
      conn.getSocket().on('write', (chunk) => writes.push(chunk.toString()));
      setImmediate(function () {
        conn.getSocket().causeRead(Protocol.OKAY);
        return conn.getSocket().causeEnd();
      });
      return cmd.execute(target).then(function (val) {
        expect(val).to.be.true;
        expect(writes).to.eql([Protocol.encodeData(`reboot:${target}`).toString()]);
      });
    });
  }
  it('should reject with the error adbd gives', function () {
    const conn = new MockConnection();
    const cmd = new RebootCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData('closed'));
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('bootloader').then(
      () => {
        throw new Error('Expected a rejection');
      },
      (err) => expect(err.message).to.equal("Failure: 'closed'"),
    );
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
