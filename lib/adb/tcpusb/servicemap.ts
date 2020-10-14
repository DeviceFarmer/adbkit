import Service from './service';

class ServiceMap {
	private remotes: Record<number, Service> = Object.create(null);
	public count = 0;

	public end(): void {
		let remote, remoteId;
		const ref = this.remotes;
		for (remoteId in ref) {
			remote = ref[remoteId];
			remote.end();
		}
		this.remotes = Object.create(null);
		this.count = 0;
	}

	public insert(remoteId: number, socket: Service): Service {
		if (this.remotes[remoteId]) {
			throw new Error(`Remote ID ${remoteId} is already being used`);
		} else {
			this.count += 1;
			return (this.remotes[remoteId] = socket);
		}
	}

	public get(remoteId: number): Service | null {
		return this.remotes[remoteId] || null;
	}

	public remove(remoteId: number): Service | null {
		let remote;
		if ((remote = this.remotes[remoteId])) {
			delete this.remotes[remoteId];
			this.count -= 1;
			return remote;
		} else {
			return null;
		}
	}
}

export = ServiceMap;
