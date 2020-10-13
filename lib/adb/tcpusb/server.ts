import * as Net from 'net';
import Socket from './socket';
import { EventEmitter } from 'events';
import Client from '../client';
import { SocketOptions } from '../../SocketOptions';

type NetServer = Net.Server;

class Server extends EventEmitter {
	private readonly server: Net.Server;
	private connections: Socket[] = [];

	constructor(
		private readonly client: Client,
		private readonly serial: string,
		private readonly options: SocketOptions,
	) {
		super();
		this.server = Net.createServer({
			allowHalfOpen: true,
		});
		this.server.on('error', (err) => {
			return this.emit('error', err);
		});
		this.server.on('listening', () => {
			return this.emit('listening');
		});
		this.server.on('close', () => {
			return this.emit('close');
		});
		this.server.on('connection', (conn) => {
			const socket = new Socket(this.client, this.serial, conn, this.options);
			this.connections.push(socket);
			socket.on('error', (err) => {
				// 'conn' is guaranteed to get ended
				return this.emit('error', err);
			});
			socket.once('end', () => {
				// 'conn' is guaranteed to get ended
				return (this.connections = this.connections.filter(function (val) {
					return val !== socket;
				}));
			});
			return this.emit('connection', socket);
		});
	}

	public listen(...args: Parameters<NetServer['listen']>): Server {
		this.server.listen(...args);
		return this;
	}

	public close(): Server {
		this.server.close();
		return this;
	}

	public end(): Server {
		const ref = this.connections;
		for (let i = 0, len = ref.length; i < len; i++) {
			ref[i].end();
		}
		return this;
	}
}

export = Server;
