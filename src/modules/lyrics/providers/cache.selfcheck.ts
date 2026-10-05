import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { url: "https://music.youtube.com" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  HTMLElement: dom.window.HTMLElement,
});
const local: Record<string, unknown> = {};
Object.assign(globalThis, {
  chrome: {
    runtime: { getURL: (path: string) => path },
    storage: {
      local: {
        get: async (key: string | null) => (key ? { [key]: local[key] } : local),
        set: async (data: object) => Object.assign(local, data),
        remove: async (keys: string | string[]) => {
          for (const key of [keys].flat()) delete local[key];
        },
      },
      sync: { get: async () => ({}), set: async () => undefined },
      onChanged: { addListener: () => undefined },
    },
  },
});
const { getLyrics, loadCachedSources, newSourceMap, saveLyricsToCache } = await import("./shared");
const { netease } = await import("./direct");
const params = {
  song: "从头再来",
  artist: "崔健",
  duration: 310,
  videoId: "cache-test",
  album: "",
  audioTrackData: null,
  sourceMap: newSourceMap(),
  alwaysFetchMetadata: false,
  signal: new AbortController().signal,
};
const result = {
  source: "NetEase",
  sourceHref: "https://music.163.com/song?id=1",
  lyrics: [{ words: "synthetic fixture", startTimeMs: 30000, durationMs: 5000 }],
  cacheAllowed: true,
};
params.sourceMap["netease-synced"].filled = true;
params.sourceMap["netease-synced"].lyricSourceResult = result;
await saveLyricsToCache(params, "netease-synced");
params.sourceMap = newSourceMap();
let calls = 0;
params.sourceMap["netease-synced"].lyricSourceFiller = async () => {
  calls++;
  throw new Error("offline");
};
await loadCachedSources(params);
assert.deepEqual((await getLyrics(params, "netease-synced"))?.lyrics, result.lyrics);
assert.equal(calls, 0, "returning to a cached song never calls the provider even offline");
local["blyrics_cache-test_netease-synced"] = { value: "broken json", expiry: Date.now() + 1000 };
params.sourceMap = newSourceMap();
params.sourceMap["netease-synced"].lyricSourceFiller = async () => {
  calls++;
  params.sourceMap["netease-synced"].filled = true;
  params.sourceMap["netease-synced"].lyricSourceResult = result;
};
assert.deepEqual(await getLyrics(params, "netease-synced"), result);
assert.equal(calls, 1, "corrupt cache falls back to fetching");
params.sourceMap = newSourceMap();
await assert.rejects(netease(params), /connect/);
assert.equal(
  params.sourceMap["netease-synced"].filled,
  false,
  "transport errors do not become cached not-found results"
);
local.jwtToken = `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 100000 }))}.signature`;
const originalFetch = globalThis.fetch;
let streams = 0;
globalThis.fetch = async (_url, options) => {
  streams++;
  const song = new URLSearchParams(options?.body as URLSearchParams).get("song");
  await new Promise(resolve => setTimeout(resolve, 10));
  return new Response(`event: metadata\ndata: ${JSON.stringify({ song, artist: "fixture", duration: 100 })}\n\n`);
};
const a = { ...params, videoId: "same-video", song: "prefetch", sourceMap: newSourceMap() };
const b = { ...params, videoId: "same-video", song: "playback", sourceMap: newSourceMap() };
const [metaA, metaB] = await Promise.all([getLyrics(a, "metadata"), getLyrics(b, "metadata")]);
assert.equal(metaA?.song, "prefetch");
assert.equal(metaB?.song, "playback", "prefetching the same video cannot steal the active player's stream");
assert.equal(streams, 2);
globalThis.fetch = originalFetch;
dom.window.close();
console.log("cache selfcheck passed");
