/* eslint-disable prefer-const */
import * as Fs from 'fs';
import * as Path from 'path';
import Bluebird from 'bluebird';
import { EventEmitter } from 'events';
import d from 'debug';
import Parser from './parser';
import Protocol from './protocol';
import Stats from './sync/stats';
import Entry from './sync/entry';
import PushTransfer from './sync/pushtransfer';
import PullTransfer from './sync/pulltransfer';
import Connection from './connection';
import { Callback } from '../Callback';
import { Readable } from 'stream';

const TEMP_PATH = '/data/local/tmp';
const DEFAULT_CHMOD = 0o644;
const DATA_MAX_LENGTH = 65536;
const debug = d('adb:sync');

interface ENOENT extends Error {
  errno: 34;
  code: 'ENOENT';
  path: string;
}

export default class Sync extends EventEmitter {
  private parser: Parser;

  public static temp(path: string): string {
    return `${TEMP_PATH}/${Path.basename(path)}`;
  }

  constructor(private connection: Connection) {
    super();
    // this.connection = connection;
    this.parser = this.connection.parser as Parser;
  }

  public stat(path: string, callback?: Callback<Stats>): Bluebird<Stats> {
    this._sendCommandWithArg(Protocol.STAT, path);
    return this.parser
      .readAscii(4)
      .then((reply) => {
        switch (reply) {
          case Protocol.STAT:
            return this.parser.readBytes(12).then((stat) => {
              const mode = stat.readUInt32LE(0);
              const size = stat.readUInt32LE(4);
              const mtime = stat.readUInt32LE(8);
              if (mode === 0) {
                return this._enoent(path);
              } else {
                return new Stats(mode, BigInt(size), mtime);
              }
            });
          case Protocol.FAIL:
            return this._readError();
          default:
            return this.parser.unexpected(reply, 'STAT or FAIL');
        }
      })
      .nodeify(callback);
  }

  public sta2(path: string, callback?: Callback<Stats>): Bluebird<Stats> {
    this._sendCommandWithArg(Protocol.STA2, path);
    return this.parser
      .readAscii(4)
      .then((reply) => {
        switch (reply) {
          case Protocol.STA2:
            return this.parser.readBytes(68).then((stat) => {
              const mode = stat.readUInt32LE(20);
              const size = stat.readBigUInt64LE(36);
              const mtime = stat.readBigUInt64LE(52);
              if (mode === 0) {
                return this._enoent(path);
              } else {
                return new Stats(mode, size, Number(mtime));
              }
            });
          case Protocol.FAIL:
            return this._readError();
          default:
            return this.parser.unexpected(reply, 'STA2 or FAIL');
        }
      })
      .nodeify(callback);
  }

  public readdir(path: string, callback?: Callback<Entry[]>): Bluebird<Entry[]> {
    const files: Entry[] = [];
    const readNext = () => {
      return this.parser.readAscii(4).then((reply) => {
        switch (reply) {
          case Protocol.DENT:
            return this.parser.readBytes(16).then((stat) => {
              const mode = stat.readUInt32LE(0);
              const size = stat.readUInt32LE(4);
              const mtime = stat.readUInt32LE(8);
              const namelen = stat.readUInt32LE(12);
              return this.parser.readBytes(namelen).then(function (name) {
                const nameString = name.toString();
                // Skip '.' and '..' to match Node's fs.readdir().
                if (!(nameString === '.' || nameString === '..')) {
                  files.push(new Entry(nameString, mode, size, mtime));
                }
                return readNext();
              });
            });
          case Protocol.DONE:
            return this.parser.readBytes(16).then(function () {
              return files;
            });
          case Protocol.FAIL:
            return this._readError();
          default:
            return this.parser.unexpected(reply, 'DENT, DONE or FAIL');
        }
      });
    };
    this._sendCommandWithArg(Protocol.LIST, path);
    return readNext().nodeify(callback);
  }

  public push(contents: string | Readable, path: string, mode?: number): PushTransfer {
    if (typeof contents === 'string') {
      return this.pushFile(contents, path, mode);
    } else {
      return this.pushStream(contents, path, mode);
    }
  }

  pushFile(file: string, path: string, mode = DEFAULT_CHMOD): PushTransfer {
    mode || (mode = DEFAULT_CHMOD);
    return this.pushStream(Fs.createReadStream(file), path, mode);
  }

  public pushStream(stream: Readable, path: string, mode = DEFAULT_CHMOD): PushTransfer {
    mode |= Stats.S_IFREG;
    this._sendCommandWithArg(Protocol.SEND, `${path},${mode}`);
    return this._writeData(stream, Math.floor(Date.now() / 1000));
  }

  public pull(path: string): PullTransfer {
    this._sendCommandWithArg(Protocol.RECV, `${path}`);
    return this._readData();
  }

  public end(): Sync {
    this.connection.end();
    return this;
  }

  public tempFile(path: string): string {
    return Sync.temp(path);
  }

  private _writeData(stream: Readable, timeStamp: number): PushTransfer {
    const transfer = new PushTransfer();
    const writeData = () => {
      let readableListener: () => void;
      let connErrorListener: (err: Error) => void;
      let endListener: () => void;
      let errorListener: (err: Error) => void;

      let resolver = Bluebird.defer();
      const writer = Bluebird.resolve();
      endListener = () => {
        writer.then(() => {
          this._sendCommandWithLength(Protocol.DONE, timeStamp);
          return resolver.resolve();
        });
      };
      stream.on('end', endListener);
      const waitForDrain = () => {
        resolver = Bluebird.defer();
        const drainListener = () => {
          resolver.resolve();
        };
        this.connection.on('drain', drainListener);
        return resolver.promise.finally(() => {
          return this.connection.removeListener('drain', drainListener);
        });
      };
      const track = () => transfer.pop();
      const writeNext = () => {
        let chunk: Buffer;
        if ((chunk = stream.read(DATA_MAX_LENGTH) || stream.read())) {
          this._sendCommandWithLength(Protocol.DATA, chunk.length);
          transfer.push(chunk.length);
          if (this.connection.write(chunk, track)) {
            return writeNext();
          } else {
            return waitForDrain().then(writeNext);
          }
        } else {
          return Bluebird.resolve();
        }
      };
      readableListener = () => writer.then(writeNext);
      stream.on('readable', readableListener);
      errorListener = (err) => resolver.reject(err);
      stream.on('error', errorListener);
      connErrorListener = (err: Error) => {
        stream.destroy(err);
        this.connection.end();
        resolver.reject(err);
      };
      this.connection.on('error', connErrorListener);
      return resolver.promise.finally(() => {
        stream.removeListener('end', endListener);
        stream.removeListener('readable', readableListener);
        stream.removeListener('error', errorListener);
        this.connection.removeListener('error', connErrorListener);
        return writer.cancel();
      });
    };
    const readReply = () => {
      return this.parser.readAscii(4).then((reply) => {
        switch (reply) {
          case Protocol.OKAY:
            return this.parser.readBytes(4).then(function () {
              return true;
            });
          case Protocol.FAIL:
            return this._readError();
          default:
            return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
      });
    };
    // While I can't think of a case that would break this double-Promise
    // writer-reader arrangement right now, it's not immediately obvious
    // that the code is correct and it may or may not have some failing
    // edge cases. Refactor pending.
    const writer = writeData()
      // .cancellable()
      .catch(Bluebird.CancellationError, () => {
        return this.connection.end();
      })
      .catch(function (err) {
        transfer.emit('error', err);
        return reader.cancel();
      });
    const reader = readReply()
      .catch(Bluebird.CancellationError, () => true)
      .catch((err) => {
        transfer.emit('error', err);
        return writer.cancel();
      })
      .finally(() => {
        return transfer.end();
      });
    transfer.on('cancel', () => {
      writer.cancel();
      reader.cancel();
    });
    return transfer;
  }

  private _readData(): PullTransfer {
    const transfer = new PullTransfer();
    const readNext = () => {
      return this.parser.readAscii(4).then((reply) => {
        switch (reply) {
          case Protocol.DATA:
            return this.parser.readBytes(4).then((lengthData) => {
              const length = lengthData.readUInt32LE(0);
              return this.parser.readByteFlow(length, transfer).then(readNext);
            });
          case Protocol.DONE:
            return this.parser.readBytes(4).then(function () {
              return true;
            });
          case Protocol.FAIL:
            return this._readError();
          default:
            return this.parser.unexpected(reply, 'DATA, DONE or FAIL');
        }
      });
    };
    const reader = readNext()
      .catch(Bluebird.CancellationError, () => this.connection.end())
      .catch((err: Error) => transfer.emit('error', err))
      .finally(function () {
        transfer.removeListener('cancel', cancelListener);
        return transfer.end();
      });
    const cancelListener = () => reader.cancel();
    transfer.on('cancel', cancelListener);
    return transfer;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _readError(): Bluebird<any> {
    return this.parser
      .readBytes(4)
      .then((length: Buffer) => {
        return this.parser.readBytes(length.readUInt32LE(0)).then((buf: Buffer) => {
          return Bluebird.reject(new Parser.FailError(buf.toString()));
        });
      })
      .finally(() => {
        return this.parser.end();
      });
  }

  private _sendCommandWithLength(cmd: string, length: number): Connection {
    if (cmd !== Protocol.DATA) {
      debug(cmd);
    }
    const payload = Buffer.alloc(cmd.length + 4);
    payload.write(cmd, 0, cmd.length);
    payload.writeUInt32LE(length, cmd.length);
    return this.connection.write(payload);
  }

  private _sendCommandWithArg(cmd: string, arg: string): Connection {
    debug(`${cmd} ${arg}`);
    const arglen = Buffer.byteLength(arg, 'utf-8');
    const payload = Buffer.alloc(cmd.length + 4 + arglen);
    let pos = 0;
    payload.write(cmd, pos, cmd.length);
    pos += cmd.length;
    payload.writeUInt32LE(arglen, pos);
    pos += 4;
    payload.write(arg, pos);
    return this.connection.write(payload);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _enoent(path: string): Bluebird<any> {
    const err: ENOENT = new Error(`ENOENT, no such file or directory '${path}'`) as ENOENT;
    err.errno = 34;
    err.code = 'ENOENT';
    err.path = path;
    return Bluebird.reject(err);
  }
}
