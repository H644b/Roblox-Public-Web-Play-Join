import assert from "node:assert/strict";
import test from "node:test";
import { deriveBrowserGameFqdn, patchJoinResponse } from "./route.mjs";

const joinScript = {
  NetStackTokenValue: "AAECAwQFBgcICQoLDA0ODw==",
  MachineAddress: "10.41.5.30",
  NetStackPort: 50988,
  UdmuxEndpoints: [{ Address: "128.116.56.33" }],
  gameFqdn: null
};

test("derives the browser multiplexer hostname from a native join", () => {
  assert.deepEqual(deriveBrowserGameFqdn(joinScript), {
    hostname: "000102030405060708090a0b0c0d0e0f-0a29051e-c72c.80743822.qdmux.roblox.com",
    nativeVip: "128.116.56.33",
    browserVip: "128.116.56.34"
  });
});

test("adds only the missing hostname to an approved response", () => {
  const original = { status: 2, joinScript: structuredClone(joinScript), other: "preserved" };
  const result = patchJoinResponse(JSON.stringify(original));
  assert.equal(result.patched, true);
  const patched = JSON.parse(result.body);
  assert.equal(patched.joinScript.gameFqdn, deriveBrowserGameFqdn(joinScript).hostname);
  assert.equal(patched.other, original.other);
  assert.equal(original.joinScript.gameFqdn, null);
});

test("does not alter retry, denied, or already routed responses", () => {
  assert.equal(patchJoinResponse(JSON.stringify({ status: 0 })).patched, false);
  assert.equal(patchJoinResponse(JSON.stringify({ status: 12 })).patched, false);
  assert.equal(patchJoinResponse(JSON.stringify({ status: 2, joinScript: { ...joinScript, gameFqdn: "existing" } })).patched, false);
});
