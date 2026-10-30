import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import ParserModule from '../../../../dist/src/adb/parser.js';
import host_serialModule from '../../../../dist/src/adb/command/host-serial/index.js';

const Protocol = ProtocolModule.default;
const Parser = ParserModule.default;
const { KillForwardCommand } = host_serialModule;

describe('KillForwardCommand', function () {
  it("should send 'host-serial:<serial>:killforward:<local>'", function () {
    const conn = new MockConnection();
    const cmd = new KillForwardCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData('host-serial:abba:killforward:tcp:1').toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:1');
  });
  it('should resolve with true and read the socket to the end', function () {
    const conn = new MockConnection();
    const cmd = new KillForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:1').then(function (val) {
      expect(val).to.be.true;
      expect(conn.getSocket().readableEnded).to.be.true;
    });
  });
  it('should reject with a FailError if no such forward exists', function (done) {
    const conn = new MockConnection();
    const cmd = new KillForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData("listener 'tcp:1' not found"));
      return conn.getSocket().causeEnd();
    });
    cmd.execute('abba', 'tcp:1').catch(function (err) {
      expect(err).to.be.an.instanceof(Parser.FailError);
      expect(err.message).to.contain('not found');
      done();
    });
  });
});
