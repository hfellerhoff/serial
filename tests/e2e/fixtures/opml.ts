import fs from "node:fs";

const FIXTURE_RSS_ORIGIN = "http://127.0.0.1:3003";

export function readOpmlFixture(path: string, rssPort: number) {
  return fs
    .readFileSync(path, "utf-8")
    .replaceAll(FIXTURE_RSS_ORIGIN, `http://127.0.0.1:${rssPort.toString()}`);
}
