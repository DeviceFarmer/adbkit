import Parser from './parser';
import Auth from './auth';
import { Callback } from '../Callback';
import { ExtendedPublicKey } from '../ExtendedPublicKey';
import Bluebird from 'bluebird';
import { Duplex } from 'stream';

class Util {
	public static readAll(stream: Duplex, callback?: Callback<Buffer>): Bluebird<Buffer> {
		return new Parser(stream).readAll().nodeify(callback);
	}

	public static parsePublicKey(keyString: string, callback?: Callback<ExtendedPublicKey>): Bluebird<ExtendedPublicKey> {
		return Auth.parsePublicKey(keyString).nodeify(callback);
	}
}

export = Util;
