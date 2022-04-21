import Stats from './stats';

class Entry extends Stats {
  constructor(public name: string, mode: number, size: number, mtime: number) {
    super(mode, BigInt(size), mtime);
  }

  public toString(): string {
    return this.name;
  }
}

export = Entry;
