import { Duplex } from 'stream';
import FramebufferMeta from './FramebufferMeta';

export default interface FramebufferStreamWithMeta extends Duplex {
    meta: FramebufferMeta;
}
