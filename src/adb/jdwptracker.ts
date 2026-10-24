/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';
import Parser from './parser';
import { warnUnhandled } from './promise';
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
  private reader: Promise<unknown>;
  private reading = true;
  private ended = false;

  constructor(private command: Command<JdwpTracker>) {
    super();
    this.command = command;
    this.pids = [];
    this.pidMap = Object.create(null);
    this.reader = this.read()
      .catch((err) => {
        if (err instanceof Parser.PrematureEOFError) {
          return this._emitEnd();
        }
        if (err instanceof Parser.CancellationError) {
          this.command.connection.end();
          return this._emitEnd();
        }
        this.command.connection.end();
        this.emit('error', err);
        return this._emitEnd();
      })
      .finally(() => {
        this.reading = false;
      })
      .catch(warnUnhandled);
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

  read(): Promise<JdwpTracker> {
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

  /**
   * Stops tracking: cancels the pending read, ends the connection and
   * emits 'end'.
   */
  end(): JdwpTracker {
    if (this.reading) {
      // The read loop ends the connection and emits 'end' once cancelled.
      this.command.parser.cancel();
    } else if (!this.ended) {
      this.command.connection.end();
      this._emitEnd();
    }
    return this;
  }

  private _emitEnd(): boolean {
    if (this.ended) {
      return false;
    }
    this.ended = true;
    return this.emit('end');
  }
}
