import { appendFileSync } from "node:fs";

const releaseTimestamp = process.env.RELEASE_TIMESTAMP;
const releaseDate = releaseTimestamp ? new Date(releaseTimestamp) : new Date();

if (Number.isNaN(releaseDate.getTime())) {
  throw new Error(`Invalid RELEASE_TIMESTAMP: ${releaseTimestamp}`);
}

const releaseYear = releaseDate.getUTCFullYear();
const yearStart = Date.UTC(releaseYear, 0, 1);
const releaseDayStart = Date.UTC(
  releaseYear,
  releaseDate.getUTCMonth(),
  releaseDate.getUTCDate(),
);
const releaseDay = Math.floor((releaseDayStart - yearStart) / 86_400_000) + 1;
const releaseHour = releaseDate.getUTCHours();
const releaseSecondWithinHour =
  releaseDate.getUTCMinutes() * 60 + releaseDate.getUTCSeconds();
const releaseVersion = [
  releaseYear,
  releaseDay,
  releaseHour,
  releaseSecondWithinHour,
].join(".");

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${releaseVersion}\n`);
}

process.stdout.write(`${releaseVersion}\n`);
