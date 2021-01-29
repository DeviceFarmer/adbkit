import { pki } from 'node-forge';
import PublicKey = pki.rsa.PublicKey;

export default interface ExtendedPublicKey extends PublicKey {
  fingerprint: string;
  comment: string;
}
