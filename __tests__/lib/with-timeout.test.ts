import { withTimeout, TimeoutError } from '@/lib/with-timeout';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the original value when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('rejects with the original error when the promise rejects before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('rejects with TimeoutError when the promise never settles within the bound', async () => {
    jest.useFakeTimers();
    const hung = new Promise(() => {});
    const raced = withTimeout(hung, 1000);
    const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
    await jest.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('does not reject when the promise settles just before the bound', async () => {
    jest.useFakeTimers();
    let resolveHung: (value: string) => void = () => {};
    const controlled = new Promise<string>((resolve) => {
      resolveHung = resolve;
    });
    const raced = withTimeout(controlled, 1000);

    resolveHung('just in time');
    await jest.advanceTimersByTimeAsync(1000);

    await expect(raced).resolves.toBe('just in time');
  });
});
