import type { Socket } from 'net';
import ConnectionModule from '../../dist/src/adb/connection.js';
import ParserModule from '../../dist/src/adb/parser.js';
import MockDuplex from './duplex.mts';

const Connection = ConnectionModule.default;
const Parser = ParserModule.default;

export default class MockConnection extends Connection {
  _socket = new MockDuplex();

  constructor() {
    super();
    this.parser = new Parser(this._socket);
    // Like a real Connection, expose the socket that writes go to. Sync
    // checks it for backpressure.
    this.socket = this._socket as unknown as Socket;
  }

  public getSocket(): MockDuplex {
    return this._socket;
  }

  end(): this {
    this._socket.causeEnd();
    return this;
  }

  public write(chunk: string | Uint8Array, cb?: (error: Error | null | undefined) => void): this {
    this.socket.write(chunk, cb);
    return this;
  }

  on(): this {
    return this;
  }
}
