export default class RollingCounter {
  private now: number;

  constructor(private readonly max: number, private readonly min = 1) {
    this.now = this.min;
  }

  public next(): number {
    if (!(this.now < this.max)) {
      this.now = this.min;
    }
    return ++this.now;
  }
}
