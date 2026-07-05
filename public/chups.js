/*!
 * chups.js — lightweight product-analytics tracker for Chups Analytics.
 * Captures page views, clicks (with position), rage/dead clicks, scroll depth,
 * sessions and custom events, then batches them to the Chups ingest endpoint.
 *
 * Install:
 *   <script src="https://YOUR-CHUPS-HOST/chups.js" data-site="mom2mom" defer></script>
 * Custom events:
 *   chups('add_to_cart', { meal: 'Biryani', price: 12 })
 */
(function () {
  "use strict";
  if (window.__chupsLoaded) return;
  window.__chupsLoaded = true;

  // ---- resolve config from our own <script> tag --------------------------
  var me =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      for (var i = s.length - 1; i >= 0; i--) {
        if (s[i].src && s[i].src.indexOf("chups.js") > -1) return s[i];
      }
      return null;
    })();
  var cfg = window.ChupsConfig || {};
  var siteId = (me && me.getAttribute("data-site")) || cfg.site || "default";
  var endpoint =
    (me && me.getAttribute("data-endpoint")) ||
    cfg.endpoint ||
    (me ? new URL(me.src).origin + "/api/collect" : "/api/collect");

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
  var visitorId = ls("chups_vid") || (function () { var v = uid(); ls("chups_vid", v); return v; })();
  function sessionId() {
    var now = Date.now();
    var id = ls("chups_sid");
    var exp = parseInt(ls("chups_sid_exp") || "0", 10);
    if (!id || now > exp) {
      id = uid();
      ls("chups_sid", id);
    }
    ls("chups_sid_exp", String(now + SESSION_MS));
    return id;
  }

  // ---- environment sniffing ---------------------------------------------
  var ua = navigator.userAgent;
  function device() {
    if (/Tablet|iPad/i.test(ua)) return "Tablet";
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "Mobile";
    return "Desktop";
  }
  function browser() {
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\/|Opera/.test(ua)) return "Opera";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Safari\//.test(ua)) return "Safari";
    return "Other";
  }
  function os() {
    if (/Windows/.test(ua)) return "Windows";
    if (/Mac OS X/.test(ua)) return "macOS";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    if (/Linux/.test(ua)) return "Linux";
    return "Other";
  }
  function meta() {
    return {
      siteId: siteId,
      visitorId: visitorId,
      sessionId: sessionId(),
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
  function flush(useBeacon) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
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

  // ---- lifecycle ---------------------------------------------------------
  function endpage(useBeacon) {
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

  // ---- public API: chups('event_name', { props }) -----------------------
  var prevApi = window.chups;
  window.chups = function (name, props) {
    push({ type: "custom", name: String(name), props: props || {} });
  };
  // replay any calls queued before load: window.chups = window.chups || function(){(chups.q=chups.q||[]).push(arguments)}
  if (prevApi && prevApi.q && prevApi.q.length) {
    prevApi.q.forEach(function (args) { window.chups.apply(null, args); });
  }

  // fire the first page view
  pageview();
})();
