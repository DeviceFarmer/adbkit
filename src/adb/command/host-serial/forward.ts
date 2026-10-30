import Command from '../../command';
import Protocol from '../../protocol';
import Parser from '../../parser';

/**
 * Sends `host-serial:<serial>:forward:<local>;<remote>` and reads the reply.
 *
 * On success the server answers OKAY OKAY. When it opens a new `tcp:` listener
 * it then sends the bound port as a length-prefixed string, and closes the
 * connection. The tail is read to the end in every case, so that the socket
 * can close instead of staying half-open with unread data.
 *
 * Resolves with the port the server reported, or `undefined` if it reported
 * none: the local isn't `tcp:`, or a listener for it already existed and was
 * only rebound.
 */
export function forward(
  command: Command<unknown>,
  serial: string,
  local: string,
  remote: string,
): Promise<number | undefined> {
  command._send(`host-serial:${serial}:forward:${local};${remote}`);
  const parser = command.parser;
  return parser.readAscii(4).then((reply) => {
    switch (reply) {
      case Protocol.OKAY:
        return parser.readAscii(4).then((reply) => {
          switch (reply) {
            case Protocol.OKAY:
              return parser.readAll().then((tail) => parsePort(parser, tail));
            case Protocol.FAIL:
              return parser.readError();
            default:
              return parser.unexpected(reply, 'OKAY or FAIL');
          }
        });
      case Protocol.FAIL:
        return parser.readError();
      default:
        return parser.unexpected(reply, 'OKAY or FAIL');
    }
  });
}

function parsePort(parser: Parser, tail: Buffer): Promise<number | undefined> | number | undefined {
  if (tail.length === 0) {
    return undefined;
  }
  const length = tail.length >= 4 ? Protocol.decodeLength(tail.toString('ascii', 0, 4)) : NaN;
  const value = tail.toString('ascii', 4);
  if (value.length !== length || !/^\d+$/.test(value)) {
    return parser.unexpected(tail.toString('ascii'), 'a length-prefixed port number');
  }
  return Number(value);
}

export default class ForwardCommand extends Command<boolean> {
  execute(serial: string, local: string, remote: string): Promise<boolean> {
    return forward(this, serial, local, remote).then(() => true);
  }
}
