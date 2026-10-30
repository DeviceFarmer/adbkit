import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import ParserModule from '../../../../dist/src/adb/parser.js';
import host_serialModule from '../../../../dist/src/adb/command/host-serial/index.js';

const Protocol = ProtocolModule.default;
const Parser = ParserModule.default;
const { ForwardCommand, ForwardTcpCommand } = host_serialModule;

// The socket was read to its end, so a real one would close.
const expectDrained = (conn: MockConnection) => {
  expect(conn.getSocket().readableEnded).to.be.true;
  expect(conn.getSocket().readableLength).to.equal(0);
};

const rejected = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('Expected a rejection');
    },
    (err) => err,
  );

describe('ForwardCommand', function () {
  it("should send 'host-serial:<serial>:forward:<local>;<remote>'", function () {
    const conn = new MockConnection();
    const cmd = new ForwardCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(
        Protocol.encodeData('host-serial:abba:forward:tcp:1;localabstract:foo').toString(),
      );
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:1', 'localabstract:foo');
  });
  it('should resolve with true and read the port reply to the end', function () {
    const conn = new MockConnection();
    const cmd = new ForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData('41234'));
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:0', 'tcp:2').then(function (val) {
      expect(val).to.be.true;
      expectDrained(conn);
    });
  });
  it('should resolve with true and read to the end when there is no port reply', function () {
    const conn = new MockConnection();
    const cmd = new ForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'localabstract:bar', 'tcp:2').then(function (val) {
      expect(val).to.be.true;
      expectDrained(conn);
    });
  });
  it('should reject with a FailError if the second reply is FAIL', function () {
    const conn = new MockConnection();
    const cmd = new ForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData('cannot bind listener'));
      return conn.getSocket().causeEnd();
    });
    return rejected(cmd.execute('abba', 'tcp:1', 'tcp:2')).then(function (err) {
      expect(err).to.be.an.instanceof(Parser.FailError);
      expect(err.message).to.contain('cannot bind listener');
    });
  });
  it('should reject with an UnexpectedDataError on a malformed tail', function () {
    const conn = new MockConnection();
    const cmd = new ForwardCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead('garbage');
      return conn.getSocket().causeEnd();
    });
    return rejected(cmd.execute('abba', 'tcp:0', 'tcp:2')).then(function (err) {
      expect(err).to.be.an.instanceof(Parser.UnexpectedDataError);
    });
  });
});

describe('ForwardTcpCommand', function () {
  it("should send 'host-serial:<serial>:forward:<local>;<remote>'", function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(
        Protocol.encodeData('host-serial:abba:forward:tcp:0;localabstract:foo').toString(),
      );
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData('41234'));
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:0', 'localabstract:foo');
  });
  it('should resolve with the port the server reports', function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.encodeData('41234'));
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:0', 'tcp:2').then(function (port) {
      expect(port).to.equal(41234);
      expectDrained(conn);
    });
  });
  it('should resolve with the port even if the reply arrives in pieces', function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead('00');
      setImmediate(function () {
        conn.getSocket().causeRead('041234');
        return conn.getSocket().causeEnd();
      });
    });
    return cmd.execute('abba', 'tcp:0', 'tcp:2').then(function (port) {
      expect(port).to.equal(1234);
      expectDrained(conn);
    });
  });
  it('should resolve with the requested port when the server only rebinds and reports none', function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return cmd.execute('abba', 'tcp:8080', 'tcp:2').then(function (port) {
      expect(port).to.equal(8080);
      expectDrained(conn);
    });
  });
  it("should reject when 'tcp:0' gets no port reply", function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeEnd();
    });
    return rejected(cmd.execute('abba', 'tcp:0', 'tcp:2')).then(function (err) {
      expect(err.message).to.contain('did not report');
    });
  });
  it('should reject a local endpoint other than tcp:<port> without sending anything', function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    let written = false;
    conn.getSocket().on('write', function () {
      written = true;
    });
    return rejected(cmd.execute('abba', 'localabstract:foo', 'tcp:2')).then(function (err) {
      expect(err.message).to.contain("needs a 'tcp:<port>' local");
      expect(written).to.be.false;
    });
  });
  it('should reject with a FailError if the server fails', function () {
    const conn = new MockConnection();
    const cmd = new ForwardTcpCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.FAIL);
      conn.getSocket().causeRead(Protocol.encodeData("device 'abba' not found"));
      return conn.getSocket().causeEnd();
    });
    return rejected(cmd.execute('abba', 'tcp:0', 'tcp:2')).then(function (err) {
      expect(err).to.be.an.instanceof(Parser.FailError);
    });
  });
});
