import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../../../mock/connection.mts';
import ProtocolModule from '../../../../dist/src/adb/protocol.js';
import ParserModule from '../../../../dist/src/adb/parser.js';
import PairCommandModule from '../../../../dist/src/adb/command/host/pair.js';

const Protocol = ProtocolModule.default;
const Parser = ParserModule.default;
const PairCommand = PairCommandModule.default;

describe('PairCommand', function () {
  const rejected = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('Expected a rejection');
      },
      (err) => err,
    );
  const reply = (conn: MockConnection, ...chunks: (string | Buffer)[]) =>
    setImmediate(() => {
      for (const chunk of chunks) {
        conn.getSocket().causeRead(chunk);
      }
      conn.getSocket().causeEnd();
    });
  const success = 'Successfully paired to 192.168.1.5:37000 [guid=adb-R5CR1234567-AbCdEf]';

  it("should send 'host:pair:<code>:<host>:<port>', keeping a leading zero in the code", async function () {
    const conn = new MockConnection();
    const writes: string[] = [];
    conn.getSocket().on('write', (chunk) => writes.push(chunk.toString()));
    reply(conn, Protocol.OKAY, Protocol.encodeData(success));
    await new PairCommand(conn).execute('192.168.1.5', 37000, '012345');
    expect(writes).to.eql([Protocol.encodeData('host:pair:012345:192.168.1.5:37000').toString()]);
  });
  it('should resolve with the address, the guid and the reply when paired', async function () {
    const conn = new MockConnection();
    reply(conn, Protocol.OKAY, Protocol.encodeData(success));
    expect(await new PairCommand(conn).execute('192.168.1.5', 37000, '123456')).to.eql({
      address: '192.168.1.5:37000',
      guid: 'adb-R5CR1234567-AbCdEf',
      reply: success,
    });
  });
  it('should resolve without a guid when the server reports none', async function () {
    const conn = new MockConnection();
    reply(conn, Protocol.OKAY, Protocol.encodeData('Successfully paired to 192.168.1.5:37000'));
    expect(await new PairCommand(conn).execute('192.168.1.5', 37000, '123456')).to.eql({
      address: '192.168.1.5:37000',
      reply: 'Successfully paired to 192.168.1.5:37000',
    });
  });
  it("should reject with the server's message when the outcome is a FAIL status", async function () {
    // The exact bytes a platform-tools 37 server sends when nothing listens on
    // the pairing port.
    const conn = new MockConnection();
    reply(conn, 'OKAYFAIL0027Failed: Unable to start pairing client.');
    const err = await rejected(new PairCommand(conn).execute('127.0.0.1', 1, '123456'));
    expect(err).to.be.an.instanceof(Parser.FailError);
    expect(err.message).to.equal("Failure: 'Failed: Unable to start pairing client.'");
  });
  it("should reject with the reply when it is a 'Failed:' message", async function () {
    const conn = new MockConnection();
    reply(conn, Protocol.OKAY, Protocol.encodeData('Failed: Wrong password or connection was dropped.'));
    const err = await rejected(new PairCommand(conn).execute('192.168.1.5', 37000, '000000'));
    expect(err).to.not.be.an.instanceof(Parser.FailError);
    expect(err.message).to.equal('Failed: Wrong password or connection was dropped.');
  });
  it('should reject with FailError when the server refuses the request', async function () {
    // What a server older than platform-tools 30 does.
    const conn = new MockConnection();
    reply(conn, Protocol.FAIL, Protocol.encodeData('unknown host service'));
    const err = await rejected(new PairCommand(conn).execute('192.168.1.5', 37000, '123456'));
    expect(err).to.be.an.instanceof(Parser.FailError);
    expect(err.message).to.equal("Failure: 'unknown host service'");
  });
  it('should also accept a second OKAY before the reply', async function () {
    const conn = new MockConnection();
    reply(conn, Protocol.OKAY, Protocol.OKAY, Protocol.encodeData(success));
    expect((await new PairCommand(conn).execute('192.168.1.5', 37000, '123456')).guid).to.equal(
      'adb-R5CR1234567-AbCdEf',
    );
  });
  it('should reject with UnexpectedDataError on anything else', async function () {
    const conn = new MockConnection();
    reply(conn, Protocol.OKAY, 'WHAT');
    const err = await rejected(new PairCommand(conn).execute('192.168.1.5', 37000, '123456'));
    expect(err).to.be.an.instanceof(Parser.UnexpectedDataError);
  });
});
