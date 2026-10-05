import type { DirectLyricsRequest } from "@modules/lyrics/providers/directRequest";

export function isMusicPage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === "https://music.youtube.com";
  } catch {
    return false;
  }
}

export function directRequestUrl(request: DirectLyricsRequest): string {
  switch (request.provider) {
    case "netease-search": {
      if (typeof request.query !== "string" || !request.query.trim() || request.query.length > 300) break;
      const params = new URLSearchParams({ s: request.query, type: "1", limit: "12" });
      return `https://music.163.com/api/search/get?${params}`;
    }
    case "netease-lyrics":
      if (!Number.isSafeInteger(request.id) || request.id <= 0) break;
      return `https://music.163.com/api/song/lyric?id=${request.id}&lv=-1&kv=-1&tv=-1`;
    case "lrclib-search": {
      if (
        typeof request.title !== "string" ||
        typeof request.artist !== "string" ||
        !request.title.trim() ||
        !request.artist.trim() ||
        request.title.length > 300 ||
        request.artist.length > 300
      )
        break;
      return `https://lrclib.net/api/search?${new URLSearchParams({ track_name: request.title, artist_name: request.artist })}`;
    }
  }
  throw new Error("Invalid lyrics request");
}

export function initDirectLyrics(): void {
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== "direct-lyrics") return;
    if (!isMusicPage(port.sender?.url) || !port.sender?.tab) {
      port.disconnect();
      return;
    }
    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    let started = false;
    port.onMessage.addListener(async request => {
      if (started) return;
      started = true;
      try {
        const response = await fetch(directRequestUrl(request), {
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error(`Lyrics provider returned HTTP ${response.status}`);
        const data = await response.json();
        if (!controller.signal.aborted) port.postMessage({ data });
      } catch (error) {
        if (!controller.signal.aborted) port.postMessage({ error: String(error) });
      }
    });
  });
}
