import Stream from 'stream';
Promise = require('bluebird');
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import util from '../../src/adb/util';

describe('util', function () {
    return describe('readAll(stream)', function () {
        it('should return a cancellable Promise', function (done) {
            const stream = new Stream.PassThrough();
            const promise = util.readAll(stream);
            expect(promise).to.be.an.instanceOf(Promise);
            expect(promise.isCancellable()).to.be.true;
            promise.catch(Promise.CancellationError, function () {
                return done();
            });
            return promise.cancel();
        });
        return it('should read all remaining content until the stream ends', function (done) {
            const stream = new Stream.PassThrough();
            util.readAll(stream).then(function (buf) {
                expect(buf.length).to.equal(3);
                expect(buf.toString()).to.equal('FOO');
                return done();
            });
            stream.write('F');
            stream.write('O');
            stream.write('O');
            return stream.end();
        });
    });
});
