import Stream from 'stream';
import Bluebird from 'bluebird';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import Parser from '../../src/adb/parser';

describe('Parser', function () {
    describe('end()', function () {
        return it('should end the stream and consume all remaining data', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            stream.write('F');
            stream.write('O');
            stream.write('O');
            parser.end().then(function () {
                done();
            });
        });
    });
    describe('readAll()', function () {
        it('should return a cancellable Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readAll();
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should read all remaining content until the stream ends', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readAll().then(function (buf) {
                expect(buf.length).to.equal(3);
                expect(buf.toString()).to.equal('FOO');
                done();
            });
            stream.write('F');
            stream.write('O');
            stream.write('O');
            stream.end();
        });
        return it("should resolve with an empty Buffer if the stream has already ended and there's nothing more to read", function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readAll().then(function (buf) {
                expect(buf.length).to.equal(0);
                done();
            });
            stream.end();
        });
    });
    describe('readBytes(howMany)', function () {
        it('should return a cancellable Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readBytes(1);
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should read as many bytes as requested', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readBytes(4).then(function (buf) {
                expect(buf.length).to.equal(4);
                expect(buf.toString()).to.equal('OKAY');
                return parser.readBytes(2).then(function (buf) {
                    expect(buf).to.have.length(2);
                    expect(buf.toString()).to.equal('FA');
                    done();
                });
            });
            stream.write('OKAYFAIL');
        });
        it('should wait for enough data to appear', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readBytes(5).then(function (buf) {
                expect(buf.toString()).to.equal('BYTES');
                done();
            });
            Bluebird.delay(50).then(function () {
                return stream.write('BYTES');
            });
        });
        it('should keep data waiting even when nothing has been requested', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            stream.write('FOO');
            Bluebird.delay(50).then(function () {
                return parser.readBytes(2).then(function (buf) {
                    expect(buf.length).to.equal(2);
                    expect(buf.toString()).to.equal('FO');
                    done();
                });
            });
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before enough bytes can be read', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            stream.write('F');
            parser.readBytes(10).catch(Parser.PrematureEOFError, function (err) {
                expect(err.missingBytes).to.equal(9);
                done();
            });
            stream.end();
        });
    });
    describe('readByteFlow(maxHowMany, targetStream)', function () {
        it('should return a cancellable Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const target = new Stream.PassThrough();
            const promise = parser.readByteFlow(1, target);
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should read as many bytes as requested', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const target = new Stream.PassThrough();
            parser
                .readByteFlow(4, target)
                .then(function () {
                    expect(target.read()).to.eql(Buffer.from('OKAY'));
                    return parser.readByteFlow(2, target).then(function () {
                        expect(target.read()).to.eql(Buffer.from('FA'));
                        done();
                    });
                })
                .catch(done);
            stream.write('OKAYFAIL');
        });
        return it('should progress with new/partial chunk until maxHowMany', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const target = new Stream.PassThrough();
            parser
                .readByteFlow(3, target)
                .then(function () {
                    expect(target.read()).to.eql(Buffer.from('PIE'));
                    done();
                })
                .catch(done);
            const b1 = Buffer.from('P');
            const b2 = Buffer.from('I');
            const b3 = Buffer.from('ES');
            const b4 = Buffer.from('R');
            stream.write(b1);
            stream.write(b2);
            stream.write(b3);
            stream.write(b4);
        });
    });
    describe('readAscii(howMany)', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readAscii(1);
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should read as many ascii characters as requested', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readAscii(4).then(function (str) {
                expect(str.length).to.equal(4);
                expect(str).to.equal('OKAY');
                done();
            });
            stream.write('OKAYFAIL');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before enough bytes can be read', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            stream.write('FOO');
            parser.readAscii(7).catch(Parser.PrematureEOFError, function (err) {
                expect(err.missingBytes).to.equal(4);
                done();
            });
            stream.end();
        });
    });
    describe('readValue()', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readValue();
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should read a protocol value as a Buffer', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readValue().then(function (value) {
                expect(value).to.be.an.instanceOf(Buffer);
                expect(value).to.have.length(4);
                expect(value.toString()).to.equal('001f');
                done();
            });
            stream.write('0004001f');
        });
        it('should return an empty value', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readValue().then(function (value) {
                expect(value).to.be.an.instanceOf(Buffer);
                expect(value).to.have.length(0);
                done();
            });
            stream.write('0000');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before the value can be read', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readValue().catch(Parser.PrematureEOFError, function () {
                done();
            });
            stream.write('00ffabc');
            stream.end();
        });
    });
    describe('readError()', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readError();
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should reject with Parser.FailError using the value', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readError().catch(Parser.FailError, function (err) {
                expect(err.message).to.equal("Failure: 'epic failure'");
                done();
            });
            return stream.write('000cepic failure');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before the error can be read', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readError().catch(Parser.PrematureEOFError, function () {
                done();
            });
            stream.write('000cepic');
            return stream.end();
        });
    });
    describe('searchLine(re)', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.searchLine(/foo/);
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should return the re.exec match of the matching line', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.searchLine(/za(p)/).then(function (line) {
                expect(line[0]).to.equal('zap');
                expect(line[1]).to.equal('p');
                expect(line.input).to.equal('zip zap');
                done();
            });
            return stream.write('foo bar\nzip zap\npip pop\n');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before a line is found', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.searchLine(/nope/).catch(Parser.PrematureEOFError, function () {
                done();
            });
            stream.write('foo bar');
            return stream.end();
        });
    });
    describe('readLine()', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readLine();
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should skip a line terminated by \\n', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readLine().then(function () {
                return parser.readBytes(7).then(function (buf) {
                    expect(buf.toString()).to.equal('zip zap');
                    done();
                });
            });
            return stream.write('foo bar\nzip zap\npip pop');
        });
        it('should return skipped line', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readLine().then(function (buf) {
                expect(buf.toString()).to.equal('foo bar');
                done();
            });
            return stream.write('foo bar\nzip zap\npip pop');
        });
        it('should strip trailing \\r', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readLine().then(function (buf) {
                expect(buf.toString()).to.equal('foo bar');
                done();
            });
            stream.write('foo bar\r\n');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before a line is found', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readLine().catch(Parser.PrematureEOFError, function () {
                done();
            });
            stream.write('foo bar');
            stream.end();
        });
    });
    describe('readUntil(code)', function () {
        it('should return a cancellable Bluebird Promise', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const promise = parser.readUntil(0xa0);
            expect(promise).to.be.an.instanceOf(Bluebird);
            promise.cancel();
            expect(promise.isCancelled()).to.be.true;
            done();
        });
        it('should return any characters before given value', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readUntil('p'.charCodeAt(0)).then(function (buf) {
                expect(buf.toString()).to.equal('foo bar\nzi');
                done();
            });
            stream.write('foo bar\nzip zap\npip pop');
        });
        return it('should reject with Parser.PrematureEOFError if stream ends before a line is found', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.readUntil('z'.charCodeAt(0)).catch(Parser.PrematureEOFError, function () {
                done();
            });
            stream.write('ho ho');
            stream.end();
        });
    });
    describe('raw()', function () {
        return it('should return the resumed raw stream', function () {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            const raw = parser.raw();
            expect(raw).to.equal(stream);
            raw.on('data', function () {
                // done();
            });
            return raw.write('foo');
        });
    });
    return describe('unexpected(data, expected)', function () {
        return it('should reject with Parser.UnexpectedDataError', function (done) {
            const stream = new Stream.PassThrough();
            const parser = new Parser(stream);
            parser.unexpected('foo', "'bar' or end of stream").catch(Parser.UnexpectedDataError, function (err) {
                expect(err.message).to.equal("Unexpected 'foo', was expecting 'bar' or end of stream");
                expect(err.unexpected).to.equal('foo');
                expect(err.expected).to.equal("'bar' or end of stream");
                done();
            });
        });
    });
});
