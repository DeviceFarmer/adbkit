import Stream from 'stream';
import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import MonkeyCommandModule from '../../../../dist/src/adb/command/host-transport/monkey.js';

const Protocol = ProtocolModule.default;
const MonkeyCommand = MonkeyCommandModule.default;

describe('MonkeyCommand', function () {
  it("should send 'monkey --port <port> -v'", function () {
    const conn = new MockConnection();
    const cmd = new MonkeyCommand(conn);
    conn.getSocket().on('write', function (chunk) {
      return expect(chunk.toString()).to.equal(
        Protocol.encodeData('shell:EXTERNAL_STORAGE=/data/local/tmp monkey --port 1080 -v').toString(),
      );
    });
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeRead(':Monkey: foo\n');
    });
    return cmd.execute(1080);
  });
  it('should resolve with the output stream', function () {
    const conn = new MockConnection();
    const cmd = new MonkeyCommand(conn);
    setImmediate(function () {
      conn.getSocket().causeRead(Protocol.OKAY);
      return conn.getSocket().causeRead(':Monkey: foo\n');
    });
    return cmd.execute(1080).then(function (stream) {
      stream.end();
      expect(stream).to.be.an.instanceof(Stream.Readable);
    });
  });
  it("should resolve after a timeout if result can't be judged from output", function () {
    const conn = new MockConnection();
    const cmd = new MonkeyCommand(conn);
    setImmediate(function () {
      return conn.getSocket().causeRead(Protocol.OKAY);
    });
    return cmd.execute(1080).then(function (stream) {
      stream.end();
      expect(stream).to.be.an.instanceof(Stream.Readable);
    });
  });
  it('should stop reading the output when the timeout cancels the search', async function () {
    const clock = Sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const conn = new MockConnection();
    const cmd = new MonkeyCommand(conn);
    const socket = conn.getSocket();
    let result;
    try {
      socket.causeRead(Protocol.OKAY);
      result = cmd.execute(1080);
      await clock.tickAsync(1000);
    } finally {
      clock.restore();
    }
    const stream = await result;
    expect(stream).to.equal(socket);
    expect(socket.listenerCount('readable')).to.equal(0);
    // Only the search was cancelled, not the parser.
    expect(conn.parser.isCancelled()).to.be.false;
    // Output arriving after the timeout stays in the stream for the caller.
    socket.causeRead(':Monkey: late\n');
    await new Promise((resolve) => setImmediate(resolve));
    expect(stream.read().toString()).to.equal(':Monkey: late\n');
  });
});
