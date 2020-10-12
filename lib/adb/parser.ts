import Bluebird from 'bluebird';
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
	constructor(public unexpected: string, public expected: string) {
		super(`Unexpected '${unexpected}', was expecting ${expected}`);
		Object.setPrototypeOf(this, UnexpectedDataError.prototype);
		this.name = 'UnexpectedDataError';
		Error.captureStackTrace(this, UnexpectedDataError);
	}
}

class Parser {
	public static FailError = FailError;
	public static PrematureEOFError = PrematureEOFError;
	public static UnexpectedDataError = UnexpectedDataError;
	private ended = false;

	constructor(public stream: Duplex) {}

	public end(): Bluebird<boolean> {
		if (this.ended) {
			return Bluebird.resolve<boolean>(true);
		}
		const resolver = Bluebird.defer<boolean>();
		const tryRead = () => {
			while (this.stream.read()) {}
		};
		const errorListener = function (err) {
			return resolver.reject(err);
		};
		const endListener = () => {
			this.ended = true;
			return resolver.resolve(true);
		};
		this.stream.on('readable', tryRead);
		this.stream.on('error', errorListener);
		this.stream.on('end', endListener);
		this.stream.read(0);
		this.stream.end();
		return resolver.promise.cancellable().finally(() => {
			this.stream.removeListener('readable', tryRead);
			this.stream.removeListener('error', errorListener);
			return this.stream.removeListener('end', endListener);
		});
	}

	public raw(): Duplex {
		return this.stream;
	}

	public readAll(): Bluebird<Buffer> {
		let all = new Buffer(0);
		const resolver = Bluebird.defer<Buffer>();
		const tryRead = () => {
			let chunk;
			while ((chunk = this.stream.read())) {
				all = Buffer.concat([all, chunk]);
			}
			if (this.ended) {
				return resolver.resolve(all);
			}
		};
		const errorListener = function (err) {
			return resolver.reject(err);
		};
		const endListener = () => {
			this.ended = true;
			return resolver.resolve(all);
		};
		this.stream.on('readable', tryRead);
		this.stream.on('error', errorListener);
		this.stream.on('end', endListener);
		tryRead();
		return resolver.promise.cancellable().finally(() => {
			this.stream.removeListener('readable', tryRead);
			this.stream.removeListener('error', errorListener);
			return this.stream.removeListener('end', endListener);
		});
	}

	public readAscii(howMany: number): Bluebird<string> {
		return this.readBytes(howMany).then(function (chunk) {
			return chunk.toString('ascii');
		});
	}

	public readBytes(howMany: number): Bluebird<Buffer> {
		const resolver = Bluebird.defer<Buffer>();
		const tryRead = () => {
			if (howMany) {
				const chunk = this.stream.read(howMany);
				if (chunk) {
					// If the stream ends while still having unread bytes, the read call
					// will ignore the limit and just return what it's got.
					howMany -= chunk.length;
					if (howMany === 0) {
						return resolver.resolve(chunk);
					}
				}
				if (this.ended) {
					return resolver.reject(new Parser.PrematureEOFError(howMany));
				}
			} else {
				return resolver.resolve(new Buffer(0));
			}
		};
		const endListener = () => {
			this.ended = true;
			return resolver.reject(new Parser.PrematureEOFError(howMany));
		};
		const errorListener = function (err) {
			return resolver.reject(err);
		};
		this.stream.on('readable', tryRead);
		this.stream.on('error', errorListener);
		this.stream.on('end', endListener);
		tryRead();
		return resolver.promise.cancellable().finally(() => {
			this.stream.removeListener('readable', tryRead);
			this.stream.removeListener('error', errorListener);
			return this.stream.removeListener('end', endListener);
		});
	}

	public readByteFlow(howMany: number, targetStream: Duplex): Bluebird<void> {
		const resolver = Bluebird.defer<void>();
		const tryRead = () => {
			if (howMany) {
				const chunk = this.stream.read(howMany);
				// Try to get the exact amount we need first. If unsuccessful, take
				// whatever is available, which will be less than the needed amount.
				while (chunk || this.stream.read()) {
					howMany -= chunk.length;
					targetStream.write(chunk);
					if (howMany === 0) {
						return resolver.resolve();
					}
				}
				if (this.ended) {
					return resolver.reject(new Parser.PrematureEOFError(howMany));
				}
			} else {
				return resolver.resolve();
			}
		};
		const endListener = () => {
			this.ended = true;
			return resolver.reject(new Parser.PrematureEOFError(howMany));
		};
		const errorListener = function (err) {
			return resolver.reject(err);
		};
		this.stream.on('readable', tryRead);
		this.stream.on('error', errorListener);
		this.stream.on('end', endListener);
		tryRead();
		return resolver.promise.cancellable().finally(() => {
			this.stream.removeListener('readable', tryRead);
			this.stream.removeListener('error', errorListener);
			return this.stream.removeListener('end', endListener);
		});
	}

	public readError(): Bluebird<never> {
		return this.readValue().then(function (value) {
			throw new Parser.FailError(value.toString());
		});
	}

	public readValue(): Bluebird<Buffer> {
		return this.readAscii(4).then((value) => {
			const length = Protocol.decodeLength(value);
			return this.readBytes(length);
		});
	}

	public readUntil(code: number): Bluebird<Buffer> {
		let skipped = new Buffer(0);
		const read = () => {
			return this.readBytes(1).then(function (chunk) {
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

	searchLine(re: RegExp): Bluebird<RegExpExecArray> {
		return this.readLine().then((line) => {
			const match = re.exec(line.toString());
			if (match) {
				return match;
			} else {
				return this.searchLine(re);
			}
		});
	}

	public readLine(): Bluebird<Buffer> {
		return this.readUntil(0x0a).then(function (line) {
			// '\n'
			if (line[line.length - 1] === 0x0d) {
				// '\r'
				return line.slice(0, -1);
			} else {
				return line;
			}
		});
	}

	public unexpected(data: string, expected: string): Bluebird<never> {
		return Bluebird.reject<never>(new Parser.UnexpectedDataError(data, expected));
	}
}

export = Parser;
