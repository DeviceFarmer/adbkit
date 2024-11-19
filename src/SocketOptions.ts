import ExtendedPublicKey from './ExtendedPublicKey';
import Bluebird from 'bluebird';

export default interface SocketOptions {
  auth?: (key: ExtendedPublicKey) => Bluebird<void | boolean>;
  knownPublicKeys?: ExtendedPublicKey[];
}
