import { EventEmitter } from 'events';

export default class PushTransfer extends EventEmitter {
  private _stack: number[] = [];
  public stats = {
    bytesTransferred: 0,
  };

  public cancel(): boolean {
    return this.emit('cancel');
  }

  public push(byteCount: number): number {
    return this._stack.push(byteCount);
  }

  public pop(): boolean {
    const byteCount = this._stack.pop();
    if (byteCount) {
      this.stats.bytesTransferred += byteCount;
    }
    return this.emit('progress', this.stats);
  }

  public end(): boolean {
    return this.emit('end');
  }
}
