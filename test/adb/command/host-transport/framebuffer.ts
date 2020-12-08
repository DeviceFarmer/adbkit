import Chai, { expect } from 'chai';
import simonChai from 'sinon-chai';
Chai.use(simonChai);
import MockConnection from '../../../mock/connection';
import Protocol from '../../../../src/adb/protocol';
import FrameBufferCommand from '../../../../src/adb/command/host-transport/framebuffer';

describe('FrameBufferCommand', function () {
    it("should send 'framebuffer:'", function () {
        const conn = new MockConnection();
        const cmd = new FrameBufferCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('framebuffer:').toString());
        });
        setImmediate(function () {
            const meta = Buffer.alloc(52);
            meta.fill(0);
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(meta);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('raw');
    });
    return it("should parse meta header and return it as the 'meta' property of the stream", function () {
        const conn = new MockConnection();
        const cmd = new FrameBufferCommand(conn);
        conn.getSocket().on('write', function (chunk) {
            return expect(chunk.toString()).to.equal(Protocol.encodeData('framebuffer:').toString());
        });
        setImmediate(function () {
            const meta = Buffer.alloc(52);
            let offset = 0;
            meta.writeUInt32LE(1, offset);
            meta.writeUInt32LE(32, (offset += 4));
            meta.writeUInt32LE(819200, (offset += 4));
            meta.writeUInt32LE(640, (offset += 4));
            meta.writeUInt32LE(320, (offset += 4));
            meta.writeUInt32LE(0, (offset += 4));
            meta.writeUInt32LE(8, (offset += 4));
            meta.writeUInt32LE(16, (offset += 4));
            meta.writeUInt32LE(8, (offset += 4));
            meta.writeUInt32LE(8, (offset += 4));
            meta.writeUInt32LE(8, (offset += 4));
            meta.writeUInt32LE(24, (offset += 4));
            meta.writeUInt32LE(8, (offset += 4));
            conn.getSocket().causeRead(Protocol.OKAY);
            conn.getSocket().causeRead(meta);
            return conn.getSocket().causeEnd();
        });
        return cmd.execute('raw').then(function (stream) {
            expect(stream).to.have.property('meta');
            expect(stream.meta).to.eql({
                version: 1,
                bpp: 32,
                size: 819200,
                width: 640,
                height: 320,
                red_offset: 0,
                red_length: 8,
                blue_offset: 16,
                blue_length: 8,
                green_offset: 8,
                green_length: 8,
                alpha_offset: 24,
                alpha_length: 8,
                format: 'rgba',
            });
        });
    });
});
