import { getEventListeners } from 'events';
import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import MockConnection from '../mock/connection.mts';
import ProtocolModule from '../../dist/src/adb/protocol.js';
import DeviceClientModule from '../../dist/src/adb/DeviceClient.js';

const Protocol = ProtocolModule.default;
const DeviceClient = DeviceClientModule.default;

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
});
