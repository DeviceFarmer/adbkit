import * as Net from 'net';
import { EventEmitter } from 'events';
import { ChildProcess, execFile, ExecFileOptions } from 'child_process';
import Parser from './parser';
import dump from './dump';
import d from 'debug';
import { Socket } from 'net';
import Bluebird from 'bluebird';
import { ClientOptions } from '../ClientOptions';

const debug = d('adb:connection');

class Connection extends EventEmitter {
	private socket: Socket;
	public parser: Parser;
	private triedStarting: boolean;

	constructor(public options: ClientOptions) {
		super();
		this.socket = null;
		this.parser = null;
		this.triedStarting = false;
	}

	public connect(): Bluebird<Connection> {
		this.socket = Net.connect(this.options);
		this.socket.setNoDelay(true);
		this.parser = new Parser(this.socket);
		this.socket.on('connect', () => {
			return this.emit('connect');
		});
		this.socket.on('end', () => {
			return this.emit('end');
		});
		this.socket.on('drain', () => {
			return this.emit('drain');
		});
		this.socket.on('timeout', () => {
			return this.emit('timeout');
		});
		this.socket.on('close', (hadError) => {
			return this.emit('close', hadError);
		});
		return new Bluebird((resolve, reject) => {
			this.socket.once('connect', resolve);
			return this.socket.once('error', reject);
		})
			.catch((err) => {
				if (err.code === 'ECONNREFUSED' && !this.triedStarting) {
					debug("Connection was refused, let's try starting the server once");
					this.triedStarting = true;
					return this.startServer().then(() => {
						return this.connect();
					});
				} else {
					this.end();
					throw err;
				}
			})
			.then(() => {
				// Emit unhandled error events, so that they can be handled on the client.
				// Without this, they would just crash node unavoidably.
				this.socket.on('error', (err) => {
					if (this.socket.listenerCount('error') === 1) {
						return this.emit('error', err);
					}
				});
				return this;
			});
	}

	public end(): Connection {
		this.socket.end();
		return this;
	}

	public write(data: string | Uint8Array, callback?: (err?: Error) => void): Connection {
		this.socket.write(dump(data), callback);
		return this;
	}

	public startServer(): Bluebird<ChildProcess> {
		let port;
		if ('port' in this.options) {
			port = this.options.port;
		}
		const args = port ? ['-P', port, 'start-server'] : ['start-server'];
		debug(`Starting ADB server via '${this.options.bin} ${args.join(' ')}'`);
		return this._exec(args, {});
	}

	private _exec(args, options): Bluebird<ChildProcess> {
		debug(`CLI: ${this.options.bin} ${args.join(' ')}`);
		return Bluebird.promisify<
			ChildProcess,
			string,
			ReadonlyArray<string>,
			({ encoding?: string | null } & ExecFileOptions) | undefined | null
		>(execFile)(this.options.bin, args, options);
	}

	// _handleError(err) {}
}

export = Connection;
