import assert from "node:assert/strict";
import { normalizeTrackText, scoreTrack, searchTitle, type TrackCandidate } from "./trackMatch";

const track: TrackCandidate = { title: "从头再来", artists: ["崔健"], album: "新长征路上的摇滚", duration: 310 };
assert.ok(scoreTrack({ ...track, title: "從頭再來", duration: 309.84 }, track) > 0);
assert.equal(scoreTrack({ ...track, title: "一无所有" }, track), -1);
assert.equal(scoreTrack({ ...track, artists: ["刘欢"] }, track), -1);
assert.equal(scoreTrack({ ...track, title: "从头再来 (Live)" }, track), -1);
assert.equal(scoreTrack({ ...track, duration: 280 }, track), -1);
assert.equal(searchTitle("从头再来 (Official Audio)"), track.title);
assert.equal(normalizeTrackText("幾分傷心幾分痴"), normalizeTrackText("几分伤心几分痴"));
assert.equal(normalizeTrackText("為你我受冷風吹"), normalizeTrackText("为你我受冷风吹"));
console.log("trackMatch selfcheck passed");
