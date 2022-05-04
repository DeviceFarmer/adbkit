export default class Packet {
  public static A_SYNC = 0x434e5953;
  public static A_CNXN = 0x4e584e43;
  public static A_OPEN = 0x4e45504f;
  public static A_OKAY = 0x59414b4f;
  public static A_CLSE = 0x45534c43;
  public static A_WRTE = 0x45545257;
  public static A_AUTH = 0x48545541;

  public static checksum(data?: Buffer): number {
    let sum = 0;
    if (data) {
      for (let i = 0, len = data.length; i < len; i++) {
        const char = data[i];
        sum += char;
      }
    }
    return sum;
  }

  public static magic(command: number): number {
    // We need the full uint32 range, which ">>> 0" thankfully allows us to use
    return (command ^ 0xffffffff) >>> 0;
  }

  public static assemble(command: number, arg0: number, arg1: number, data?: Buffer): Buffer {
    if (data) {
      const chunk = Buffer.alloc(24 + data.length);
      chunk.writeUInt32LE(command, 0);
      chunk.writeUInt32LE(arg0, 4);
      chunk.writeUInt32LE(arg1, 8);
      chunk.writeUInt32LE(data.length, 12);
      chunk.writeUInt32LE(Packet.checksum(data), 16);
      chunk.writeUInt32LE(Packet.magic(command), 20);
      data.copy(chunk, 24);
      return chunk;
    } else {
      const chunk = Buffer.alloc(24);
      chunk.writeUInt32LE(command, 0);
      chunk.writeUInt32LE(arg0, 4);
      chunk.writeUInt32LE(arg1, 8);
      chunk.writeUInt32LE(0, 12);
      chunk.writeUInt32LE(0, 16);
      chunk.writeUInt32LE(Packet.magic(command), 20);
      return chunk;
    }
  }

  static swap32(n: number): number {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(n, 0);
    return buffer.readUInt32BE(0);
  }

  constructor(
    public readonly command: number,
    public readonly arg0: number,
    public readonly arg1: number,
    readonly length: number,
    readonly check: number,
    readonly magic: number,
    public data?: Buffer,
  ) {}

  public verifyChecksum(): boolean {
    return this.check === 0 ? true : this.check === Packet.checksum(this.data);
  }

  public verifyMagic(): boolean {
    return this.magic === Packet.magic(this.command);
  }

  private getType(): string {
    switch (this.command) {
      case Packet.A_SYNC:
        return 'SYNC';
      case Packet.A_CNXN:
        return 'CNXN';
      case Packet.A_OPEN:
        return 'OPEN';
      case Packet.A_OKAY:
        return 'OKAY';
      case Packet.A_CLSE:
        return 'CLSE';
      case Packet.A_WRTE:
        return 'WRTE';
      case Packet.A_AUTH:
        return 'AUTH';
      default:
        throw new Error('Unknown command {@command}');
    }
  }

  toString(): string {
    const type = this.getType();
    return `${type} arg0=${this.arg0} arg1=${this.arg1} length=${this.length}`;
  }
}
