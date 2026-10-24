import Parser from './parser';
import Auth from './auth';
import { Callback } from '../Callback';
import ExtendedPublicKey from '../ExtendedPublicKey';
import { Duplex } from 'stream';
import { nodeify } from './promise';

export default class Util {
  public static readAll(stream: Duplex, callback?: Callback<Buffer>): Promise<Buffer> {
    return nodeify(new Parser(stream).readAll(), callback);
  }

  public static parsePublicKey(keyString: string, callback?: Callback<ExtendedPublicKey>): Promise<ExtendedPublicKey> {
    return nodeify(Auth.parsePublicKey(keyString), callback);
  }
}
