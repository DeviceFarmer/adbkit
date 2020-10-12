var MockConnection, MockDuplex, Parser;

Parser = require('../../lib/adb/parser');

MockDuplex = require('./duplex');

MockConnection = class MockConnection {
  constructor() {
    this.socket = new MockDuplex();
    this.parser = new Parser(this.socket);
  }

  end() {
    this.socket.causeEnd();
    return this;
  }

  write() {
    this.socket.write.apply(this.socket, arguments);
    return this;
  }

  on() {}

};

module.exports = MockConnection;
