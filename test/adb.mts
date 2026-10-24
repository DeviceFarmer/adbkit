import { expect } from 'chai';
import AdbModule from '../dist/src/adb.js';
import ClientModule from '../dist/src/adb/client.js';
// import { Keycode } from '../src/adb/keycode';
import utilModule from '../dist/src/adb/util.js';

const Adb = AdbModule.default;
const Client = ClientModule.default;
const util = utilModule.default;

describe('Adb', function () {
  //it('should expose Keycode', function (done) {
  //    expect(Adb).to.have.property('Keycode');
  // expect(Adb.Keycode).to.equal(Keycode);
  //    done();
  //});
  it('should expose util', function (done) {
    expect(Adb).to.have.property('util');
    expect(Adb.util).to.equal(util);
    done();
  });
  return describe('@createClient(options)', function () {
    return it('should return a Client instance', function (done) {
      expect(Adb.createClient()).to.be.an.instanceOf(Client);
      done();
    });
  });
});
