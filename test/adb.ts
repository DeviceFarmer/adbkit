import { expect } from 'chai';
import Adb from '../src/adb';
import Client from '../src/adb/client';
// import { Keycode } from '../src/adb/keycode';
import util from '../src/adb/util';

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
