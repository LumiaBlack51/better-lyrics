import assert from "node:assert/strict";
import { selectReady, settleWithin } from "./selectReady";

const pending = new Promise<null>(() => undefined);
const signal = new AbortController().signal;
assert.deepEqual(
  await selectReady([() => pending, async () => "timed"], signal, 5),
  { index: 1, value: "timed" },
  "a slow preferred source cannot block usable timed lyrics"
);
assert.deepEqual(
  await selectReady([async () => "word", async () => "line"], signal, 5),
  { index: 0, value: "word" },
  "ready providers preserve preference order"
);
assert.equal(
  await selectReady(
    [
      async () => null,
      async () => {
        throw new Error("offline");
      },
    ],
    signal,
    5
  ),
  null
);
const controller = new AbortController();
const cancelled = selectReady([() => pending], controller.signal);
controller.abort(new Error("song changed"));
await assert.rejects(cancelled, /song changed/);
assert.equal(await settleWithin(pending, 5), null);
assert.equal(await settleWithin(Promise.resolve("cached"), 5), "cached");
console.log("selectReady selfcheck passed");
