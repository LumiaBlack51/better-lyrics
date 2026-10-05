import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directRequestUrl, initDirectLyrics, isMusicPage } from "./directLyrics";
import type { DirectLyricsRequest } from "@modules/lyrics/providers/directRequest";

assert.equal(isMusicPage("https://music.youtube.com/watch?v=123"), true);
for (const url of [
  undefined,
  "https://www.youtube.com",
  "https://example.com",
  "https://music.youtube.com.evil.test",
  "https://music.youtube.com@evil.test",
])
  assert.equal(isMusicPage(url), false);
assert.equal(
  new URL(directRequestUrl({ provider: "netease-search", query: "崔健 从头再来" })).hostname,
  "music.163.com"
);
assert.throws(() => directRequestUrl({ provider: "netease-lyrics", id: -1 }));
assert.throws(() =>
  directRequestUrl({ provider: "arbitrary", url: "https://example.com" } as unknown as DirectLyricsRequest)
);
const manifest = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
for (const script of manifest.content_scripts) assert.deepEqual(script.matches, ["*://music.youtube.com/*"]);
for (const host of ["https://music.163.com", "https://lrclib.net"]) {
  assert.ok(manifest.host_permissions.includes(`${host}/*`));
  assert.ok(
    manifest.content_security_policy.extension_pages.includes(host),
    "direct providers must pass extension-page CSP"
  );
}
let connectionHandler: (port: chrome.runtime.Port) => void = () => undefined;
Object.assign(globalThis, {
  chrome: {
    runtime: {
      onConnect: {
        addListener: (listener: typeof connectionHandler) => {
          connectionHandler = listener;
        },
      },
    },
  },
});
let requests = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  requests++;
  return new Response("{}");
};
initDirectLyrics();
assert.equal(requests, 0, "registering the background service performs no request");
let disconnected = false;
connectionHandler({
  name: "direct-lyrics",
  sender: { url: "https://example.com", tab: { id: 1 } },
  disconnect: () => {
    disconnected = true;
  },
} as unknown as chrome.runtime.Port);
assert.equal(disconnected, true);
assert.equal(requests, 0, "other pages cannot wake a lyrics fetch");
globalThis.fetch = originalFetch;
console.log("directLyrics selfcheck passed");
