import { getEventListeners } from 'events';
import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../mock/connection.mts';
import ProtocolModule from '../../dist/src/adb/protocol.js';
import DeviceClientModule from '../../dist/src/adb/DeviceClient.js';
import ParserModule from '../../dist/src/adb/parser.js';

const Protocol = ProtocolModule.default;
const DeviceClient = DeviceClientModule.default;
const Parser = ParserModule.default;

describe('DeviceClient', function () {
  const setup = () => {
    const conn = new MockConnection();
    Sinon.spy(conn, 'end');
    const client = { connection: Sinon.stub().resolves(conn) };
    const device = new DeviceClient(client, 'abba');
    Sinon.stub(device, 'transport').resolves(conn);
    return { conn, client, device };
  };
  const rejected = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('Expected a rejection');
      },
      (err) => err,
    );

  for (const [method, connect] of [
    ['waitBootComplete', 'transport'],
    ['waitForDevice', 'connection'],
  ]) {
    describe(`${method}({ signal })`, function () {
      const opener = (ctx: ReturnType<typeof setup>) =>
        connect === 'transport' ? ctx.device.transport : ctx.client.connection;

      it('should reject with the reason without connecting when already aborted', function () {
        const ctx = setup();
        const controller = new AbortController();
        const reason = new Error('aborted early');
        controller.abort(reason);
        return rejected(ctx.device[method]({ signal: controller.signal })).then((err) => {
          expect(err).to.equal(reason);
          expect(opener(ctx)).to.not.have.been.called;
        });
      });
      it('should reject with the reason, close the connection and drop its listener when aborted', function () {
        const ctx = setup();
        const controller = new AbortController();
        const reason = new Error('aborted');
        const promise = ctx.device[method]({ signal: controller.signal });
        setImmediate(() => {
          ctx.conn.getSocket().causeRead(Protocol.OKAY);
          setImmediate(() => controller.abort(reason));
        });
        return rejected(promise).then((err) => {
          expect(err).to.equal(reason);
          expect(ctx.conn.end).to.have.been.called;
          expect(getEventListeners(controller.signal, 'abort')).to.have.length(0);
        });
      });
      it('should reject with a TimeoutError for AbortSignal.timeout()', function () {
        const ctx = setup();
        return rejected(ctx.device[method]({ signal: AbortSignal.timeout(10) })).then((err) => {
          expect(err.name).to.equal('TimeoutError');
          expect(ctx.conn.end).to.have.been.called;
        });
      });
    });
  }

  it('should drop the abort listener once the wait succeeds', function () {
    const ctx = setup();
    const controller = new AbortController();
    setImmediate(() => {
      ctx.conn.getSocket().causeRead(Protocol.OKAY);
      ctx.conn.getSocket().causeRead('1\n');
      ctx.conn.getSocket().causeEnd();
    });
    return ctx.device.waitBootComplete({ signal: controller.signal }).then((result) => {
      expect(result).to.be.true;
      expect(getEventListeners(controller.signal, 'abort')).to.have.length(0);
    });
  });
  describe('abort while stalled', function () {
    it('should reject at once while waitBootComplete waits on a socket that never answers', function () {
      const ctx = setup();
      // A stalled connection: ending it doesn't make the remote close, so
      // the socket never emits 'end'.
      ctx.conn.end = Sinon.spy(() => ctx.conn);
      const socket = ctx.conn.getSocket();
      socket.end = () => socket;
      const controller = new AbortController();
      const reason = new Error('boot timeout');
      const promise = ctx.device.waitBootComplete({ signal: controller.signal });
      setImmediate(() => {
        ctx.conn.getSocket().causeRead(Protocol.OKAY);
        setImmediate(() => controller.abort(reason));
      });
      return rejected(promise).then((err) => {
        expect(err).to.equal(reason);
        expect(ctx.conn.end).to.have.been.called;
      });
    });
    it('should reject at once while still connecting, and close the late connection', async function () {
      const conn = new MockConnection();
      Sinon.spy(conn, 'end');
      let connected: (c: unknown) => void = () => undefined;
      const client = { connection: () => new Promise((resolve) => (connected = resolve)) };
      const device = new DeviceClient(client, 'abba');
      const controller = new AbortController();
      const reason = new Error('gave up');
      const promise = device.waitForDevice({ signal: controller.signal });
      controller.abort(reason);
      expect(await rejected(promise)).to.equal(reason);
      connected(conn);
      await new Promise((resolve) => setImmediate(resolve));
      expect(conn.end).to.have.been.called;
    });
  });

  describe('removeAllForwards()', function () {
    const forwards = [
      { serial: 'abba', local: 'tcp:1', remote: 'tcp:2' },
      { serial: 'other', local: 'tcp:3', remote: 'tcp:4' },
      { serial: 'abba', local: 'localabstract:x', remote: 'tcp:5' },
    ];

    it("should remove only this device's forwards, one by one", async function () {
      const device = new DeviceClient({ connection: Sinon.stub() }, 'abba');
      Sinon.stub(device, 'listForwards').resolves(forwards);
      const removeForward = Sinon.stub(device, 'removeForward').resolves(true);
      expect(await device.removeAllForwards()).to.be.true;
      expect(removeForward.args).to.deep.equal([['tcp:1'], ['localabstract:x']]);
    });
    it('should skip a forward that disappeared after it was listed', async function () {
      const device = new DeviceClient({ connection: Sinon.stub() }, 'abba');
      Sinon.stub(device, 'listForwards').resolves(forwards);
      const removeForward = Sinon.stub(device, 'removeForward');
      removeForward.onFirstCall().rejects(new Parser.FailError("listener 'tcp:1' not found"));
      removeForward.onSecondCall().resolves(true);
      expect(await device.removeAllForwards()).to.be.true;
      expect(removeForward).to.have.been.calledTwice;
    });
    it('should reject on any other error', async function () {
      const device = new DeviceClient({ connection: Sinon.stub() }, 'abba');
      Sinon.stub(device, 'listForwards').resolves(forwards);
      const failure = new Error('boom');
      Sinon.stub(device, 'removeForward').rejects(failure);
      expect(await rejected(device.removeAllForwards())).to.equal(failure);
    });
  });
});
