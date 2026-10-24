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
    it("should end the connection and emit 'end' when called from a 'changeSet' listener", function (done) {
      const tracker = new JdwpTracker(this.command);
      const end = Sinon.spy();
      tracker.on('end', end);
      tracker.on('end', () => {
        tracker.end();
        expect(this.connection.end).to.have.been.calledOnce;
        expect(end).to.have.been.calledOnce;
        done();
      });
      tracker.once('changeSet', () => tracker.end());
      this.stream.write(Protocol.encodeData('1\n'));
    });
  });
  it('should keep reading pid lists until the connection closes', function (done) {
    const tracker = new JdwpTracker(this.command);
    const changeSets: unknown[] = [];
    const error = Sinon.spy();
    tracker.on('error', error);
    tracker.on('changeSet', (changeSet) => changeSets.push(changeSet));
    tracker.on('end', () => {
      expect(changeSets).to.eql([
        { added: ['1', '2'], removed: [] },
        { added: ['3'], removed: ['2'] },
      ]);
      expect(error).to.not.have.been.called;
      expect(this.connection.end).to.have.been.calledOnce;
      done();
    });
    this.stream.write(Protocol.encodeData('1\n2\n'));
    this.stream.write(Protocol.encodeData('1\n3\n'));
    this.stream.end();
  });
  it("should emit 'error' and 'end' when the connection fails", function (done) {
    const tracker = new JdwpTracker(this.command);
    const failure = new Error('connection reset');
    const error = Sinon.spy();
    tracker.on('error', error);
    tracker.on('end', () => {
      expect(error).to.have.been.calledOnceWith(failure);
      expect(this.connection.end).to.have.been.calledOnce;
      done();
    });
    this.stream.emit('error', failure);
  });
});
