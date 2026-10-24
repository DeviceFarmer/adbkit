import Stream from 'stream';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import utilModule from '../../dist/src/adb/util.js';

const util = utilModule.default;

describe('util', function () {
  return describe('readAll(stream)', function () {
    it('should return a native Promise', function () {
      const stream = new Stream.PassThrough();
      const promise = util.readAll(stream);
      expect(promise).to.be.an.instanceOf(Promise);
      stream.end();
      return promise;
    });
    return it('should read all remaining content until the stream ends', function (done) {
      const stream = new Stream.PassThrough();
      util.readAll(stream).then(function (buf) {
        expect(buf.length).to.equal(3);
        expect(buf.toString()).to.equal('FOO');
        done();
      });
      stream.write('F');
      stream.write('O');
      stream.write('O');
      return stream.end();
    });
  });
});
