import * as Net from 'net';
import d from 'debug';
import Bluebird from 'bluebird';
import Packet from './packet';
import Socket from './socket';

const debug = d('adb:tcpusb:reversestream');

/**
 * A stream the device opened through `adb reverse`, relayed to the client as a device-initiated A_OPEN.
 */
export default class ReverseStream {
  private remoteId = 0;
  private opened = false;
  private needAck = false;
  private drained = false;
  private ended = false;

  constructor(
    private socket: Socket,
    public readonly localId: number,
    private conn: Net.Socket,
  ) {
    conn.on('readable', () => this._tryPush());
    // Flush a half-closed conn before A_CLSE: the client's A_OKAY can arrive after the device side ended.
    conn.on('end', () => {
      this.drained = true;
      this._tryPush();
    });
    conn.on('error', () => {
      conn.destroy();
      this.end();
    });
  }

  public open(service: string): void {
    debug(`O:A_OPEN ${service}`);
    this.socket.write(Packet.assemble(Packet.A_OPEN, this.localId, 0, Buffer.from(`${service}\x00`)));
  }

  public handle(packet: Packet): Bluebird<boolean> {
    switch (packet.command) {
      case Packet.A_OKAY:
        debug('I:A_OKAY', packet);
        if (!this.opened) {
          this.opened = true;
          this.remoteId = packet.arg0;
        }
        this.needAck = false;
        this._tryPush();
        break;
      case Packet.A_WRTE:
        debug('I:A_WRTE', packet);
        if (packet.data) {
          this.conn.write(packet.data);
        }
        this.socket.write(Packet.assemble(Packet.A_OKAY, this.localId, this.remoteId, null));
        break;
      case Packet.A_CLSE:
        debug('I:A_CLSE', packet);
        this.end();
        break;
    }
    return Bluebird.resolve(true);
  }

  public end(): ReverseStream {
    if (this.ended) {
      return this;
    }
    this.ended = true;
    this.conn.end(); // Not destroy(): the client's last A_WRTE may still be buffered.
    debug('O:A_CLSE');
    this.socket.write(Packet.assemble(Packet.A_CLSE, this.localId, this.remoteId, null));
    this.socket.removeService(this.localId);
    return this;
  }

  private _tryPush(): void {
    if (!this.opened || this.needAck || this.ended) {
      return;
    }
    const chunk = this.conn.read(this.socket.maxPayload) || this.conn.read();
    if (chunk) {
      debug('O:A_WRTE');
      this.socket.write(Packet.assemble(Packet.A_WRTE, this.localId, this.remoteId, chunk));
      this.needAck = true;
    } else if (this.drained) {
      this.end();
    }
  }
}
