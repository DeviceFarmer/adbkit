// var MockDuplex;

import Stream from 'stream';

export default class MockDuplex extends Stream.Duplex {
    _read(size: number): void {
        // empty
    }

    _write(chunk, encoding: string, callback: Function): void {
        this.emit('write', chunk, encoding, callback);
        callback(null);
    }

    causeRead(chunk): void {
        if (!Buffer.isBuffer(chunk)) {
            chunk = Buffer.from(chunk);
        }
        this.push(chunk);
    }

    causeEnd(): void {
        this.push(null);
    }

    end(cb?: () => void): this {
        this.causeEnd(); // In order to better emulate socket streams
        return (Stream.Duplex.prototype.end as any).apply(this, cb);
    }
}
