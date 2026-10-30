import * as Fs from 'fs';
import * as Path from 'path';
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
import { Socket } from 'net';
import { nodeify, warnUnhandled } from './promise';

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

  public stat(path: string, callback?: Callback<Stats>): Promise<Stats> {
    this._sendCommandWithArg(Protocol.STAT, path);
    const stats = this.parser.readAscii(4).then((reply) => {
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
    });
    return nodeify(stats, callback);
  }

  public sta2(path: string, callback?: Callback<Stats>): Promise<Stats> {
    this._sendCommandWithArg(Protocol.STA2, path);
    const stats = this.parser.readAscii(4).then((reply) => {
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
    });
    return nodeify(stats, callback);
  }

  public readdir(path: string, callback?: Callback<Entry[]>): Promise<Entry[]> {
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
    return nodeify(readNext(), callback);
  }

  public push(contents: string | Readable, path: string, mode?: number): PushTransfer {
    if (typeof contents === 'string') {
      return this.pushFile(contents, path, mode);
    } else {
      return this.pushStream(contents, path, mode);
    }
  }

  pushFile(file: string, path: string, mode = DEFAULT_CHMOD): PushTransfer {
    if (!mode) {
      mode = DEFAULT_CHMOD;
    }
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
    // Cancellation is scoped to this transfer: the reply read gets its own
    // AbortSignal and the writer can be rejected from the outside, both with
    // `cancelled`, so a cancel never affects other operations on this Sync.
    // Replaces bluebird's writer.cancel() and reader.cancel().
    const cancelled = new Parser.CancellationError();
    const reader = new AbortController();
    let stopWriter: (err: Error) => void = () => undefined;
    const writeData = () => {
      let readableListener: () => void;
      let connErrorListener: (err: Error) => void;
      let endListener: () => void;
      let errorListener: (err: Error) => void;
      // Ends a pending wait for 'drain' and removes its listeners.
      let stopWaitingForDrain: (() => void) | undefined;
      let finished = false;

      return new Promise<void>((resolve, reject) => {
        // Serialises the writes; each 'readable' event queues another round.
        let writer = Promise.resolve();
        const fail = (err: Error) => {
          finished = true;
          reject(err);
        };
        stopWriter = fail;
        endListener = () => {
          writer = writer.then(() => {
            if (finished) {
              return;
            }
            this._sendCommandWithLength(Protocol.DONE, timeStamp);
            finished = true;
            resolve();
          });
        };
        stream.on('end', endListener);
        // Connection.write() returns the connection, not socket.write()'s
        // result, so ask the socket itself whether its buffer is full.
        // Listens on the socket because the connection only forwards 'drain'
        // from connect(). No 'error' listener: Connection forwards socket
        // errors only while it is the sole listener, and connErrorListener
        // handles them. 'close' always follows an error.
        const waitForDrain = (socket: Socket) => {
          return new Promise<void>((drained, closed) => {
            if (socket.destroyed) {
              closed(new Error('Connection closed while pushing'));
              return;
            }
            const stop = () => {
              socket.removeListener('drain', onDrain);
              socket.removeListener('close', onClose);
              stopWaitingForDrain = undefined;
            };
            const onDrain = () => {
              stop();
              drained();
            };
            const onClose = () => {
              stop();
              closed(new Error('Connection closed while pushing'));
            };
            socket.on('drain', onDrain);
            socket.on('close', onClose);
            // On fail or cancel, settle so the writer chain can see `finished`.
            stopWaitingForDrain = onDrain;
          });
        };
        const track = () => transfer.pop();
        const writeNext = (): Promise<void> => {
          if (finished) {
            return Promise.resolve();
          }
          // A mocked Connection may not have a socket.
          const socket: Socket | undefined = this.connection.socket;
          // Check before reading, the SEND and DATA headers count too.
          if (socket?.writableNeedDrain) {
            return waitForDrain(socket).then(writeNext);
          }
          const chunk: Buffer | null = stream.read(DATA_MAX_LENGTH) || stream.read();
          if (!chunk) {
            return Promise.resolve();
          }
          this._sendCommandWithLength(Protocol.DATA, chunk.length);
          transfer.push(chunk.length);
          this.connection.write(chunk, track);
          return writeNext();
        };
        readableListener = () => {
          writer = writer.then(writeNext).catch(fail);
        };
        stream.on('readable', readableListener);
        errorListener = (err) => fail(err);
        stream.on('error', errorListener);
        connErrorListener = (err: Error) => {
          stream.destroy(err);
          this.connection.end();
          fail(err);
        };
        this.connection.on('error', connErrorListener);
      }).finally(() => {
        finished = true;
        stream.removeListener('end', endListener);
        stream.removeListener('readable', readableListener);
        stream.removeListener('error', errorListener);
        this.connection.removeListener('error', connErrorListener);
        stopWaitingForDrain?.();
      });
    };
    const readReply = () => {
      const signal = reader.signal;
      return this.parser.readAscii(4, signal).then((reply) => {
        switch (reply) {
          case Protocol.OKAY:
            return this.parser.readBytes(4, signal).then(function () {
              return true;
            });
          case Protocol.FAIL:
            return this._readError(signal);
          default:
            return this.parser.unexpected(reply, 'OKAY or FAIL');
        }
      });
    };
    // While I can't think of a case that would break this double-Promise
    // writer-reader arrangement right now, it's not immediately obvious
    // that the code is correct and it may or may not have some failing
    // edge cases. Refactor pending.
    // Clean up before emitting 'error': without a listener the emit throws.
    writeData()
      .catch((err) => {
        if (err === cancelled) {
          return;
        }
        reader.abort(cancelled);
        transfer.emit('error', err);
      })
      .catch(warnUnhandled);
    readReply()
      .catch((err) => {
        if (err === cancelled) {
          return true;
        }
        stopWriter(cancelled);
        transfer.emit('error', err);
      })
      .finally(() => {
        transfer.removeListener('cancel', cancelListener);
        return transfer.end();
      })
      .catch(warnUnhandled);
    const cancelListener = () => {
      stopWriter(cancelled);
      reader.abort(cancelled);
      // Part of the file may have been sent, so the protocol state is
      // unknown; the connection can't be reused.
      this.connection.end();
    };
    transfer.on('cancel', cancelListener);
    return transfer;
  }

  private _readData(): PullTransfer {
    const transfer = new PullTransfer();
    // Scoped to this transfer, like in _writeData().
    const cancelled = new Parser.CancellationError();
    const reader = new AbortController();
    const signal = reader.signal;
    const readEnd = (afterEnd?) => {
      transfer.removeListener('cancel', cancelListener);
      const retEnd = transfer.end();
      if (afterEnd) {
        return afterEnd();
      } else {
        return retEnd;
      }
    };
    const readNext = () => {
      return this.parser.readAscii(4, signal).then((reply) => {
        switch (reply) {
          case Protocol.DATA:
            return this.parser.readBytes(4, signal).then((lengthData) => {
              const length = lengthData.readUInt32LE(0);
              return this.parser.readByteFlow(length, transfer, signal).then(() => {
                return readNext();
              });
            });
          case Protocol.DONE:
            return this.parser.readBytes(4, signal).then(function () {
              return readEnd();
            });
          case Protocol.FAIL:
            return readEnd(() => {
              return this._readError(signal);
            });
          default:
            return readEnd(() => {
              return this.parser.unexpected(reply, 'DATA, DONE or FAIL');
            });
        }
      });
    };
    readNext()
      .catch((err: Error) => {
        if (err === cancelled) {
          // The protocol state is unknown mid-transfer, so the connection
          // can't be reused. End the transfer too, so pipes from it finish.
          this.connection.end();
          readEnd();
          return;
        }
        transfer.removeListener('cancel', cancelListener);
        transfer.emit('error', err);
      })
      .catch(warnUnhandled);
    const cancelListener = () => reader.abort(cancelled);
    transfer.on('cancel', cancelListener);
    return transfer;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _readError(signal?: AbortSignal): Promise<any> {
    return this.parser
      .readBytes(4, signal)
      .then((length: Buffer) => {
        return this.parser.readBytes(length.readUInt32LE(0), signal).then((buf: Buffer) => {
          throw new Parser.FailError(buf.toString());
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
  private _enoent(path: string): Promise<any> {
    const err: ENOENT = new Error(`ENOENT, no such file or directory '${path}'`) as ENOENT;
    err.errno = 34;
    err.code = 'ENOENT';
    err.path = path;
    return Promise.reject(err);
  }
}
