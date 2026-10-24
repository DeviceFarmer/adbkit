import { Callback } from '../Callback';

/**
 * Calls a Node-style callback, if given, once the promise settles, and
 * returns the same promise. Replaces bluebird's `.nodeify()` for the methods
 * that still take a callback.
 *
 * A callback that throws doesn't turn into a rejection; the error is
 * rethrown on the next tick, like bluebird did.
 */
export function nodeify<T>(promise: Promise<T>, callback?: Callback<T>): Promise<T> {
  if (callback) {
    const call = (err: Error | null, value?: T) => {
      try {
        callback(err, value);
      } catch (callbackError) {
        process.nextTick(() => {
          throw callbackError;
        });
      }
    };
    promise.then(
      (value) => call(null, value),
      (err) => call(err),
    );
  }
  return promise;
}

/**
 * Terminal handler for promise chains nobody awaits, such as a tracker's
 * read loop. With bluebird such a rejection only printed a warning; with
 * native promises it would crash the process, so print a warning instead.
 * This mostly happens when an 'error' event is emitted without a listener.
 */
export function warnUnhandled(err: unknown): void {
  process.emitWarning(err instanceof Error ? err : new Error(String(err)));
}
