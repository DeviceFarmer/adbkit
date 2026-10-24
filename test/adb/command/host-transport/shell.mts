import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import ParserModule from '../../../../dist/src/adb/parser.js';
import ShellCommandModule from '../../../../dist/src/adb/command/host-transport/shell.js';

const Protocol = ProtocolModule.default;
const Parser = ParserModule.default;
const ShellCommand = ShellCommandModule.default;

describe('ShellCommand', function () {
  it('should pass String commands as-is', function () {
    const conn = new MockConnection();
    const cmd = new ShellCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData("shell:foo 'bar").toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute("foo 'bar");
  });
  it('should escape Array commands', function () {
    const conn = new MockConnection();
    const cmd = new ShellCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo' ''"'"'bar'"'"'' '"'`).toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute(['foo', "'bar'", '"']);
  });
  it('should not escape numbers in arguments', function () {
    const conn = new MockConnection();
    const cmd = new ShellCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo' 67`).toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute(['foo', 67]);
  });
  return it('should reject with FailError on ADB failure (not command failure)', function (done) {
    const conn = new MockConnection();
    const cmd = new ShellCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData(`shell:'foo'`).toString());
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData('mystery'));
      return conn.getSocket().causeEnd();
    });
    cmd.execute(['foo']).catch(Parser.FailError, function () {
      done();
    });
  });
});
