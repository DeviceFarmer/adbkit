import Service from './service';
import ReverseStream from './reversestream';

type Stream = Service | ReverseStream;

export default class ServiceMap {
  private remotes: Record<number, Stream> = Object.create(null);
  public count = 0;

  public end(): void {
    const ref = this.remotes;
    for (const remoteId in ref) {
      const remote = ref[remoteId];
      remote.end();
    }
    this.remotes = Object.create(null);
    this.count = 0;
  }

  public insert(remoteId: number, socket: Stream): Stream {
    if (this.remotes[remoteId]) {
      throw new Error(`Remote ID ${remoteId} is already being used`);
    } else {
      this.count += 1;
      return (this.remotes[remoteId] = socket);
    }
  }

  public get(remoteId: number): Stream | null {
    return this.remotes[remoteId] || null;
  }

  public remove(remoteId: number): Stream | null {
    let remote: Stream;
    if ((remote = this.remotes[remoteId])) {
      delete this.remotes[remoteId];
      this.count -= 1;
      return remote;
    } else {
      return null;
    }
  }
}
