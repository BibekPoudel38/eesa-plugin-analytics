/*!
 * eesa-analytics — React Native client for Eesa Analytics.
 *
 * The web tracker cannot be reused here. It is built on document, localStorage
 * and matchMedia, none of which exist in React Native. What DOES carry over is
 * the wire format: /api/collect is plain JSON over HTTP and accepts a client
 * with no Origin and no Referer, so an app needs no SDK and no new endpoint —
 * only this file.
 *
 * Deliberately dependency-free. AsyncStorage is used when the app already has
 * it and is otherwise degraded to in-memory, because a tracker is never a good
 * reason to add a native dependency to someone's build.
 *
 *   import analytics from "./eesa-analytics";
 *
 *   analytics.init({ siteKey: "eak_live_…" });        // once, at startup
 *   analytics.screen("MenuScreen");                    // on navigation change
 *   analytics.click("add_to_cart", { text: "Add to cart" });
 *   analytics.identify(user.id);                       // after YOUR login
 *
 * Every call is fire-and-forget and swallows its own errors: analytics must
 * never be able to crash the app it measures.
 */

const ENDPOINT = "https://analytics-production-1445.up.railway.app/api/collect";
const SESSION_IDLE_MS = 30 * 60 * 1000; // matches the web tracker's window
const FLUSH_DEBOUNCE_MS = 4000;
const MAX_BATCH = 50;
const MAX_QUEUE = 500; // hard cap: a long offline stretch must not grow forever

const VISITOR_KEY = "eesa_vid";

let cfg = null;
let queue = [];
let flushTimer = null;
let visitorId = null;
let userId = "";
let sessionId = null;
let lastSeen = 0;
let storage = null;

/* ---------- tiny helpers ------------------------------------------------- */

function uid() {
  // Not crypto — an anonymous device id only has to be unlikely to collide.
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}

/** AsyncStorage when the app has it; an in-memory shim when it does not. */
function resolveStorage(injected) {
  if (injected) return injected;
  const mod = safe(
    () => require("@react-native-async-storage/async-storage").default,
    null,
  );
  if (mod) return mod;
  const mem = {};
  return {
    getItem: (k) => Promise.resolve(mem[k] ?? null),
    setItem: (k, v) => {
      mem[k] = v;
      return Promise.resolve();
    },
  };
}

function platform() {
  const RN = safe(() => require("react-native"), null);
  if (!RN) return { os: "", w: 0, h: 0, tablet: false };
  const os =
    RN.Platform.OS === "ios" ? "iOS" : RN.Platform.OS === "android" ? "Android" : "";
  const d = safe(() => RN.Dimensions.get("window"), { width: 0, height: 0 });
  // No device-info dependency: the short edge is what separates a phone from a
  // tablet in practice, and being approximately right beats another native dep.
  const shortEdge = Math.min(d.width || 0, d.height || 0);
  return { os, w: d.width || 0, h: d.height || 0, tablet: shortEdge >= 600 };
}

/* ---------- identity ----------------------------------------------------- */

async function loadVisitor() {
  if (visitorId) return visitorId;
  const stored = await safe(() => storage.getItem(VISITOR_KEY), null);
  visitorId = stored || uid();
  if (!stored) safe(() => storage.setItem(VISITOR_KEY, visitorId), null);
  return visitorId;
}

function currentSession() {
  const now = Date.now();
  if (!sessionId || now - lastSeen > SESSION_IDLE_MS) sessionId = uid();
  lastSeen = now;
  return sessionId;
}

/* ---------- transport ---------------------------------------------------- */

function meta() {
  const p = platform();
  return {
    siteId: cfg.siteKey,
    visitorId: visitorId || "",
    sessionId: currentSession(),
    userId: userId || undefined,
    referrer: "",
    device: p.tablet ? "Tablet" : "Mobile",
    browser: "", // there is no browser; leaving it blank is the honest value
    os: p.os,
    viewportW: Math.round(p.w),
    viewportH: Math.round(p.h),
    // Marks these events as coming from the app rather than a phone browser.
    // Without it nothing in the payload tells the two apart once stored.
    displayMode: "app",
  };
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!cfg || !queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  const body = JSON.stringify({ meta: meta(), events: batch });
  try {
    await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch (e) {
    // Offline or the request failed. Put them back at the FRONT so ordering
    // survives, but honour the cap — an app left offline for a day must not
    // accumulate an unbounded queue in memory.
    queue = batch.concat(queue).slice(0, MAX_QUEUE);
  }
}

function schedule() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_DEBOUNCE_MS);
}

function push(ev) {
  if (!cfg) return; // init() not called yet; drop rather than buffer forever
  queue.push(ev);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= MAX_BATCH) flush();
  else schedule();
}

/* ---------- public API --------------------------------------------------- */

const analytics = {
  /**
   * Call once at startup. `siteKey` is the site's tracking key — it MUST start
   * with "eak_": the ingest rejects anything else by returning
   * {"ok":true,"accepted":0} with HTTP 202, which is indistinguishable from
   * success, so a wrong key collects nothing and looks perfectly healthy.
   */
  init(options) {
    const o = options || {};
    if (!o.siteKey) return;
    cfg = { siteKey: o.siteKey, endpoint: o.endpoint || ENDPOINT };
    storage = resolveStorage(o.storage);
    loadVisitor();

    // Send what is queued before the OS suspends us; a backgrounded app may
    // never get another chance to run.
    const RN = safe(() => require("react-native"), null);
    if (RN && RN.AppState) {
      safe(
        () =>
          RN.AppState.addEventListener("change", (s) => {
            if (s !== "active") flush();
          }),
        null,
      );
    }
  },

  /** A screen was shown. Pass the route name; it is stored as the path. */
  screen(name, props) {
    push({
      type: "pageview",
      path: name ? (name[0] === "/" ? name : "/" + name) : "/",
      ts: Date.now(),
      props: props || undefined,
    });
  },

  /** Something was tapped. `target` is a stable id, not a coordinate. */
  click(target, extra) {
    const e = extra || {};
    push({
      type: "click",
      path: e.screen || "",
      target: target || "",
      text: e.text || undefined,
      ts: Date.now(),
      props: e.props || undefined,
    });
  },

  /** Any other named event. */
  track(name, props) {
    push({ type: "custom", path: "", name: name || "", ts: Date.now(), props });
  },

  /** Link this device to YOUR user id, after your own login. */
  identify(id) {
    userId = id == null ? "" : String(id);
    flush();
  },

  /** Force a send — e.g. right before sign-out. */
  flush,
};

export default analytics;
