import Stream from 'stream';
import Sinon from 'sinon';
import { use, expect } from 'chai';
import simonChai from 'sinon-chai';
use(simonChai);
import ParserModule from '../../dist/src/adb/parser.js';
import ProtocolModule from '../../dist/src/adb/protocol.js';
import JdwpTrackerModule from '../../dist/src/adb/jdwptracker.js';

const Parser = ParserModule.default;
const Protocol = ProtocolModule.default;
const JdwpTracker = JdwpTrackerModule.default;

describe('JdwpTracker', function () {
  beforeEach(function () {
    this.stream = new Stream.PassThrough();
    this.connection = { end: Sinon.spy() };
    this.command = { parser: new Parser(this.stream), connection: this.connection };
  });
  it("should emit 'changeSet' with the pids it reads", function (done) {
    const tracker = new JdwpTracker(this.command);
    tracker.on('changeSet', function (changeSet, pids) {
      expect(changeSet).to.eql({ added: ['1', '2'], removed: [] });
      expect(pids).to.eql(['1', '2']);
      done();
    });
    this.stream.write(Protocol.encodeData('1\n2\n'));
  });
  describe('end()', function () {
    it("should end the connection and emit 'end' without an error", function (done) {
      const tracker = new JdwpTracker(this.command);
      const spy = Sinon.spy();
      tracker.on('error', spy);
      tracker.on('end', () => {
        expect(this.connection.end).to.have.been.calledOnce;
        expect(spy).to.not.have.been.called;
        expect(this.stream.listenerCount('readable')).to.equal(0);
        done();
      });
      tracker.end();
    });
    it("should end the connection and emit 'end' once a read has completed", function (done) {
      const tracker = new JdwpTracker(this.command);
      const end = Sinon.spy();
      tracker.on('end', end);
      tracker.once('changeSet', () => {
        // update() runs inside the read; end() once the read has settled.
        setImmediate(() => {
          tracker.end();
          tracker.end();
          expect(this.connection.end).to.have.been.calledOnce;
          expect(end).to.have.been.calledOnce;
          done();
        });
      });
      this.stream.write(Protocol.encodeData('1\n'));
    });
  });
});
