export type DirectLyricsRequest =
  | { provider: "netease-search"; query: string }
  | { provider: "netease-lyrics"; id: number }
  | { provider: "lrclib-search"; title: string; artist: string };

export function directLyricsRequest(request: DirectLyricsRequest, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: "direct-lyrics" });
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      port.onDisconnect.removeListener(disconnected);
      port.disconnect();
    };
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    const disconnected = () => {
      const error = chrome.runtime.lastError?.message;
      cleanup();
      reject(new Error(error || "Lyrics request disconnected"));
    };
    port.onDisconnect.addListener(disconnected);
    port.onMessage.addListener(response => {
      cleanup();
      if (response.error) reject(new Error(response.error));
      else resolve(response.data);
    });
    signal.addEventListener("abort", abort, { once: true });
    port.postMessage(request);
  });
}
