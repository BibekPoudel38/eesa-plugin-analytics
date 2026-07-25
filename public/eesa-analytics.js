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
  var visitorId = ls("eesa_vid") || (function () { var v = uid(); ls("eesa_vid", v); return v; })();
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

  // ---- public API: eesa('event_name', { props }) -----------------------
  var prevApi = window.eesa;
  window.eesa = function (name, props) {
    push({ type: "custom", name: String(name), props: props || {} });
  };
  // replay any calls queued before load: window.eesa = window.eesa || function(){(eesa.q=eesa.q||[]).push(arguments)}
  if (prevApi && prevApi.q && prevApi.q.length) {
    prevApi.q.forEach(function (args) { window.eesa.apply(null, args); });
  }

  // fire the first page view
  pageview();
})();
