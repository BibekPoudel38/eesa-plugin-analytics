// The error reporter's contract with the Eesa backend.
//
// Same approach as the other tests here: read the shipped source, assert
// against it, no bundler and no drift between what is checked and what runs.
// A behavioural test would need a Next.js server and a TypeScript loader to
// tell us less.
//
// What this actually guards is a mistake already made once. The first version
// sent `version` and `error`; the backend's serializer accepts `plugin_version`,
// `error_class` and `error_message`, and silently drops the rest. Nothing fails
// loudly when a field name is wrong — the row just arrives missing the part you
// needed, weeks later, while you are trying to explain an outage.
//
// Run with: npm test

const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync('src/instrumentation.ts', 'utf8');
let failures = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`);
    failures += 1;
  }
}

console.log('instrumentation.ts → backend contract');

// The exact keys apps/telemetry/serializers.py::PluginRequestSerializer accepts.
for (const field of [
  'trace_id', 'method', 'route', 'status', 'duration_ms',
  'plugin', 'plugin_version', 'error_class', 'error_message',
]) {
  check(`sends ${field}`, new RegExp(`\\b${field}:`).test(src));
}

// The names the serializer does NOT accept, which an earlier version sent.
check('does not send bare `version:`', !/[^_]\bversion:/.test(src));
check('does not send bare `error:`', !/\berror:\s/.test(src));

// The route PATTERN, not the path — otherwise the same page with a different
// id in it becomes a thousand rows that answer nothing.
check('prefers context.routePath over request.path', /routePath/.test(src));

// Silent unless configured: a fork or a local run must report to nobody.
check('returns early without the gateway secret', /if \(!SECRET\) return;/.test(src));

// This runs on an ALREADY-failing request. If it throws, it has made the
// outage worse than the bug it was describing.
check('swallows its own failure', /catch\s*\{/.test(src));

// Nothing that keeps a serverless instance alive for a log.
check('register starts no timer', !/setInterval|setTimeout/.test(src));

console.log(failures ? `\n  ${failures} failed` : '\n  all passed');
assert.equal(failures, 0, `${failures} contract check(s) failed`);
