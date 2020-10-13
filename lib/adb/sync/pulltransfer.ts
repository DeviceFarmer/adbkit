import { Stream } from 'stream';

class PullTransfer extends Stream.PassThrough {
	public stats = {
		bytesTransferred: 0,
	};

	public cancel(): boolean {
		return this.emit('cancel');
	}

	write(
		chunk: Buffer,
		encoding?: string | typeof callback,
		callback?: (error: Error | null | undefined) => void,
	): boolean {
		this.stats.bytesTransferred += chunk.length;
		this.emit('progress', this.stats);
		if (typeof encoding === 'function') {
			return super.write(chunk, encoding);
		}
		return super.write(chunk, encoding, callback);
	}
}

export = PullTransfer;
