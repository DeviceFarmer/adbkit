import * as Net from 'net';
import { expect } from 'chai';
import Client from '../../../src/adb/client';
import Packet from '../../../src/adb/tcpusb/packet';
import Socket from '../../../src/adb/tcpusb/socket';
import MockDuplex from '../../mock/duplex';

interface Written {
  command: number;
  arg0: number;
  arg1: number;
  data: Buffer;
}

function setup(host = '127.0.0.1') {
  const duplex = new MockDuplex() as MockDuplex & { setNoDelay: () => void };
  duplex.setNoDelay = () => undefined;
  const written: Written[] = [];
  const waiters: Array<() => void> = [];
  duplex.on('write', (chunk: Buffer) => {
    written.push({
      command: chunk.readUInt32LE(0),
      arg0: chunk.readUInt32LE(4),
      arg1: chunk.readUInt32LE(8),
      data: chunk.slice(24),
    });
    waiters.splice(0).forEach((fn) => fn());
  });
  const socket = new Socket(new Client({ host, port: 5037 }), 'serial', duplex as unknown as Net.Socket);
  (socket as unknown as { authorized: boolean }).authorized = true;
  const next = (command: number): Promise<Written> =>
    new Promise((resolve) => {
      const check = () => {
        const i = written.findIndex((p) => p.command === command);
        if (i === -1) return waiters.push(check);
        resolve(written.splice(i, 1)[0]);
      };
      check();
    });
  const receive = (command: number, arg0: number, arg1: number, data?: Buffer) =>
    duplex.causeRead(Packet.assemble(command, arg0, arg1, data));
  return { socket, next, receive };
}

describe('TcpUsb Socket reverse', function () {
  it('should point reverse:forward at a local listener', async function () {
    const { socket } = setup();
    const name = await socket.rewriteReverseService('reverse:forward:norebind:tcp:9123;tcp:8000');
    const match = /^reverse:forward:norebind:tcp:9123;tcp:(\d+)$/.exec(name);
    expect(match).to.not.be.null;
    const conn = Net.connect(+match[1], '127.0.0.1');
    await new Promise((resolve) => conn.on('connect', resolve));
    conn.destroy();
    socket.end();
  });

  it('should leave other services unchanged', async function () {
    const { socket } = setup();
    expect(await socket.rewriteReverseService('shell:ls')).to.equal('shell:ls');
    expect(await socket.rewriteReverseService('reverse:list-forward')).to.equal('reverse:list-forward');
    socket.end();
  });

  it('should leave reverse:forward unchanged for a remote adb server', async function () {
    const { socket } = setup('10.0.0.1');
    const name = 'reverse:forward:tcp:9123;tcp:8000';
    expect(await socket.rewriteReverseService(name)).to.equal(name);
    socket.end();
  });

  it('should close the listener on reverse:killforward', async function () {
    const { socket } = setup();
    const name = await socket.rewriteReverseService('reverse:forward:tcp:9123;tcp:8000');
    const port = +name.split('tcp:').pop();
    await socket.rewriteReverseService('reverse:killforward:tcp:9123');
    const conn = Net.connect(port, '127.0.0.1');
    const err = await new Promise<NodeJS.ErrnoException>((resolve) => conn.on('error', resolve));
    expect(err.code).to.equal('ECONNREFUSED');
    socket.end();
  });

  it('should relay a device connection to the client, flushing it after a half-close', async function () {
    const { socket, next, receive } = setup();
    const name = await socket.rewriteReverseService('reverse:forward:tcp:9123;tcp:8000');
    const conn = Net.connect(+name.split('tcp:').pop(), '127.0.0.1');
    const received: Buffer[] = [];
    conn.on('data', (chunk) => received.push(chunk));
    conn.write('ping');

    const open = await next(Packet.A_OPEN);
    expect(open.data.toString()).to.equal('tcp:8000\x00');
    conn.end(); // Before the client's A_OKAY: the data must still reach it.

    receive(Packet.A_OKAY, 7, open.arg0);
    const write = await next(Packet.A_WRTE);
    expect([write.arg0, write.arg1]).to.deep.equal([open.arg0, 7]);
    expect(write.data.toString()).to.equal('ping');

    receive(Packet.A_WRTE, 7, open.arg0, Buffer.from('pong'));
    const ack = await next(Packet.A_OKAY);
    expect([ack.arg0, ack.arg1]).to.deep.equal([open.arg0, 7]);

    receive(Packet.A_OKAY, 7, open.arg0);
    const close = await next(Packet.A_CLSE);
    expect([close.arg0, close.arg1]).to.deep.equal([open.arg0, 7]);
    await new Promise((resolve) => conn.on('close', resolve));
    expect(Buffer.concat(received).toString()).to.equal('pong');
    socket.end();
  });
});

describe('TcpUsb Socket delayed_ack', function () {
  async function relay(delayed: boolean) {
    const { socket, next, receive } = setup();
    (socket as unknown as { delayedAck: boolean }).delayedAck = delayed;
    const name = await socket.rewriteReverseService('reverse:forward:tcp:9123;tcp:8000');
    const conn = Net.connect(+name.split('tcp:').pop(), '127.0.0.1');
    const open = await next(Packet.A_OPEN);
    return { socket, next, receive, conn, open };
  }

  it('should enable delayed_ack only when the client lists it', async function () {
    for (const [banner, expected] of [
      ['host::features=shell_v2,cmd,delayed_ack\x00', true],
      ['host::features=shell_v2,cmd\x00', false],
      ['host::\x00', false],
    ] as Array<[string, boolean]>) {
      const { socket, next, receive } = setup();
      receive(Packet.A_CNXN, 0x01000001, 1024 * 1024, Buffer.from(banner));
      await next(Packet.A_AUTH);
      expect(socket.delayedAck, banner).to.equal(expected);
      socket.end();
    }
  });

  it('should keep several packets in flight with delayed_ack', async function () {
    const { socket, next, receive, conn, open } = await relay(true);
    expect(open.arg1).to.equal(32 * 1024 * 1024);
    receive(Packet.A_OKAY, 7, open.arg0, Buffer.from([0, 0, 0, 2])); // 32 MiB credit
    conn.write(Buffer.alloc(3 * socket.maxPayload));
    for (let i = 0; i < 3; i++) {
      expect((await next(Packet.A_WRTE)).data.length).to.equal(socket.maxPayload);
    }

    receive(Packet.A_WRTE, 7, open.arg0, Buffer.from('pong'));
    const ack = await next(Packet.A_OKAY);
    expect(ack.data.readUInt32LE(0)).to.equal(4);
    conn.destroy();
    socket.end();
  });

  it('should stop at the credit the client gave', async function () {
    const { socket, next, receive, conn, open } = await relay(true);
    const credit = Buffer.alloc(4);
    credit.writeInt32LE(socket.maxPayload, 0);
    receive(Packet.A_OKAY, 7, open.arg0, credit);
    conn.write(Buffer.alloc(2 * socket.maxPayload));
    await next(Packet.A_WRTE);
    const more = next(Packet.A_WRTE);
    const early = await Promise.race([more.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);
    expect(early).to.equal(false);
    receive(Packet.A_OKAY, 7, open.arg0, credit);
    expect((await more).data.length).to.equal(socket.maxPayload);
    conn.destroy();
    socket.end();
  });

  it('should keep one packet in flight without delayed_ack', async function () {
    const { socket, next, receive, conn, open } = await relay(false);
    expect(open.arg1).to.equal(0);
    receive(Packet.A_OKAY, 7, open.arg0);
    conn.write(Buffer.alloc(2 * socket.maxPayload));
    await next(Packet.A_WRTE);
    const more = next(Packet.A_WRTE);
    const early = await Promise.race([more.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);
    expect(early).to.equal(false);
    receive(Packet.A_OKAY, 7, open.arg0);
    await more;
    receive(Packet.A_WRTE, 7, open.arg0, Buffer.from('pong'));
    expect((await next(Packet.A_OKAY)).data.length).to.equal(0);
    conn.destroy();
    socket.end();
  });
});

describe('TcpUsb Socket banner', function () {
  async function banner(delayed: boolean): Promise<string> {
    const { socket } = setup();
    const internals = socket as unknown as {
      delayedAck: boolean;
      client: unknown;
      _deviceId: () => Promise<Buffer>;
    };
    internals.delayedAck = delayed;
    internals.client = {
      getDevice: () => ({
        getProperties: () =>
          Promise.resolve({ 'ro.product.name': 'n', 'ro.product.model': 'm', 'ro.product.device': 'd' }),
      }),
    };
    const id = (await internals._deviceId()).toString();
    socket.end();
    return id;
  }

  it('should list delayed_ack as its own ;-terminated property', async function () {
    expect(await banner(true)).to.equal(
      'device::ro.product.name=n;ro.product.model=m;ro.product.device=d;features=delayed_ack;\x00',
    );
  });

  it('should list no features without delayed_ack', async function () {
    expect(await banner(false)).to.equal('device::ro.product.name=n;ro.product.model=m;ro.product.device=d;\x00');
  });
});
