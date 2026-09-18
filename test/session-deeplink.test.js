// Opening one session by link.
//
// WHY THIS EXISTS
// The replay page resolved its site from a cookie and nothing else. That is
// right for somebody clicking around the dashboard and wrong for a LINK: Eesa's
// Customer 360 screen hands a support agent a URL for one specific session, and
// the agent's own cookie may hold a different site — or none, in which case the
// page silently takes sites[0]. The session then reports as not found, on a
// screen whose whole job is to play it.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const scope = fs.readFileSync("src/lib/eesa/scope.ts", "utf8");
const page = fs.readFileSync("src/app/app/sessions/[id]/page.tsx", "utf8");

test("the page reads the site off the URL", () => {
  assert.ok(/searchParams/.test(page), "the page must accept search params");
  assert.ok(/currentScope\([^)]*wanted/.test(page.replace(/\s+/g, " ")),
    "and pass the requested site into the scope resolver");
});

test("a requested site still has to belong to the tenant", () => {
  // The id arrives from a URL anyone can edit. It is matched against the
  // tenant's OWN site list, so another tenant's id resolves to nothing and
  // falls through — rather than being trusted because it was asked for.
  const fn = scope.slice(scope.indexOf("export async function currentScope"));
  assert.ok(/sites\.find\(\(s\) => s\.id === id\)/.test(fn),
    "the preferred id must be looked up in this tenant's sites");
  assert.ok(/listSites\(tenantId\)/.test(scope),
    "and that list must come from the verified tenant, not the request");
});

test("the fallback order is preserved", () => {
  // Deep link first, then the person's chosen site, then their first site.
  // Getting this order wrong means either links that do not work or a page
  // that ignores the site somebody just picked in the switcher.
  const fn = scope.slice(scope.indexOf("const pick ="), scope.indexOf("return { authed: true"));
  const order = fn.match(/pick\((preferSiteId|activeId)\)/g) || [];
  assert.deepStrictEqual(order, ["pick(preferSiteId)", "pick(activeId)"],
    "an explicit link must win over the cookie");
  assert.ok(/\?\?\s*sites\[0\]\s*\?\?\s*null/.test(fn), "and the list's head last");
});

test("the parameter is optional, so normal navigation is unchanged", () => {
  assert.ok(/currentScope\(preferSiteId\?: string\)/.test(scope),
    "every other caller passes nothing and must keep working");
});
