/*!
 * eesa-analytics.js — lightweight product-analytics tracker for Eesa Analytics.
 * Captures page views, clicks (with position), rage/dead clicks, scroll depth,
 * sessions and custom events, then batches them to the Eesa ingest endpoint.
 *
 * Install:
 *   <script src="https://YOUR-EESA-HOST/eesa-analytics.js" data-site="YOUR_SITE_KEY" defer></script>
 * Custom events:
 *   eesa('add_to_cart', { item: 'Blue T-Shirt', price: 29 })
 */
(function () {
  "use strict";
  if (window.__eesaLoaded) return;
  window.__eesaLoaded = true;

  // ---- resolve config from our own <script> tag --------------------------
  var me =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      for (var i = s.length - 1; i >= 0; i--) {
        if (s[i].src && s[i].src.indexOf("eesa-analytics.js") > -1) return s[i];
      }
      return null;
    })();
  var cfg = window.EesaConfig || {};
  var siteId = (me && me.getAttribute("data-site")) || cfg.site || "default";
  var origin = me ? new URL(me.src).origin : "";
  var endpoint =
    (me && me.getAttribute("data-endpoint")) ||
    cfg.endpoint ||
    (origin ? origin + "/api/collect" : "/api/collect");
  var recEndpoint = origin ? origin + "/api/rec" : "/api/rec";
  var rrwebSrc = origin + "/rrweb.min.js";
  var doRecord = !(me && me.getAttribute("data-record") === "off");

  // ---- identity: visitor (persistent) + session (30-min sliding) ---------
  var SESSION_MS = 30 * 60 * 1000;
  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10)
    );
  }
  function ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  var visitorId = ls("eesa_vid") || (function () { var v = uid(); ls("eesa_vid", v); return v; })();
  // The tracked site's OWN user id, set by identify(). Persisted so a visitor
  // who is still signed in is known from their FIRST pageview on the next
  // visit, rather than only from the next time they log in. Kept separate from
  // the visitor id on purpose: the device id is ours and permanent, the
  // identity is the site's and comes and goes with their session.
  var userId = ls("eesa_uid") || "";
  function sessionId() {
    var now = Date.now();
    var id = ls("eesa_sid");
    var exp = parseInt(ls("eesa_sid_exp") || "0", 10);
    if (!id || now > exp) {
      id = uid();
      ls("eesa_sid", id);
    }
    ls("eesa_sid_exp", String(now + SESSION_MS));
    return id;
  }

  // ---- environment sniffing ---------------------------------------------
  var ua = navigator.userAgent;

  // iPadOS 13+ ships a DESKTOP Safari user agent — it says "Macintosh" and
  // never "iPad" — so an iPad is indistinguishable from a Mac by UA alone.
  // The one reliable difference is that no Mac reports a touch screen.
  var isIPadOS =
    /Macintosh/.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;

  function device() {
    if (/Tablet|iPad/i.test(ua) || isIPadOS) return "Tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "Mobile";
    return "Desktop";
  }
  function browser() {
    // iOS forces every browser onto WebKit, and each brands itself with its
    // own suffix: Chrome is CriOS, Firefox FxiOS, Edge EdgiOS, Opera OPiOS.
    // None of them contain "Chrome/" or "Firefox/", so without these first
    // they all fall through to the Safari check and a site's entire iPhone
    // audience is reported as Safari regardless of what it actually uses.
    if (/EdgiOS\//.test(ua) || /Edg\//.test(ua)) return "Edge";
    if (/OPiOS\//.test(ua) || /OPR\/|Opera/.test(ua)) return "Opera";
    if (/FxiOS\//.test(ua) || /Firefox\//.test(ua)) return "Firefox";
    // Samsung Internet ships "Chrome/" in its UA too, so it must be checked
    // before Chrome or it disappears into the Chrome bucket.
    if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
    if (/CriOS\//.test(ua) || /Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Other";
  }
  function os() {
    if (/Windows/.test(ua)) return "Windows";
    // iOS MUST be tested before macOS. Every iPhone and iPad user agent
    // contains the literal string "like Mac OS X", so a /Mac OS X/ test
    // matches them first and the iOS branch below can never be reached —
    // which silently files every iPhone in a site's traffic under macOS.
    if (/iPhone|iPad|iPod/.test(ua) || isIPadOS) return "iOS";
    if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
    if (/Android/.test(ua)) return "Android";
    // Android user agents also contain "Linux", so this stays last.
    if (/Linux/.test(ua)) return "Linux";
    return "Other";
  }
  function meta() {
    return {
      siteId: siteId,
      visitorId: visitorId,
      sessionId: sessionId(),
      userId: userId,
      referrer: document.referrer || "",
      device: device(),
      browser: browser(),
      os: os(),
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    };
  }

  // ---- event queue + transport ------------------------------------------
  var queue = [];
  var flushTimer = null;
  function path() {
    return location.pathname + (location.search || "");
  }
  function push(ev) {
    ev.ts = Date.now();
    ev.path = ev.path || path();
    queue.push(ev);
    if (queue.length >= 10) flush();
    else schedule();
  }
  function schedule() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 5000);
  }
  // `force` sends a meta-only batch when nothing is queued. identify() needs
  // that: a visitor who signs in and immediately closes the tab must still
  // leave the visitor→user link behind them.
  function flush(useBeacon, force) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length && !force) return;
    var payload = JSON.stringify({ meta: meta(), events: queue.splice(0) });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, payload);
      } else {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: payload,
          keepalive: true,
          mode: "cors",
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // ---- element description ----------------------------------------------
  function describe(el) {
    if (!el || el === document || el === window) return { target: "document", text: "" };
    var tag = (el.tagName || "").toLowerCase();
    var label = tag;
    if (el.id) label += "#" + el.id;
    else if (el.className && typeof el.className === "string") {
      var c = el.className.trim().split(/\s+/)[0];
      if (c) label += "." + c;
    }
    var text = (el.innerText || el.textContent || el.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    return { target: label, text: text };
  }
  function isInteractive(el) {
    while (el && el !== document.body) {
      var tag = (el.tagName || "").toLowerCase();
      if (tag === "a" || tag === "button" || tag === "input" || tag === "select" || tag === "textarea")
        return true;
      if (el.getAttribute && (el.getAttribute("role") === "button" || el.onclick)) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ---- click tracking (+ rage / dead) -----------------------------------
  var recentClicks = [];
  var domMutated = false;
  try {
    new MutationObserver(function () { domMutated = true; })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  } catch (e) {}

  document.addEventListener(
    "click",
    function (e) {
      var docH = Math.max(document.documentElement.scrollHeight, window.innerHeight, 1);
      var x = Math.min(1, Math.max(0, e.clientX / (window.innerWidth || 1)));
      var y = Math.min(1, Math.max(0, (e.pageY || e.clientY) / docH));
      var d = describe(e.target);

      push({ type: "click", x: x, y: y, target: d.target, text: d.text });

      // rage: 3+ clicks within 800ms and ~40px
      var now = Date.now();
      recentClicks.push({ t: now, x: e.clientX, y: e.clientY });
      recentClicks = recentClicks.filter(function (c) { return now - c.t < 800; });
      var near = recentClicks.filter(function (c) {
        return Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40;
      });
      if (near.length >= 3) {
        push({ type: "rageclick", x: x, y: y, target: d.target, text: d.text });
        recentClicks = [];
      }

      // dead: click on non-interactive element with no resulting DOM change / nav
      if (!isInteractive(e.target)) {
        domMutated = false;
        var startPath = path();
        setTimeout(function () {
          if (!domMutated && path() === startPath) {
            push({ type: "deadclick", x: x, y: y, target: d.target, text: d.text });
          }
        }, 500);
      }
    },
    true,
  );

  // ---- scroll depth ------------------------------------------------------
  var maxDepth = 0;
  window.addEventListener(
    "scroll",
    function () {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var d = docH > 0 ? Math.round(((window.scrollY || 0) / docH) * 100) : 100;
      if (d > maxDepth) maxDepth = Math.min(100, d);
    },
    { passive: true },
  );

  // ---- page views (incl. SPA route changes) -----------------------------
  var ended = false;
  function pageview() {
    maxDepth = 0;
    ended = false;
    push({ type: "pageview", title: document.title });
  }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(pageview, 0);
      return r;
    };
  });
  window.addEventListener("popstate", pageview);

  // ---- session recording (rrweb DOM replay) -----------------------------
  var recBuf = [];
  var recTimer = null;
  function flushRec(useBeacon) {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (!recBuf.length) return;
    var payload = JSON.stringify({
      sessionId: sessionId(),
      siteId: siteId,
      device: device(),
      path: path(),
      events: recBuf.splice(0),
    });
    try {
      if (useBeacon && navigator.sendBeacon && payload.length < 60000) {
        navigator.sendBeacon(recEndpoint, payload);
      } else {
        // keepalive caps bodies at 64KB — the DOM snapshot is bigger, so only
        // use keepalive during unload (small tail); normal flushes go without.
        fetch(recEndpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: payload,
          keepalive: !!useBeacon,
          mode: "cors",
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function scheduleRec() {
    if (recTimer) return;
    recTimer = setTimeout(flushRec, 4000);
  }
  function startRecording() {
    if (!window.rrweb || !window.rrweb.record) return;
    window.rrweb.record({
      emit: function (ev) {
        recBuf.push(ev);
        if (ev.type === 2) {
          // full DOM snapshot (large) — send immediately so replay has a base
          // even if the visit is very short
          flushRec();
        } else if (recBuf.length >= 50) {
          flushRec();
        } else {
          scheduleRec();
        }
      },
      sampling: { mousemove: 50, scroll: 120, input: "last" },
      recordCanvas: false,
      collectFonts: false,
      // Privacy-safe by default: never capture what users type (passwords,
      // PII, form input). Required before recording any authenticated app.
      // Opt out per install with data-mask="off" (not recommended).
      maskAllInputs: !(me && me.getAttribute("data-mask") === "off"),
    });
  }
  if (doRecord) {
    if (window.rrweb) startRecording();
    else {
      var sc = document.createElement("script");
      sc.src = rrwebSrc;
      sc.async = true;
      sc.onload = startRecording;
      (document.head || document.documentElement).appendChild(sc);
    }
  }

  // ---- lifecycle ---------------------------------------------------------
  function endpage(useBeacon) {
    flushRec(useBeacon);
    if (ended) return flush(useBeacon);
    ended = true;
    push({ type: "scroll", depth: maxDepth });
    push({ type: "session_end", depth: maxDepth });
    flush(useBeacon);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") endpage(true);
  });
  window.addEventListener("pagehide", function () { endpage(true); });

  // ---- identity ----------------------------------------------------------
  var MAX_UID = 128;

  // Tell us who this visitor is. Call it after YOUR login, with YOUR id — a
  // customer id, an account id, whatever you have. We treat it as an opaque
  // string and never parse it.
  //
  // Everything this device did BEFORE the call is claimed too: the server keeps
  // a visitor→user link and resolves the earlier, anonymous events through it
  // when they are read. Those events are never rewritten.
  function identify(id) {
    var next = id == null ? "" : String(id).trim().slice(0, MAX_UID);
    if (!next || next === userId) return; // nothing new to tell the server
    userId = next;
    ls("eesa_uid", next);
    flush(false, true);
  }

  // Forget them — call on logout.
  function reset() {
    if (!userId) return; // already anonymous
    flush(); // anything still queued belongs to the OUTGOING visitor
    userId = "";
    lsDel("eesa_uid");
    // Rotate the device id as well. Without this the next person on a shared
    // phone keeps browsing under a visitor id the server still maps to whoever
    // signed in last, and their session is attributed to that person.
    visitorId = uid();
    ls("eesa_vid", visitorId);
    lsDel("eesa_sid");
    lsDel("eesa_sid_exp");
  }

  // ---- public API --------------------------------------------------------
  //   eesa('add_to_cart', { item: 'Blue T-Shirt' })   a custom event
  //   eesa('identify', 'cust_1042')                   name the visitor
  //   eesa('reset')                                   forget them, on logout
  //
  // Both spellings work — eesa.identify('cust_1042') reads better, while the
  // string form is what a call queued by the loader stub replays as, before
  // this file had arrived to define any methods.
  var prevApi = window.eesa;
  window.eesa = function (name, arg) {
    var n = String(name);
    if (n === "identify") return identify(arg);
    if (n === "reset") return reset();
    push({ type: "custom", name: n, props: arg || {} });
  };
  window.eesa.identify = identify;
  window.eesa.reset = reset;
  // replay any calls queued before load: window.eesa = window.eesa || function(){(eesa.q=eesa.q||[]).push(arguments)}
  if (prevApi && prevApi.q && prevApi.q.length) {
    prevApi.q.forEach(function (args) { window.eesa.apply(null, args); });
  }

  // fire the first page view
  pageview();
})();
