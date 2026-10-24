import Protocol from './protocol';
import { Duplex } from 'stream';

class FailError extends Error {
  constructor(message: string) {
    super(`Failure: '${message}'`);
    Object.setPrototypeOf(this, FailError.prototype);
    this.name = 'FailError';
    Error.captureStackTrace(this, FailError);
  }
}

class PrematureEOFError extends Error {
  public missingBytes: number;
  constructor(howManyMissing: number) {
    super(`Premature end of stream, needed ${howManyMissing} more bytes`);
    Object.setPrototypeOf(this, PrematureEOFError.prototype);
    this.name = 'PrematureEOFError';
    this.missingBytes = howManyMissing;
    Error.captureStackTrace(this, PrematureEOFError);
  }
}

class UnexpectedDataError extends Error {
  constructor(
    public unexpected: string,
    public expected: string,
  ) {
    super(`Unexpected '${unexpected}', was expecting ${expected}`);
    Object.setPrototypeOf(this, UnexpectedDataError.prototype);
    this.name = 'UnexpectedDataError';
    Error.captureStackTrace(this, UnexpectedDataError);
  }
}

class TimeoutError extends Error {
  constructor() {
    super(`Socket timeout reached.`);
    Object.setPrototypeOf(this, TimeoutError.prototype);
    this.name = 'TimeoutError';
    Error.captureStackTrace(this, TimeoutError);
  }
}

class CancellationError extends Error {
  constructor() {
    super('Parser was cancelled');
    Object.setPrototypeOf(this, CancellationError.prototype);
    this.name = 'CancellationError';
    Error.captureStackTrace(this, CancellationError);
  }
}

type Resolve<T> = (value: T) => void;
type Reject = (err: Error) => void;

interface ReadHandlers {
  readable: () => void;
  end: () => void;
}

export default class Parser {
  public static FailError = FailError;
  public static PrematureEOFError = PrematureEOFError;
  public static UnexpectedDataError = UnexpectedDataError;
  public static TimeoutError = TimeoutError;
  public static CancellationError = CancellationError;
  private ended = false;
  private cancelled = false;
  private readonly pending = new Set<Reject>();

  constructor(public stream: Duplex) {
    // empty
  }

  /**
   * Tears the parser down for good: every pending read rejects with
   * `Parser.CancellationError`, and so does every read started afterwards.
   * Use it only when the whole connection is being given up, as a tracker's
   * `end()` does. To cancel a single operation on a shared connection, pass
   * an `AbortSignal` to its reads instead. It doesn't touch the stream; end
   * or destroy it separately. `end()` keeps working after a cancel.
   */
  public cancel(): void {
    this.cancelled = true;
    for (const reject of Array.from(this.pending)) {
      reject(new Parser.CancellationError());
    }
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  public end(): Promise<boolean> {
    if (this.ended) {
      return Promise.resolve<boolean>(true);
    }
    let tryRead: () => void;
    let errorListener: (error: Error) => void;
    let endListener: () => void;
    let timeoutListener: () => void;
    return new Promise<boolean>((resolve, reject) => {
      tryRead = () => {
        while (this.stream.read()) {
          // ignore
        }
      };
      errorListener = function (err) {
        return reject(err);
      };
      endListener = () => {
        this.ended = true;
        return resolve(true);
      };
      timeoutListener = () => {
        this.stream.end();
        return reject(new Parser.TimeoutError());
      };
      this.stream.on('readable', tryRead);
      this.stream.on('error', errorListener);
      this.stream.on('end', endListener);
      this.stream.on('timeout', timeoutListener);
      this.stream.read(0);
      this.stream.end();
    }).finally(() => {
      this.stream.removeListener('readable', tryRead);
      this.stream.removeListener('error', errorListener);
      this.stream.removeListener('end', endListener);
      this.stream.removeListener('timeout', timeoutListener);
    });
  }

  /**
   * Runs one read: attaches the listeners, tries to read right away, and
   * detaches everything once the read settles, the parser is cancelled or
   * `signal` aborts. An aborted read rejects with `signal.reason`, so the
   * caller that aborted can recognise its own cancellation.
   */
  private _read<T>(handlers: (resolve: Resolve<T>, reject: Reject) => ReadHandlers, signal?: AbortSignal): Promise<T> {
    if (this.cancelled) {
      return Promise.reject(new Parser.CancellationError());
    }
    if (signal?.aborted) {
      return Promise.reject(signal.reason);
    }
    if (this.stream.readableEnded) {
      // The stream ended between two reads, while nobody listened for 'end'.
      this.ended = true;
    }
    let cleanup: (() => void) | undefined;
    return new Promise<T>((resolve, reject) => {
      const { readable, end } = handlers(resolve, reject);
      const errorListener = (err: Error) => reject(err);
      const timeoutListener = () => {
        this.stream.end();
        reject(new Parser.TimeoutError());
      };
      this.stream.on('readable', readable);
      this.stream.on('error', errorListener);
      this.stream.on('end', end);
      this.stream.on('timeout', timeoutListener);
      this.pending.add(reject);
      const abortListener = () => reject(signal.reason);
      signal?.addEventListener('abort', abortListener, { once: true });
      cleanup = () => {
        signal?.removeEventListener('abort', abortListener);
        this.stream.removeListener('readable', readable);
        this.stream.removeListener('error', errorListener);
        this.stream.removeListener('end', end);
        this.stream.removeListener('timeout', timeoutListener);
        this.pending.delete(reject);
      };
      readable();
    }).finally(() => cleanup?.());
  }

  public raw(): Duplex {
    return this.stream;
  }

  public readAll(signal?: AbortSignal): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return this._read<Buffer>(
      (resolve) => ({
        readable: () => {
          let chunk;
          while ((chunk = this.stream.read())) {
            chunks.push(chunk);
          }
          if (this.ended) {
            resolve(Buffer.concat(chunks));
          }
        },
        end: () => {
          this.ended = true;
          resolve(Buffer.concat(chunks));
        },
      }),
      signal,
    );
  }

  public readAscii(howMany: number, signal?: AbortSignal): Promise<string> {
    return this.readBytes(howMany, signal).then((chunk) => chunk.toString('ascii'));
  }

  public readBytes(howMany: number, signal?: AbortSignal): Promise<Buffer> {
    return this._read<Buffer>(
      (resolve, reject) => ({
        readable: () => {
          if (howMany) {
            const chunk = this.stream.read(howMany);
            if (chunk) {
              // If the stream ends while still having unread bytes, the read call
              // will ignore the limit and just return what it's got.
              howMany -= chunk.length;
              if (howMany === 0) {
                return resolve(chunk);
              }
            }
            if (this.ended) {
              return reject(new Parser.PrematureEOFError(howMany));
            }
          } else {
            return resolve(Buffer.alloc(0));
          }
        },
        end: () => {
          this.ended = true;
          reject(new Parser.PrematureEOFError(howMany));
        },
      }),
      signal,
    );
  }

  public readByteFlow(howMany: number, targetStream: Duplex, signal?: AbortSignal): Promise<void> {
    return this._read<void>(
      (resolve, reject) => ({
        readable: () => {
          if (howMany) {
            // Try to get the exact amount we need first. If unsuccessful, take
            // whatever is available, which will be less than the needed amount.
            // avoid chunk is undefined.
            let chunk;
            while ((chunk = this.stream.read(howMany) || this.stream.read())) {
              howMany -= chunk.length;
              targetStream.write(chunk);
              if (howMany === 0) {
                return resolve();
              }
            }
            if (this.ended) {
              return reject(new Parser.PrematureEOFError(howMany));
            }
          } else {
            return resolve();
          }
        },
        end: () => {
          this.ended = true;
          reject(new Parser.PrematureEOFError(howMany));
        },
      }),
      signal,
    );
  }

  public readError(signal?: AbortSignal): Promise<never> {
    return this.readValue(signal)
      .then(function (value) {
        throw new Parser.FailError(value.toString());
      })
      .finally(() => {
        // A FAIL ends the smart-socket conversation, but not all servers
        // close the connection afterwards (e.g. adb 1.0.39 keeps it open
        // after a failed host:transport), so we must destroy it ourselves
        // to avoid leaking the socket.
        this.stream.destroy();
      });
  }

  public readValue(signal?: AbortSignal): Promise<Buffer> {
    return this.readAscii(4, signal).then((value) => {
      const length = Protocol.decodeLength(value);
      return this.readBytes(length, signal);
    });
  }

  public readUntil(code: number, signal?: AbortSignal): Promise<Buffer> {
    let skipped = Buffer.alloc(0);
    const read = () => {
      return this.readBytes(1, signal).then(function (chunk) {
        if (chunk[0] === code) {
          return skipped;
        } else {
          skipped = Buffer.concat([skipped, chunk]);
          return read();
        }
      });
    };
    return read();
  }

  searchLine(re: RegExp, signal?: AbortSignal): Promise<RegExpExecArray> {
    return this.readLine(signal).then((line) => {
      const match = re.exec(line.toString());
      if (match) {
        return match;
      } else {
        return this.searchLine(re, signal);
      }
    });
  }

  public readLine(signal?: AbortSignal): Promise<Buffer> {
    return this.readUntil(0x0a, signal).then(function (line) {
      // '\n'
      if (line[line.length - 1] === 0x0d) {
        // '\r'
        return line.slice(0, -1);
      } else {
        return line;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public unexpected(data: string, expected: string): Promise<any> {
    // The protocol state is unknown after unexpected data, so the
    // connection can never be safely reused; destroy it to avoid leaks.
    this.stream.destroy();
    return Promise.reject(new Parser.UnexpectedDataError(data, expected));
  }
}
