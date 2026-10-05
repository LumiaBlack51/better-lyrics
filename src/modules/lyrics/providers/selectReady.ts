export async function settleWithin<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T | null> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve, reject) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        abort = () => reject(signal?.reason);
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export async function selectReady<T>(
  loaders: readonly (() => Promise<T | null>)[],
  signal: AbortSignal,
  graceMs = 600
): Promise<{ index: number; value: T } | null> {
  signal.throwIfAborted();
  if (!loaders.length) return null;
  return new Promise((resolve, reject) => {
    const ready = new Map<number, T>();
    let remaining = loaders.length;
    let graceElapsed = false;
    let done = false;
    const finish = (result: { index: number; value: T } | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const pick = () => {
      const index = Math.min(...ready.keys());
      if (ready.size && (index === 0 || graceElapsed || remaining === 0)) finish({ index, value: ready.get(index)! });
      else if (remaining === 0) finish(null);
    };
    const timer = setTimeout(() => {
      graceElapsed = true;
      pick();
    }, graceMs);
    signal.addEventListener("abort", abort, { once: true });
    loaders.forEach((load, index) => {
      Promise.resolve()
        .then(load)
        .then(
          value => {
            if (value !== null) ready.set(index, value);
          },
          () => undefined
        )
        .finally(() => {
          remaining--;
          pick();
        });
    });
  });
}
