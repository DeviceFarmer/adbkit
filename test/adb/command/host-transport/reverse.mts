import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import ParserModule from '../../../../dist/src/adb/parser.js';
import ReverseCommandModule from '../../../../dist/src/adb/command/host-transport/reverse.js';

const Protocol = ProtocolModule.default;
const Parser = ParserModule.default;
const ReverseCommand = ReverseCommandModule.default;

describe('ReverseCommand', function () {
  it("should send 'reverse:forward:<remote>;<local>'", function () {
    const conn = new MockConnection();
    const cmd = new ReverseCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData('reverse:forward:tcp:1;tcp:2').toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('tcp:1', 'tcp:2');
  });
  it('should resolve with true and read the port reply to the end', function () {
    const conn = new MockConnection();
    const cmd = new ReverseCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData('41234'));
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('tcp:0', 'tcp:2').then(function (val) {
      expect(val).to.be.true;
      expect(conn.getSocket().readableEnded).to.be.true;
      expect(conn.getSocket().readableLength).to.equal(0);
    });
  });
  it('should reject with a FailError if the device fails', function (done) {
    const conn = new MockConnection();
    const cmd = new ReverseCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData('cannot bind listener'));
      return conn.getSocket().causeEnd();
    });
    cmd.execute('tcp:1', 'tcp:2').catch(function (err) {
      expect(err).to.be.an.instanceof(Parser.FailError);
      done();
    });
  });
});
