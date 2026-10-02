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
