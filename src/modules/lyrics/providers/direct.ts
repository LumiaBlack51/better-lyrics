import { parseLRC } from "@braccato/parsers";
import { directLyricsRequest } from "./directRequest";
import { normalizeTrackText, scoreTrack, searchTitle, type TrackCandidate } from "./trackMatch";
import type { ProviderParameters } from "./shared";

interface NetEaseSong {
  id: number;
  name: string;
  duration: number;
  artists: { name: string; alias?: string[] }[];
  album: { name: string };
}

interface LrcLibSong {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string | null;
}

function target(params: ProviderParameters): TrackCandidate {
  return {
    title: params.song,
    artists: params.artist.split(/,\s*(?:&\s*)?|\s+&\s+/),
    album: params.album || "",
    duration: params.duration,
  };
}

export async function netease(params: ProviderParameters): Promise<void> {
  const source = params.sourceMap["netease-synced"];
  if (!/\p{Script=Han}/u.test(params.song + params.artist)) {
    source.filled = true;
    return;
  }
  const title = searchTitle(params.song);
  const query = `${title} ${params.artist}`;
  const normalizedQuery = normalizeTrackText(query);
  const queries = [query];
  if (normalizedQuery !== query.replace(/\s/g, "").toLowerCase()) queries.push(normalizedQuery);
  for (const queryText of queries) {
    const data = (await directLyricsRequest({ provider: "netease-search", query: queryText }, params.signal)) as {
      code?: number;
      result?: { songs?: NetEaseSong[] };
    };
    if (data.code !== undefined && data.code !== 200) throw new Error(`NetEase returned ${data.code}`);
    const candidates = (data.result?.songs || [])
      .map(song => ({
        song,
        score: scoreTrack(
          {
            title: song.name,
            artists: song.artists.flatMap(artist => [artist.name, ...(artist.alias || [])]),
            album: song.album.name,
            duration: song.duration / 1000,
          },
          target(params)
        ),
      }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score);
    for (const { song } of candidates.slice(0, 3)) {
      const result = (await directLyricsRequest({ provider: "netease-lyrics", id: song.id }, params.signal)) as {
        code: number;
        lrc?: { lyric: string };
      };
      if (result.code !== 200) throw new Error(`NetEase returned ${result.code}`);
      const lyrics = result.lrc?.lyric ? parseLRC(result.lrc.lyric, params.duration * 1000) : [];
      if (!lyrics.some(line => line.startTimeMs > 0)) continue;
      params.signal.throwIfAborted();
      source.lyricSourceResult = {
        lyrics,
        source: "NetEase",
        sourceHref: `https://music.163.com/song?id=${song.id}`,
        musicVideoSynced: false,
        cacheAllowed: true,
      };
      source.filled = true;
      return;
    }
  }
  source.filled = true;
}

export async function directLrcLib(params: ProviderParameters): Promise<void> {
  const source = params.sourceMap["lrclib-direct-synced"];
  const data = await directLyricsRequest(
    { provider: "lrclib-search", title: searchTitle(params.song), artist: params.artist },
    params.signal
  );
  if (!Array.isArray(data)) throw new Error("Invalid LRCLIB response");
  const candidates = (data as LrcLibSong[])
    .map(song => ({
      song,
      score: scoreTrack(
        {
          title: song.trackName,
          artists: song.artistName.split(/,\s*|\s+&\s+/),
          album: song.albumName,
          duration: song.duration,
        },
        target(params)
      ),
    }))
    .filter(item => item.score >= 0 && item.song.syncedLyrics)
    .sort((a, b) => b.score - a.score);
  for (const { song } of candidates) {
    const lyrics = parseLRC(song.syncedLyrics!, params.duration * 1000);
    if (!lyrics.some(line => line.startTimeMs > 0)) continue;
    params.signal.throwIfAborted();
    source.lyricSourceResult = {
      lyrics,
      source: "LRCLIB",
      sourceHref: `https://lrclib.net/api/get/${song.id}`,
      musicVideoSynced: false,
      cacheAllowed: true,
    };
    break;
  }
  source.filled = true;
}
