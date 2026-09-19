// Hermetic tests for the in-memory anchor-JWT holder: lifetime, expiry,
// idempotent drop, redaction — and that it offers no way to enumerate secrets.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as creds from "./anchorCredentials.ts";
import { releaseProtection } from "./protectionRelease.ts";
import { activeProtectionCount, trackProtection } from "./store.ts";
import { dropAnchorJwt, getAnchorJwt, heldAnchorJwtCount, holdAnchorJwt, jwtExpiryMs, redactAnchorJwt } from "./anchorCredentials.ts";

const NOW = 1_800_000_000_000; // fixed clock, ms
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** A syntactically valid JWT (unsigned — the holder never verifies signatures). */
const jwt = (expSecondsFromNow: number, tag = "a") => `${b64({ alg: "none" })}.${b64({ sub: tag, exp: Math.floor(NOW / 1000) + expSecondsFromNow })}.sig-${tag}`;

test("a valid token is held and returned until shortly before it expires", () => {
  const t = jwt(3600);
  assert.equal(holdAnchorJwt("h1", t, NOW), true);
  assert.equal(getAnchorJwt("h1", NOW), t);
  assert.equal(getAnchorJwt("h1", NOW + 3_500_000), t, "still usable 58 minutes in");
  assert.equal(getAnchorJwt("h1", NOW + 3_575_000), null, "inside the 30 s skew window it counts as expired");
  assert.equal(getAnchorJwt("h1", NOW), null, "and expiry dropped it for good");
  dropAnchorJwt("h1");
});

test("an expired, malformed or expiry-less token is never held", () => {
  assert.equal(holdAnchorJwt("h2", jwt(-10), NOW), false);
  assert.equal(holdAnchorJwt("h2", "not-a-jwt", NOW), false);
  assert.equal(holdAnchorJwt("h2", `${b64({})}.${b64({ sub: "x" })}.sig`, NOW), false, "no exp claim");
  assert.equal(holdAnchorJwt("h2", `${b64({})}.!!!notbase64json!!!.sig`, NOW), false);
  assert.equal(getAnchorJwt("h2", NOW), null);
  assert.equal(jwtExpiryMs("garbage"), null);
});

test("drop is idempotent and per protection", () => {
  holdAnchorJwt("h3", jwt(600, "x"), NOW);
  holdAnchorJwt("h4", jwt(600, "y"), NOW);
  dropAnchorJwt("h3");
  dropAnchorJwt("h3"); // second drop: no-op, no throw
  assert.equal(getAnchorJwt("h3", NOW), null);
  assert.ok(getAnchorJwt("h4", NOW), "another protection's token is untouched");
  dropAnchorJwt("h4");
});

test("a fresher token replaces an older one; an older one never replaces a fresher one", () => {
  const short = jwt(600, "s");
  const long = jwt(7200, "l");
  holdAnchorJwt("h5", short, NOW);
  holdAnchorJwt("h5", long, NOW);
  assert.equal(getAnchorJwt("h5", NOW), long);
  holdAnchorJwt("h5", short, NOW);
  assert.equal(getAnchorJwt("h5", NOW), long, "kept the longer-lived token");
  dropAnchorJwt("h5");
});

test("redaction removes the held token from any text that might be logged", () => {
  const t = jwt(600, "leak");
  holdAnchorJwt("h6", t, NOW);
  const msg = `SEP-6 lookup failed for token ${t} (retry ${t})`;
  const safe = redactAnchorJwt("h6", msg);
  assert.ok(!safe.includes(t));
  assert.equal(safe, "SEP-6 lookup failed for token [redacted] (retry [redacted])");
  assert.equal(redactAnchorJwt("nothing-held", msg), msg);
  dropAnchorJwt("h6");
});

test("nothing can enumerate the held tokens, and the count is only a number", () => {
  const exported = Object.keys(creds).sort();
  assert.deepEqual(exported, ["dropAnchorJwt", "getAnchorJwt", "heldAnchorJwtCount", "holdAnchorJwt", "jwtExpiryMs", "redactAnchorJwt"]);
  holdAnchorJwt("h7", jwt(600, "z"), NOW);
  assert.equal(typeof heldAnchorJwtCount(), "number");
  dropAnchorJwt("h7");
});

test("reaching a terminal state frees the wallet slot AND forgets the anchor token, idempotently", () => {
  const wallet = "GRELEASEWALLET";
  trackProtection(wallet, "r1");
  holdAnchorJwt("r1", jwt(600, "r"), NOW);
  assert.equal(activeProtectionCount(wallet), 1);
  assert.ok(getAnchorJwt("r1", NOW));

  releaseProtection(wallet, "r1");
  assert.equal(activeProtectionCount(wallet), 0);
  assert.equal(getAnchorJwt("r1", NOW), null);

  releaseProtection(wallet, "r1"); // second call: nothing to do, nothing thrown
  assert.equal(activeProtectionCount(wallet), 0);
});
