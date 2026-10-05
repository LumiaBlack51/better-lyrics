import { Converter } from "opencc-js/t2cn";

let simplify: ((text: string) => string) | undefined;

export function normalizeTrackText(text: string): string {
  const normalized = text.normalize("NFKC").toLowerCase();
  if (/\p{Script=Han}/u.test(normalized)) {
    simplify ??= Converter({ from: "t", to: "cn" });
    return simplify(normalized).replace(/[\p{P}\p{Z}\s]/gu, "");
  }
  return normalized.replace(/[\p{P}\p{Z}\s]/gu, "");
}

export function searchTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s*[(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio)|lyrics?|mv|hd|hq|\d{3,4}p)\s*[)\]]/gi, "")
    .trim();
}

export interface TrackCandidate {
  title: string;
  artists: string[];
  album: string;
  duration: number;
}

export function scoreTrack(candidate: TrackCandidate, target: TrackCandidate): number {
  if (normalizeTrackText(searchTitle(candidate.title)) !== normalizeTrackText(searchTitle(target.title))) return -1;
  const artists = candidate.artists.map(normalizeTrackText);
  if (!target.artists.some(artist => artists.includes(normalizeTrackText(artist)))) return -1;
  const delta = Math.abs(candidate.duration - target.duration);
  if (target.duration > 0 && (!(candidate.duration > 0) || delta > Math.max(8, target.duration * 0.025))) return -1;
  const albumMatches = target.album && normalizeTrackText(candidate.album) === normalizeTrackText(target.album);
  return 100 + (albumMatches ? 20 : 0) - delta;
}
