import { EventEmitter } from 'events';
import Packet from './packet';
import ReadableStream = NodeJS.ReadableStream;

class ChecksumError extends Error {
  constructor(public packet: Packet) {
    super();
    Object.setPrototypeOf(this, ChecksumError.prototype);
    this.name = 'ChecksumError';
    this.message = 'Checksum mismatch';
    Error.captureStackTrace(this, PacketReader.ChecksumError);
  }
}

class MagicError extends Error {
  constructor(public packet: Packet) {
    super();
    Object.setPrototypeOf(this, MagicError.prototype);
    this.name = 'MagicError';
    this.message = 'Magic value mismatch';
    Error.captureStackTrace(this, PacketReader.MagicError);
  }
}

export default class PacketReader extends EventEmitter {
  public static ChecksumError = ChecksumError;
  public static MagicError = MagicError;

  private inBody = false;
  private buffer?: Buffer;
  private packet?: Packet;

  constructor(private stream: ReadableStream) {
    super();
    this.stream.on('readable', this._tryRead.bind(this));
    this.stream.on('error', (err) => {
      return this.emit('error', err);
    });
    this.stream.on('end', () => {
      return this.emit('end');
    });
    setImmediate(this._tryRead.bind(this));
  }

  private _tryRead(): void {
    while (this._appendChunk()) {
      while (this.buffer) {
        if (this.inBody) {
          if (!(this.buffer.length >= this.packet.length)) {
            break;
          }
          this.packet.data = this._consume(this.packet.length);
          if (!this.packet.verifyChecksum()) {
            this.emit('error', new PacketReader.ChecksumError(this.packet));
            return;
          }
          this.emit('packet', this.packet);
          this.inBody = false;
        } else {
          if (!(this.buffer.length >= 24)) {
            break;
          }
          const header = this._consume(24);
          this.packet = new Packet(
            header.readUInt32LE(0),
            header.readUInt32LE(4),
            header.readUInt32LE(8),
            header.readUInt32LE(12),
            header.readUInt32LE(16),
            header.readUInt32LE(20),
            Buffer.alloc(0),
          );
          if (!this.packet.verifyMagic()) {
            this.emit('error', new PacketReader.MagicError(this.packet));
            return;
          }
          if (this.packet.length === 0) {
            this.emit('packet', this.packet);
          } else {
            this.inBody = true;
          }
        }
      }
    }
  }

  private _appendChunk(): Buffer | null {
    const chunk = this.stream.read() as Buffer;
    if (chunk) {
      if (this.buffer) {
        return (this.buffer = Buffer.concat([this.buffer, chunk], this.buffer.length + chunk.length));
      } else {
        return (this.buffer = chunk);
      }
    } else {
      return null;
    }
  }

  private _consume(length): Buffer {
    const chunk = this.buffer.slice(0, length);
    this.buffer = length === this.buffer.length ? null : this.buffer.slice(length);
    return chunk;
  }
}
