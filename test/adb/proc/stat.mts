import Stream from 'stream';
import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import ProcStat from '../../../dist/src/adb/proc/stat.js';

describe('ProcStat', function () {
  afterEach(function () {
    Sinon.restore();
  });
  const failingSync = (error: Error) => ({
    pull() {
      const stream = new Stream.PassThrough();
      setImmediate(() => stream.emit('error', error));
      return stream;
    },
    end: Sinon.spy(),
  });
  it("should report failing updates as 'error' events", function (done) {
    const error = new Error('pull failed');
    const stat = new ProcStat(failingSync(error));
    stat.once('error', function (err) {
      stat.end();
      expect(err).to.equal(error);
      done();
    });
  });
  it('should warn instead of rejecting unhandled when nobody listens for errors', function (done) {
    const error = new Error('pull failed');
    const emitWarning = Sinon.stub(process, 'emitWarning');
    const unhandled = Sinon.spy();
    process.on('unhandledRejection', unhandled);
    const stat = new ProcStat(failingSync(error));
    setTimeout(function () {
      stat.end();
      process.removeListener('unhandledRejection', unhandled);
      try {
        expect(emitWarning).to.have.been.calledWith(error);
        expect(unhandled).to.not.have.been.called;
        done();
      } catch (err) {
        done(err);
      }
    }, 20);
  });
});
