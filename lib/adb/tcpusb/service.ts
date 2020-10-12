import d from 'debug';
import { EventEmitter } from 'events';
import Packet from './packet';
import Bluebird from 'bluebird';
import Protocol from '../protocol';
import Client from '../client';
import Socket from './socket';
import ReadableStream = NodeJS.ReadableStream;
const debug = d('adb:tcpusb:service');

class PrematurePacketError extends Error {
	constructor(public packet: Packet) {
		super();
		Object.setPrototypeOf(this, PrematurePacketError.prototype);
		this.name = 'PrematurePacketError';
		this.message = 'Premature packet';
		Error.captureStackTrace(this, Service.PrematurePacketError);
	}
}

class LateTransportError extends Error {
	constructor() {
		super();
		Object.setPrototypeOf(this, LateTransportError.prototype);
		this.name = 'LateTransportError';
		this.message = 'Late transport';
		Error.captureStackTrace(this, Service.LateTransportError);
	}
}

class Service extends EventEmitter {
	public static PrematurePacketError = PrematurePacketError;
	public static LateTransportError = LateTransportError;

	private opened = false;
	private ended = false;
	private transport = null;
	private needAck = false;

	constructor(
		private client: Client,
		private serial: string,
		private localId: number,
		private remoteId: number,
		private socket: Socket,
	) {
		super();
	}

	public end(): Service {
		if (this.transport) {
			this.transport.end();
		}
		if (this.ended) {
			return this;
		}
		debug('O:A_CLSE');
		const localId = this.opened ? this.localId : 0; // Zero can only mean a failed open
		try {
			// We may or may not have gotten here due to @socket ending, so write
			// may fail.
			this.socket.write(Packet.assemble(Packet.A_CLSE, localId, this.remoteId, null));
		} catch (error) {}
		// Let it go
		this.transport = null;
		this.ended = true;
		this.emit('end');
		return this;
	}

	public handle(packet: Packet): Bluebird<Service | boolean> {
		return Bluebird.try<Service | boolean>(() => {
			switch (packet.command) {
				case Packet.A_OPEN:
					return this._handleOpenPacket(packet);
				case Packet.A_OKAY:
					return this._handleOkayPacket(packet);
				case Packet.A_WRTE:
					return this._handleWritePacket(packet);
				case Packet.A_CLSE:
					return this._handleClosePacket(packet);
				default:
					throw new Error(`Unexpected packet ${packet.command}`);
			}
		}).catch((err) => {
			this.emit('error', err);
			return this.end();
		});
	}

	private _handleOpenPacket(packet): Bluebird<boolean> {
		debug('I:A_OPEN', packet);
		return this.client
			.transport(this.serial)
			.then((transport) => {
				this.transport = transport;
				if (this.ended) {
					throw new LateTransportError();
				}
				this.transport.write(Protocol.encodeData(packet.data.slice(0, -1))); // Discard null byte at end
				return this.transport.parser.readAscii(4).then((reply) => {
					switch (reply) {
						case Protocol.OKAY:
							debug('O:A_OKAY');
							this.socket.write(Packet.assemble(Packet.A_OKAY, this.localId, this.remoteId, null));
							return (this.opened = true);
						case Protocol.FAIL:
							return this.transport.parser.readError();
						default:
							return this.transport.parser.unexpected(reply, 'OKAY or FAIL');
					}
				});
			})
			.then(() => {
				return new Bluebird<boolean>((resolve, reject) => {
					this.transport.socket
						.on('readable', () => {
							return this._tryPush();
						})
						.on('end', resolve)
						.on('error', reject);
					return this._tryPush();
				});
			})
			.finally(() => {
				return this.end();
			});
	}

	private _handleOkayPacket(packet: Packet): boolean | undefined {
		debug('I:A_OKAY', packet);
		if (this.ended) {
			return;
		}
		if (!this.transport) {
			throw new Service.PrematurePacketError(packet);
		}
		this.needAck = false;
		return this._tryPush();
	}

	private _handleWritePacket(packet: Packet): boolean | undefined {
		debug('I:A_WRTE', packet);
		if (this.ended) {
			return;
		}
		if (!this.transport) {
			throw new Service.PrematurePacketError(packet);
		}
		if (packet.data) {
			this.transport.write(packet.data);
		}
		debug('O:A_OKAY');
		return this.socket.write(Packet.assemble(Packet.A_OKAY, this.localId, this.remoteId, null));
	}

	private _handleClosePacket(packet: Packet): Service | undefined {
		debug('I:A_CLSE', packet);
		if (this.ended) {
			return;
		}
		if (!this.transport) {
			throw new Service.PrematurePacketError(packet);
		}
		return this.end();
	}

	private _tryPush(): boolean | undefined {
		let chunk;
		if (this.needAck || this.ended) {
			return;
		}
		if ((chunk = this._readChunk(this.transport.socket))) {
			debug('O:A_WRTE');
			this.socket.write(Packet.assemble(Packet.A_WRTE, this.localId, this.remoteId, chunk));
			return (this.needAck = true);
		}
	}

	private _readChunk(stream: ReadableStream): string | Buffer {
		return stream.read(this.socket.maxPayload) || stream.read();
	}
}

export = Service;
