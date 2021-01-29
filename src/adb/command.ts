import Connection from './connection';
import Protocol from './protocol';
import Parser from './parser';
import d from 'debug';
import Bluebird from 'bluebird';
import WithToString from '../WithToString';

const debug = d('adb:command');
const RE_SQUOT = /'/g;
const RE_ESCAPE = /([$`\\!"])/g;

export default abstract class Command<T> {
  public parser: Parser;
  public protocol: Protocol;
  public connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    this.parser = this.connection.parser;
    this.protocol = Protocol;
  }

  // FIXME(intentional any): not "any" will break it all
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public abstract execute(...args: any[]): Bluebird<T>;

  public _send(data: string | Buffer): Command<T> {
    const encoded = Protocol.encodeData(data);
    if (debug.enabled) {
      debug(`Send '${encoded}'`);
    }
    this.connection.write(encoded);
    return this;
  }

  public _escape(arg: number | WithToString): number | string {
    switch (typeof arg) {
      case 'number':
        return arg;
      default:
        return "'" + arg.toString().replace(RE_SQUOT, "'\"'\"'") + "'";
    }
  }

  public _escapeCompat(arg: number | WithToString): number | string {
    switch (typeof arg) {
      case 'number':
        return arg;
      default:
        return '"' + arg.toString().replace(RE_ESCAPE, '\\$1') + '"';
    }
  }
}
