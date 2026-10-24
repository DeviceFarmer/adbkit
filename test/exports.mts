import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { expect } from 'chai';

// The package resolves itself by name through its `exports` map.
const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('package exports', function () {
  it('should resolve the entry point to the client factory', function () {
    const adb = require('@devicefarmer/adbkit');
    expect(adb.default.createClient).to.be.a('function');
    expect(adb.Parser).to.equal(require('@devicefarmer/adbkit/adb/parser').default);
  });
  for (const [subpath, name] of [
    ['adb/parser', 'Parser'],
    ['adb/sync/pushtransfer', 'PushTransfer'],
    ['adb/tcpusb/server', 'Server'],
  ]) {
    it(`should export ${subpath} under its short and its dist path`, function () {
      const short = require(`@devicefarmer/adbkit/${subpath}`).default;
      expect(short).to.be.a('function');
      expect(short.name).to.equal(name);
      expect(require(`@devicefarmer/adbkit/dist/src/${subpath}.js`).default).to.equal(short);
    });
  }
  it('should point every types condition at an emitted declaration', function () {
    for (const target of Object.values(pkg.exports)) {
      if (typeof target === 'object') {
        expect(Object.keys(target)[0]).to.equal('types');
        expect(fs.existsSync(path.join(root, target.types)), target.types).to.be.true;
        expect(fs.existsSync(path.join(root, target.default)), target.default).to.be.true;
      }
    }
  });
  it('should not expose unlisted internals', function () {
    expect(() => require('@devicefarmer/adbkit/dist/src/adb/sync.js')).to.throw(/not defined by "exports"/);
  });
});
