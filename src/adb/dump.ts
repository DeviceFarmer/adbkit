import * as fs from 'fs';

let func: (chunk: Buffer) => Buffer;

if (process.env.ADBKIT_DUMP) {
  const out = fs.createWriteStream('adbkit.dump');
  func = function (chunk: Buffer): Buffer {
    out.write(chunk);
    return chunk;
  };
} else {
  func = (chunk: Buffer): Buffer => chunk;
}

export = func;
