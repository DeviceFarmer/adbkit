/*
The stucture of an ADB RSAPublicKey is as follows:

    #define RSANUMBYTES 256           // 2048 bit key length
    #define RSANUMWORDS (RSANUMBYTES / sizeof(uint32_t))

    typedef struct RSAPublicKey {
        int len;                  // Length of n[] in number of uint32_t
        uint32_t n0inv;           // -1 / n[0] mod 2^32
        uint32_t n[RSANUMWORDS];  // modulus as little endian array
        uint32_t rr[RSANUMWORDS]; // R^2 as little endian array
        int exponent;             // 3 or 65537
    } RSAPublicKey;

 */

import forge from 'node-forge';
import ExtendedPublicKey from '../ExtendedPublicKey';
import Bluebird from 'bluebird';

const BigInteger = forge.jsbn.BigInteger;

export default class Auth {
  private static RE = /^((?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?)\0?( .*|)\s*$/;
  public static parsePublicKey(buffer: string): Bluebird<ExtendedPublicKey> {
    return new Bluebird(function (resolve, reject) {
      const match = Auth.RE.exec(buffer);
      if (match) {
        const struct = Buffer.from(match[1], 'base64');
        const comment = match[2].trim();
        return resolve(Auth.readPublicKeyFromStruct(struct, comment));
      } else {
        return reject(new Error('Unrecognizable public key format'));
      }
    });
  }

  private static readPublicKeyFromStruct(struct: Buffer, comment: string): ExtendedPublicKey {
    if (!struct.length) {
      throw new Error('Invalid public key');
    }
    // Keep track of what we've read already
    let offset = 0;
    // Get len
    const len = struct.readUInt32LE(offset) * 4;
    offset += 4;
    if (struct.length !== 4 + 4 + len + len + 4) {
      throw new Error('Invalid public key');
    }
    // Skip n0inv, we don't need it
    offset += 4;
    // Get n
    const n = Buffer.alloc(len);
    struct.copy(n, 0, offset, offset + len);
    [].reverse.call(n);
    offset += len;
    // Skip rr, we don't need it
    offset += len;
    // Get e
    const e = struct.readUInt32LE(offset);
    if (!(e === 3 || e === 65537)) {
      throw new Error(`Invalid exponent ${e}, only 3 and 65537 are supported`);
    }

    // FIXME: bug in @types/node-forge
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const modulus = new BigInteger(n.toString('hex'), 16);

    // FIXME: bug in @types/node-forge
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const exponent = new BigInteger(e.toString(), 10);
    // Restore the public key
    const key = forge.pki.rsa.setPublicKey(modulus, exponent);
    // It will be difficult to retrieve the fingerprint later as it's based
    // on the complete struct data, so let's just extend the key with it.
    const md = forge.md.md5.create();
    md.update(struct.toString('binary'));
    const extendedKey: ExtendedPublicKey = key as ExtendedPublicKey;
    extendedKey.fingerprint = md.digest().toHex().match(/../g).join(':');
    // Expose comment for the same reason
    extendedKey.comment = comment;
    return extendedKey;
  }
}
