/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import Bluebird from 'bluebird';
import Parser from './parser';
import Command from './command';

interface JdwpTrackerChangeSet {
  /**
   * array of pid
   */
  removed: string[];
  /**
   * array of pid
   */
  added: string[];
}

export default class JdwpTracker extends EventEmitter {
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

  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'remove', listener: (pid: string) => void): this;
  on(event: 'add', listener: (pid: string) => void): this;
  on(event: 'changeSet', listener: (changeSet: JdwpTrackerChangeSet, newList: string[]) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  once(event: 'end', listener: () => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'remove', listener: (pid: string) => void): this;
  once(event: 'add', listener: (pid: string) => void): this;
  once(event: 'changeSet', listener: (changeSet: JdwpTrackerChangeSet, newList: string[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  emit(event: 'end'): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'remove', pid: string): boolean;
  emit(event: 'add', pid: string): boolean;
  emit(event: 'changeSet', changeSet: JdwpTrackerChangeSet, newList: string[]): boolean;
  emit(event: string | symbol, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  read(): Bluebird<JdwpTracker> {
    return this.command.parser.readValue().then((list) => {
      const pids = list.toString().split('\n');
      const maybeEmpty = pids.pop();
      if (maybeEmpty) {
        pids.push(maybeEmpty);
      }
      return this.update(pids);
    });
  }

  update(newList: string[]): JdwpTracker {
    const changeSet: JdwpTrackerChangeSet = {
      removed: [],
      added: [],
    };
    const newMap = Object.create(null);
    for (let i = 0, len = newList.length; i < len; i++) {
      const pid = newList[i];
      if (!this.pidMap[pid]) {
        changeSet.added.push(pid);
        this.emit('add', pid);
        newMap[pid] = pid;
      }
    }
    const ref = this.pids;
    for (let j = 0, len1 = ref.length; j < len1; j++) {
      const pid = ref[j];
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
