// How the page is being displayed — installed-to-home-screen vs a browser tab.
// An installed PWA loads the SAME document as the tab, so this is the only
// signal separating them; if it regresses, installed usage silently reads as
// browser usage and nobody notices, because the number stays plausible.
//
// Run with: npm test
const fs = require("fs");

const src = fs.readFileSync("public/eesa-analytics.js", "utf8");
const block = src.slice(
  src.indexOf("function displayMode()"),
  src.indexOf("function meta()"),
);

function detect({ standalone, matches }) {
  const window = {
    navigator: { standalone },
    matchMedia: matches === null ? undefined : (q) => ({ matches: matches(q) }),
  };
  const fn = new Function("window", block + "; return displayMode();");
  return fn(window);
}
const only = (mode) => (q) => q === `(display-mode: ${mode})`;

const CASES = [
  ["iOS home-screen (legacy flag)", { standalone: true,  matches: only("browser") }, "standalone"],
  ["Android installed PWA",         { standalone: undefined, matches: only("standalone") }, "standalone"],
  ["normal browser tab",            { standalone: false, matches: only("browser") }, "browser"],
  ["minimal-ui",                    { standalone: undefined, matches: only("minimal-ui") }, "minimal-ui"],
  ["fullscreen",                    { standalone: undefined, matches: only("fullscreen") }, "fullscreen"],
  ["no matchMedia at all",          { standalone: undefined, matches: null }, ""],
  ["matchMedia matches nothing",    { standalone: undefined, matches: () => false }, ""],
];

let pass = 0, fail = 0;
for (const [name, env, expected] of CASES) {
  let got;
  try { got = detect(env); } catch (e) { got = "THREW: " + e.message; }
  const ok = got === expected;
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} -> ${JSON.stringify(got)}` +
      (ok ? "" : `   EXPECTED ${JSON.stringify(expected)}`),
  );
}
// The ingest allowlist is what actually decides which values survive to the
// database, and "app" is the one a native client sends. A tracker that never
// emits it is no reason to leave it untested — nothing else in a native
// payload distinguishes an app from a phone browser.
const enrich = fs.readFileSync("src/lib/live/enrich.ts", "utf8");
const allowlist = enrich.slice(
  enrich.indexOf("const DISPLAY_MODES"),
  enrich.indexOf("export function cleanDisplayMode"),
);
for (const [value, expected] of [["app", true], ["standalone", true], ["browser", true], ["nonsense", false]]) {
  const ok = allowlist.includes(`"${value}"`) === expected;
  ok ? pass++ : fail++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${("allowlist accepts " + value).padEnd(30)} -> ${expected}`,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
