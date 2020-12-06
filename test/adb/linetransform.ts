import Stream from 'stream';
import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import LineTransform from '../../src/adb/linetransform';
import MockDuplex from '../mock/duplex';

describe('LineTransform', function () {
    it('should implement stream.Transform', function (done) {
        expect(new LineTransform()).to.be.an.instanceOf(Stream.Transform);
        done();
    });
    describe('with autoDetect', function () {
        it('should not modify data if first byte is 0x0a', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform({
                autoDetect: true,
            });
            transform.on('data', function (data) {
                expect(data.toString()).to.equal('bar\r\n');
                done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\nbar\r\n');
            duplex.causeEnd();
        });
        it('should not include initial 0x0a', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform({
                autoDetect: true,
            });
            let buffer = Buffer.from('');
            transform.on('data', function (data) {
                return (buffer = Buffer.concat([buffer, data]));
            });
            transform.on('end', function () {
                expect(buffer.toString()).to.equal('bar\r\n');
                 done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\nbar\r\n');
            duplex.causeEnd();
        });
        it('should not include initial 0x0d 0x0a', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform({
                autoDetect: true,
            });
            let buffer = Buffer.from('');
            transform.on('data', function (data) {
                return (buffer = Buffer.concat([buffer, data]));
            });
            transform.on('end', function () {
                expect(buffer.toString()).to.equal('bar\n');
                done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\r\nbar\r\n');
            duplex.causeEnd();
        });
        it('should not include initial 0x0d 0x0a even if in separate chunks', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform({
                autoDetect: true,
            });
            let buffer = Buffer.from('');
            transform.on('data', function (data) {
                return (buffer = Buffer.concat([buffer, data]));
            });
            transform.on('end', function () {
                expect(buffer.toString()).to.equal('bar\n');
                done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\r');
            duplex.causeRead('\nbar\r\n');
            duplex.causeEnd();
        });
        return it('should transform as usual if first byte is not 0x0a', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform({
                autoDetect: true,
            });
            let buffer = Buffer.from('');
            transform.on('data', function (data) {
                return (buffer = Buffer.concat([buffer, data]));
            });
            transform.on('end', function () {
                expect(buffer.toString()).to.equal('bar\nfoo');
                done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\r\nbar\r\nfoo');
            duplex.causeEnd();
        });
    });
    describe('without autoDetect', function () {
        return it('should transform as usual even if first byte is 0x0a', function (done) {
            const duplex = new MockDuplex();
            const transform = new LineTransform();
            let buffer = Buffer.from('');
            transform.on('data', function (data) {
                return (buffer = Buffer.concat([buffer, data]));
            });
            transform.on('end', function () {
                expect(buffer.toString()).to.equal('\n\nbar\nfoo');
                done();
            });
            duplex.pipe(transform);
            duplex.causeRead('\n\r\nbar\r\nfoo');
            duplex.causeEnd();
        });
    });
    it('should not modify data that does not have 0x0d 0x0a in it', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        transform.on('data', function (data) {
            expect(data.toString()).to.equal('foo');
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead('foo');
        duplex.causeEnd();
    });
    it('should not remove 0x0d if not followed by 0x0a', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        transform.on('data', function (data) {
            expect(data.length).to.equal(2);
            expect(data[0]).to.equal(0x0d);
            expect(data[1]).to.equal(0x05);
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead(Buffer.from([0x0d, 0x05]));
        duplex.causeEnd();
    });
    it('should remove 0x0d if followed by 0x0a', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        transform.on('data', function (data) {
            expect(data.length).to.equal(2);
            expect(data[0]).to.equal(0x0a);
            expect(data[1]).to.equal(0x97);
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead(Buffer.from([0x0d, 0x0a, 0x97]));
        duplex.causeEnd();
    });
    it('should push 0x0d without 0x0a if last in stream', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        transform.on('data', function (data) {
            expect(data.length).to.equal(1);
            expect(data[0]).to.equal(0x0d);
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead(Buffer.from([0x0d]));
        duplex.causeEnd();
    });
    it('should push saved 0x0d if next chunk does not start with 0x0a', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        let buffer = Buffer.from('');
        transform.on('data', function (data) {
            return (buffer = Buffer.concat([buffer, data]));
        });
        transform.on('end', function () {
            expect(buffer).to.have.length(3);
            expect(buffer[0]).to.equal(0x62);
            expect(buffer[1]).to.equal(0x0d);
            expect(buffer[2]).to.equal(0x37);
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead(Buffer.from([0x62, 0x0d]));
        duplex.causeRead(Buffer.from([0x37]));
        duplex.causeEnd();
        duplex.end();
    });
    return it('should remove saved 0x0d if next chunk starts with 0x0a', function (done) {
        const duplex = new MockDuplex();
        const transform = new LineTransform();
        let buffer = Buffer.from('');
        transform.on('data', function (data) {
            return (buffer = Buffer.concat([buffer, data]));
        });
        transform.on('end', function () {
            expect(buffer).to.have.length(2);
            expect(buffer[0]).to.equal(0x62);
            expect(buffer[1]).to.equal(0x0a);
            done();
        });
        duplex.pipe(transform);
        duplex.causeRead(Buffer.from([0x62, 0x0d]));
        duplex.causeRead(Buffer.from([0x0a]));
        duplex.causeEnd();
        duplex.end();
    });
});
