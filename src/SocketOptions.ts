import ExtendedPublicKey from './ExtendedPublicKey';

export default interface SocketOptions {
  /**
   * Accepts or rejects a client key: resolve to accept, reject to refuse.
   * Any promise-like value works, as does throwing to refuse.
   */
  auth?: (key: ExtendedPublicKey) => PromiseLike<void | boolean>;
  knownPublicKeys?: ExtendedPublicKey[];
}
