import Command from '../../command';
import { forward } from './forward';

const TCP_LOCAL = /^tcp:(\d+)$/;

export default class ForwardTcpCommand extends Command<number> {
  execute(serial: string, local: string, remote: string): Promise<number> {
    const match = TCP_LOCAL.exec(local);
    if (!match) {
      // Nothing was sent, so nobody else will close the connection.
      this.connection.end();
      return Promise.reject(new Error(`forwardTcp() needs a 'tcp:<port>' local, got '${local}'`));
    }
    const requested = Number(match[1]);
    return forward(this, serial, local, remote).then((port) => {
      if (port !== undefined) {
        return port;
      }
      // The server reports no port when it only rebinds a listener that
      // already exists. That listener is still on the requested port.
      if (requested !== 0) {
        return requested;
      }
      throw new Error(`The ADB server did not report the port it bound for '${local}'`);
    });
  }
}
