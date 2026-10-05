import Packet from './packet';

// adb's INITIAL_DELAYED_ACK_BYTES: what each side lets the other send before the first ack.
export const INITIAL_WINDOW = 32 * 1024 * 1024;

/**
 * Flow control for one stream towards the client. Without adb's `delayed_ack` feature, one A_WRTE is in flight until
 * the client's A_OKAY. With it, A_OPEN and A_OKAY carry byte credits, so many packets can be in flight per round trip.
 */
export default class SendWindow {
  private waiting = false;

  constructor(
    public readonly delayed: boolean,
    private available = 0,
  ) {}

  public get canSend(): boolean {
    return this.delayed ? this.available > 0 : !this.waiting;
  }

  public sent(bytes: number): void {
    if (this.delayed) {
      this.available -= bytes;
    } else {
      this.waiting = true;
    }
  }

  public acked(packet: Packet): void {
    if (!this.delayed) {
      this.waiting = false;
    } else if (packet.data && packet.data.length === 4) {
      this.available += packet.data.readInt32LE(0);
    }
  }

  /** The A_OKAY payload crediting the client with `bytes`; empty without delayed acks. */
  public ack(bytes: number): Buffer | null {
    if (!this.delayed) {
      return null;
    }
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(bytes, 0);
    return payload;
  }
}
