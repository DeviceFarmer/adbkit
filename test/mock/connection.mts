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
  }

  public getSocket(): MockDuplex {
    return this._socket;
  }

  end(): this {
    this._socket.causeEnd();
    return this;
  }

  // public write(data: string | Uint8Array, callback?: (err?: Error) => void): this {
  public write(chunk: string | Uint8Array, cb?: (error: Error | null | undefined) => void): this {
    this._socket.write(chunk, cb);
    return this;
  }

  on(): this {
    return this;
  }
}
