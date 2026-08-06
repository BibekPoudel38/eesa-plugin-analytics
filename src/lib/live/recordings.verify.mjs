// Verify replay tenant isolation for real:  node src/lib/live/recordings.verify.mjs
//
// Runs the actual store against the in-memory backend (no Redis creds needed),
// with `server-only` and the redis client stubbed out. The claim under test is
// the one that kept this feature switched off for months: a recording written
// by one tenant must be unreachable from another, and the SCOPE must be part of
// the lookup rather than a comparison a caller could forget.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(here, "recordings.ts"), "utf8");
// Strip the two server-side imports; the memory backend is what we exercise.
src = src
  .replace('import "server-only";\n', "")
  .replace('import { redisClient } from "./store";\n', "function redisClient() { return null; }\n");

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { addRecordingChunk, getRecording, recordingIdsFor, clearRecordings } = mod;

let fails = 0;
const ok = (label, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) fails++;
  console.log(`  ${good ? "OK  " : "FAIL"} ${String(label).padEnd(56)} got=${JSON.stringify(got)}${good ? "" : " want=" + JSON.stringify(want)}`);
};

const ev = (t) => ({ type: 3, timestamp: t });
const A = { tenantId: "tenant-A", siteId: "site-1" };
const B = { tenantId: "tenant-B", siteId: "site-9" };
// Same tenant, different site — the other half of the scope.
const A2 = { tenantId: "tenant-A", siteId: "site-2" };

// The collision that matters: both tenants have a session with the SAME id.
// Session ids come from the browser, so this is not hypothetical.
const SID = "s_shared_id";

await addRecordingChunk({ ...A, sessionId: SID, device: "Desktop", path: "/a", events: [ev(1), ev(2)] });
await addRecordingChunk({ ...B, sessionId: SID, device: "Mobile", path: "/b", events: [ev(3), ev(4)] });
await addRecordingChunk({ ...A2, sessionId: "s_a2", device: "Desktop", path: "/c", events: [ev(5), ev(6)] });

console.log("\nISOLATION — the same session id in two tenants");
const recA = await getRecording(A.tenantId, A.siteId, SID);
const recB = await getRecording(B.tenantId, B.siteId, SID);
ok("tenant A reads its own", recA?.page, "/a");
ok("tenant B reads its own", recB?.page, "/b");
ok("they are different recordings", recA?.device !== recB?.device, true);
// The headline: B's id is valid, but not under A's scope.
ok("A cannot read B's recording", await getRecording(A.tenantId, B.siteId, SID) === null, true);
ok("B cannot read A's recording", await getRecording(B.tenantId, A.siteId, SID) === null, true);
ok("wrong tenant, right site", await getRecording(B.tenantId, A.siteId, SID) === null, true);
ok("right tenant, wrong site", await getRecording(A.tenantId, A2.siteId, SID) === null, true);
ok("unknown session", await getRecording(A.tenantId, A.siteId, "nope") === null, true);

console.log("\nISOLATION — the watchable-session sets");
ok("A/site-1 sees only its own", [...await recordingIdsFor(A.tenantId, A.siteId)], [SID]);
ok("B/site-9 sees only its own", [...await recordingIdsFor(B.tenantId, B.siteId)], [SID]);
ok("A/site-2 is a separate set", [...await recordingIdsFor(A2.tenantId, A2.siteId)], ["s_a2"]);
ok("an unknown scope sees nothing", [...await recordingIdsFor("tenant-Z", "site-0")], []);

console.log("\nGUARDS — a missing scope must never read or write globally");
ok("no tenant -> no read", await getRecording("", A.siteId, SID) === null, true);
ok("no site -> no read", await getRecording(A.tenantId, "", SID) === null, true);
ok("no scope -> empty id set", [...await recordingIdsFor("", "")], []);
ok("no tenant -> write refused", await addRecordingChunk({ tenantId: "", siteId: "s", sessionId: "x", device: "d", path: "/", events: [ev(1)] }), 0);
ok("no site -> write refused", await addRecordingChunk({ tenantId: "t", siteId: "", sessionId: "x", device: "d", path: "/", events: [ev(1)] }), 0);
ok("no session -> write refused", await addRecordingChunk({ ...A, sessionId: "", device: "d", path: "/", events: [ev(1)] }), 0);

console.log("\nKEY FORGERY — a scope value cannot impersonate another prefix");
// If ids were interpolated raw, a tenant id containing the separator could
// address another scope's keys. Both of these must stay distinct.
await addRecordingChunk({ tenantId: "t:x", siteId: "s", sessionId: "f1", device: "d", path: "/forge", events: [ev(1), ev(2)] });
await addRecordingChunk({ tenantId: "t", siteId: "x:s", sessionId: "f1", device: "d", path: "/real", events: [ev(3), ev(4)] });
const forged = await getRecording("t:x", "s", "f1");
const real = await getRecording("t", "x:s", "f1");
ok("'t:x'+'s' keeps its own row", forged?.page, "/forge");
ok("'t'+'x:s' keeps its own row", real?.page, "/real");
ok("the two did not collide", forged?.page !== real?.page, true);

console.log("\nACCUMULATION — chunks merge, and a still frame is not a replay");
await addRecordingChunk({ ...A, sessionId: "s_multi", device: "Desktop", path: "/m", events: [ev(10)] });
ok("1 event is not yet watchable", (await recordingIdsFor(A.tenantId, A.siteId)).has("s_multi"), false);
await addRecordingChunk({ ...A, sessionId: "s_multi", device: "Desktop", path: "/m", events: [ev(11), ev(12)] });
ok("3 events across 2 chunks", (await getRecording(A.tenantId, A.siteId, "s_multi"))?.events.length, 3);
ok("...now watchable", (await recordingIdsFor(A.tenantId, A.siteId)).has("s_multi"), true);
ok("firstTs is the earliest", (await getRecording(A.tenantId, A.siteId, "s_multi"))?.firstTs, 10);
ok("lastTs is the latest", (await getRecording(A.tenantId, A.siteId, "s_multi"))?.lastTs, 12);

console.log("\nCLEAR — scoped, never global");
await clearRecordings(A.tenantId, A.siteId);
ok("A/site-1 is emptied", [...await recordingIdsFor(A.tenantId, A.siteId)], []);
ok("B is untouched", (await getRecording(B.tenantId, B.siteId, SID))?.page, "/b");
ok("A/site-2 is untouched", [...await recordingIdsFor(A2.tenantId, A2.siteId)], ["s_a2"]);

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nAll assertions passed.\n");
process.exit(fails ? 1 : 0);
