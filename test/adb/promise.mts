import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import { nodeify, warnUnhandled } from '../../dist/src/adb/promise.js';

describe('promise helpers', function () {
  describe('nodeify(promise, callback)', function () {
    it('should return the same promise', function () {
      const promise = Promise.resolve(1);
      expect(nodeify(promise)).to.equal(promise);
      expect(nodeify(promise, () => undefined)).to.equal(promise);
    });
    it('should call back with the value', function (done) {
      nodeify(Promise.resolve('foo'), function (err, value) {
        expect(err).to.be.null;
        expect(value).to.equal('foo');
        done();
      });
    });
    it('should call back with the error and still reject the promise', function () {
      const error = new Error('foo');
      const callback = Sinon.spy();
      return nodeify(Promise.reject(error), callback).then(
        () => {
          throw new Error('Expected a rejection');
        },
        (err) => {
          expect(err).to.equal(error);
          expect(callback).to.have.been.calledOnceWith(error);
        },
      );
    });
    it('should rethrow a throwing callback on the next tick', function (done) {
      const error = new Error('from the callback');
      const nextTick = Sinon.stub(process, 'nextTick');
      nodeify(Promise.resolve(1), function () {
        throw error;
      });
      setImmediate(function () {
        nextTick.restore();
        try {
          expect(nextTick).to.have.been.calledOnce;
          expect(() => nextTick.firstCall.args[0]()).to.throw(error);
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
  describe('warnUnhandled(err)', function () {
    it('should emit a process warning', function () {
      const emitWarning = Sinon.stub(process, 'emitWarning');
      try {
        const error = new Error('foo');
        warnUnhandled(error);
        expect(emitWarning).to.have.been.calledOnceWith(error);
      } finally {
        emitWarning.restore();
      }
    });
  });
});
