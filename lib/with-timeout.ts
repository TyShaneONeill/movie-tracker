/** Thrown by {@link withTimeout} when the wrapped promise doesn't settle in time. */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Races `promise` against a timer, rejecting with {@link TimeoutError} if it
 * hasn't settled within `ms`. Does NOT cancel or abort `promise` — a hung
 * network call (e.g. a Supabase request with no AbortController) keeps
 * running in the background. Callers that want a value from it anyway
 * should keep their own reference to `promise` and attach a `.then()` for
 * later reconciliation, rather than relying on the raced promise returned
 * here.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
