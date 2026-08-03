import { createHmac, randomUUID } from "node:crypto";

const jwtIssuer = process.env.FIREFOX_JWT_ISSUER;
const jwtSecret = process.env.FIREFOX_JWT_SECRET;

if (!jwtIssuer || !jwtSecret) {
  throw new Error("FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set");
}

const issuedAt = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iss: jwtIssuer,
  jti: randomUUID(),
  iat: issuedAt,
  exp: issuedAt + 60,
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const unsignedToken = `${encode(header)}.${encode(payload)}`;
const signature = createHmac("sha256", jwtSecret)
  .update(unsignedToken)
  .digest("base64url");

process.stdout.write(`${unsignedToken}.${signature}`);
