var Adb, Client, Keycode, expect, util;

({expect} = require('chai'));

Adb = require('../lib/adb');

Client = require('../lib/adb/client');

Keycode = require('../lib/adb/keycode');

util = require('../lib/adb/util');

describe('Adb', function() {
  it("should expose Keycode", function(done) {
    expect(Adb).to.have.property('Keycode');
    expect(Adb.Keycode).to.equal(Keycode);
    return done();
  });
  it("should expose util", function(done) {
    expect(Adb).to.have.property('util');
    expect(Adb.util).to.equal(util);
    return done();
  });
  return describe('@createClient(options)', function() {
    return it("should return a Client instance", function(done) {
      expect(Adb.createClient()).to.be.an.instanceOf(Client);
      return done();
    });
  });
});
