var Chai, GetPropertiesCommand, MockConnection, Protocol, Sinon, Stream, expect;

Stream = require('stream');

Sinon = require('sinon');

Chai = require('chai');

Chai.use(require('sinon-chai'));

({expect} = Chai);

MockConnection = require('../../../mock/connection');

Protocol = require('../../../../lib/adb/protocol');

GetPropertiesCommand = require('../../../../lib/adb/command/host-transport/getproperties');

describe('GetPropertiesCommand', function() {
  it("should send 'getprop'", function(done) {
    var cmd, conn;
    conn = new MockConnection();
    cmd = new GetPropertiesCommand(conn);
    conn.socket.on('write', function(chunk) {
      return expect(chunk.toString()).to.equal(Protocol.encodeData('shell:getprop').toString());
    });
    setImmediate(function() {
      conn.socket.causeRead(Protocol.OKAY);
      return conn.socket.causeEnd();
    });
    return cmd.execute().then(function() {
      return done();
    });
  });
  it("should return an empty object for an empty property list", function(done) {
    var cmd, conn;
    conn = new MockConnection();
    cmd = new GetPropertiesCommand(conn);
    setImmediate(function() {
      conn.socket.causeRead(Protocol.OKAY);
      return conn.socket.causeEnd();
    });
    return cmd.execute().then(function(properties) {
      expect(Object.keys(properties)).to.be.empty;
      return done();
    });
  });
  return it("should return a map of properties", function(done) {
    var cmd, conn;
    conn = new MockConnection();
    cmd = new GetPropertiesCommand(conn);
    setImmediate(function() {
      conn.socket.causeRead(Protocol.OKAY);
      conn.socket.causeRead(`[ro.product.locale.region]: [US]
[ro.product.manufacturer]: [samsung]\r
[ro.product.model]: [SC-04E]
[ro.product.name]: [SC-04E]`);
      return conn.socket.causeEnd();
    });
    return cmd.execute().then(function(properties) {
      expect(Object.keys(properties)).to.have.length(4);
      expect(properties).to.eql({
        'ro.product.locale.region': 'US',
        'ro.product.manufacturer': 'samsung',
        'ro.product.model': 'SC-04E',
        'ro.product.name': 'SC-04E'
      });
      return done();
    });
  });
});
