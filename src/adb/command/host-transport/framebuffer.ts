import { spawn } from 'child_process';
import d from 'debug';
import RgbTransform from '../../framebuffer/rgbtransform';
import Protocol from '../../protocol';
import Command from '../../command';
import { Readable } from 'stream';
import FramebufferMeta, { ColorFormat } from '../../../FramebufferMeta';
import FramebufferStreamWithMeta from '../../../FramebufferStreamWithMeta';
import Bluebird from 'bluebird';

const debug = d('adb:command:framebuffer');

// FIXME(intentional any): not "any" will break it all
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default class FrameBufferCommand extends Command<any> {
  execute(format: string): Bluebird<FramebufferStreamWithMeta> {
    this._send('framebuffer:');
    return this.parser.readAscii(4).then((reply) => {
      switch (reply) {
        case Protocol.OKAY:
          return this.parser.readBytes(52).then((header) => {
            let stream: FramebufferStreamWithMeta;
            const meta = this._parseHeader(header);
            switch (format) {
              case 'raw':
                stream = this.parser.raw() as FramebufferStreamWithMeta;
                stream.meta = meta;
                return stream;
              default:
                stream = this._convert(meta, format) as FramebufferStreamWithMeta;
                stream.meta = meta;
                return stream;
            }
          });
        case Protocol.FAIL:
          return this.parser.readError();
        default:
          return this.parser.unexpected(reply, 'OKAY or FAIL');
      }
    });
  }

  _convert(meta: FramebufferMeta, format: string, raw?: Readable): Readable {
    debug(`Converting raw framebuffer stream into ${format.toUpperCase()}`);
    switch (meta.format) {
      case 'rgb':
      case 'rgba':
        break;
      default:
        // Known to be supported by GraphicsMagick
        debug(`Silently transforming '${meta.format}' into 'rgb' for \`gm\``);
        const transform = new RgbTransform(meta);
        meta.format = 'rgb';
        raw = this.parser.raw().pipe(transform);
    }
    const proc = spawn('gm', ['convert', '-size', `${meta.width}x${meta.height}`, `${meta.format}:-`, `${format}:-`]);
    if (raw) {
      raw.pipe(proc.stdin);
    }
    return proc.stdout;
  }

  _parseHeader(header: Buffer): FramebufferMeta {
    let offset = 0;
    const version = header.readUInt32LE(offset);
    if (version === 16) {
      throw new Error('Old-style raw images are not supported');
    }
    offset += 4;
    const bpp = header.readUInt32LE(offset);
    offset += 4;
    const size = header.readUInt32LE(offset);
    offset += 4;
    const width = header.readUInt32LE(offset);
    offset += 4;
    const height = header.readUInt32LE(offset);
    offset += 4;
    const red_offset = header.readUInt32LE(offset);
    offset += 4;
    const red_length = header.readUInt32LE(offset);
    offset += 4;
    const blue_offset = header.readUInt32LE(offset);
    offset += 4;
    const blue_length = header.readUInt32LE(offset);
    offset += 4;
    const green_offset = header.readUInt32LE(offset);
    offset += 4;
    const green_length = header.readUInt32LE(offset);
    offset += 4;
    const alpha_offset = header.readUInt32LE(offset);
    offset += 4;
    const alpha_length = header.readUInt32LE(offset);
    let format: ColorFormat = blue_offset === 0 ? 'bgr' : 'rgb';
    if (bpp === 32 || alpha_length) {
      format += 'a';
    }
    return {
      version,
      bpp,
      size,
      width,
      height,
      red_offset,
      red_length,
      blue_offset,
      blue_length,
      green_offset,
      green_length,
      alpha_offset,
      alpha_length,
      format: format as ColorFormat,
    };
  }
}
