import { EventEmitter } from 'events';
import Bluebird from 'bluebird';
import Parser from './parser';
import Command from './command';

class JdwpTracker extends EventEmitter {
	private pids = [];
	private pidMap = Object.create(null);
	private reader: Bluebird<JdwpTracker | boolean>;

	constructor(private command: Command<JdwpTracker>) {
		super();
		this.command = command;
		this.pids = [];
		this.pidMap = Object.create(null);
		this.reader = this.read()
			.catch(Parser.PrematureEOFError, () => {
				return this.emit('end');
			})
			.catch(Bluebird.CancellationError, () => {
				this.command.connection.end();
				return this.emit('end');
			})
			.catch((err) => {
				this.command.connection.end();
				this.emit('error', err);
				return this.emit('end');
			});
	}

	read(): Bluebird<JdwpTracker> {
		return this.command.parser
			.readValue()
			.cancellable()
			.then((list) => {
				const pids = list.toString().split('\n');
				const maybeEmpty = pids.pop();
				if (maybeEmpty) {
					pids.push(maybeEmpty);
				}
				return this.update(pids);
			});
	}

	update(newList: string[]): JdwpTracker {
		let i, j, len, len1, pid;
		const changeSet = {
			removed: [],
			added: [],
		};
		const newMap = Object.create(null);
		for (i = 0, len = newList.length; i < len; i++) {
			pid = newList[i];
			if (!this.pidMap[pid]) {
				changeSet.added.push(pid);
				this.emit('add', pid);
				newMap[pid] = pid;
			}
		}
		const ref = this.pids;
		for (j = 0, len1 = ref.length; j < len1; j++) {
			pid = ref[j];
			if (!newMap[pid]) {
				changeSet.removed.push(pid);
				this.emit('remove', pid);
			}
		}
		this.pids = newList;
		this.pidMap = newMap;
		this.emit('changeSet', changeSet, newList);
		return this;
	}

	end(): JdwpTracker {
		this.reader.cancel();
		return this;
	}
}

export = JdwpTracker;
