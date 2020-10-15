import * as fs from 'fs';

let func;
if (process.env.ADBKIT_DUMP) {
	const out = fs.createWriteStream('adbkit.dump');
	func = function (chunk: Buffer): Buffer {
		out.write(chunk);
		return chunk;
	};
} else {
	func = function (chunk: Buffer): Buffer {
		return chunk;
	};
}

export = func;
