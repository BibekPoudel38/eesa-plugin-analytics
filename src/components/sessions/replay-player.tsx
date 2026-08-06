"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Film, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Meta = { device: string; page: string; firstTs: number; lastTs: number };
type Status = "loading" | "ready" | "empty" | "error";

function ensureRrweb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).rrweb) return resolve();
    if (!document.getElementById("rrweb-css")) {
      const l = document.createElement("link");
      l.id = "rrweb-css";
      l.rel = "stylesheet";
      l.href = "/rrweb.min.css";
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = "/rrweb.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("rrweb failed to load"));
    document.head.appendChild(s);
  });
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

const SPEEDS = [1, 2, 4, 8];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

// `siteId` is required, not optional: /api/rec/[id] is now tenant+site scoped
// (it used to be unauthenticated), so a request without it is a 400 and the
// player would show "Couldn't load the replay engine" with no clue why.
export function ReplayPlayer({ id, siteId }: { id: string; siteId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  // zoom as a multiplier of the auto-fit scale (1 = fit-to-frame)
  const zoomRef = useRef(1);

  const [status, setStatus] = useState<Status>("loading");
  const [playing, setPlaying] = useState(false);
  const [total, setTotal] = useState(0);
  const [cur, setCur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState(true);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pct, setPct] = useState(100); // displayed effective scale %
  const [isFs, setIsFs] = useState(false);

  const applyScale = useCallback(() => {
    const root = stageRef.current;
    if (!root) return;
    const wrapper = root.querySelector<HTMLElement>(".replayer-wrapper");
    if (!wrapper) return;
    const w = parseInt(wrapper.style.width) || 1024;
    const h = parseInt(wrapper.style.height) || 640;
    const cw = root.clientWidth;
    const ch = root.clientHeight;
    if (!cw || !ch) return;
    // fit-to-contain, then apply the user's zoom multiplier
    const fit = Math.min(cw / w, ch / h) || 1;
    const scale = fit * zoomRef.current;
    const tx = Math.max(0, (cw - w * scale) / 2);
    const ty = Math.max(0, (ch - h * scale) / 2);
    wrapper.style.transformOrigin = "top left";
    wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    // let the user pan when they've zoomed past the frame
    root.style.overflow = w * scale > cw || h * scale > ch ? "auto" : "hidden";
    setPct(Math.round(scale * 100));
  }, []);

  const setZoomValue = useCallback(
    (v: number) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
      zoomRef.current = next;
      setZoom(next);
      applyScale();
    },
    [applyScale],
  );

  const tick = useCallback(() => {
    const r = replayerRef.current;
    if (r) setCur(r.getCurrentTime());
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureRrweb();
        const res = await fetch(
          `/api/rec/${encodeURIComponent(id)}?site=${encodeURIComponent(siteId)}`,
          { cache: "no-store" },
        );
        if (res.status === 404) return !cancelled && setStatus("empty");
        const data = await res.json();
        if (cancelled) return;
        if (!data.events || data.events.length < 2) return setStatus("empty");
        setMeta({ device: data.device, page: data.page, firstTs: data.firstTs, lastTs: data.lastTs });

        const replayer = new (window as any).rrweb.Replayer(data.events, {
          root: stageRef.current,
          speed: 1,
          skipInactive: true,
          showController: false,
          mouseTail: { lineWidth: 2, strokeStyle: "#ef5330" },
        });
        replayerRef.current = replayer;
        setTotal(replayer.getMetaData().totalTime);
        replayer.on("finish", () => setPlaying(false));
        // the recorded page can change viewport mid-session — re-fit when it does
        replayer.on("resize", () => applyScale());

        // give the iframe a beat to lay out, then scale + autoplay
        setTimeout(() => {
          if (cancelled) return;
          applyScale();
          setStatus("ready");
          replayer.play();
          setPlaying(true);
          rafRef.current = requestAnimationFrame(tick);
        }, 250);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try {
        replayerRef.current?.pause();
        replayerRef.current?.destroy?.();
      } catch {}
    };
  }, [id, siteId, applyScale, tick]);

  // recompute on container resize (covers window resize + fullscreen relayout)
  useEffect(() => {
    const root = stageRef.current;
    if (!root || typeof ResizeObserver === "undefined") {
      const onResize = () => applyScale();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(root);
    return () => ro.disconnect();
  }, [applyScale]);

  // track fullscreen state
  useEffect(() => {
    const onFs = () => {
      setIsFs(document.fullscreenElement === containerRef.current);
      requestAnimationFrame(() => applyScale());
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [applyScale]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* fullscreen may be blocked; ignore */
    }
  };

  const togglePlay = () => {
    const r = replayerRef.current;
    if (!r) return;
    if (playing) {
      r.pause();
      setPlaying(false);
    } else {
      r.play(cur >= total ? 0 : cur);
      setPlaying(true);
    }
  };

  const seek = (v: number) => {
    const r = replayerRef.current;
    if (!r) return;
    setCur(v);
    if (playing) r.play(v);
    else r.pause(v);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    replayerRef.current?.setConfig({ speed: s });
  };

  const toggleSkip = () => {
    const next = !skip;
    setSkip(next);
    replayerRef.current?.setConfig({ skipInactive: next });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        isFs && "flex h-screen w-screen flex-col rounded-none border-0",
      )}
    >
      {/* stage — fixed viewport-like frame; the recording is scaled to fit inside */}
      <div
        className={cn(
          "relative overflow-hidden bg-[repeating-conic-gradient(var(--muted)_0deg_90deg,transparent_90deg_180deg)] [background-size:16px_16px]",
          isFs ? "flex-1" : "h-[clamp(320px,58vh,560px)]",
        )}
      >
        <div ref={stageRef} className="absolute inset-0 overflow-hidden" />
        {status !== "ready" && (
          <div className="absolute inset-0 grid place-items-center bg-card/80 text-center">
            {status === "loading" && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Film className="size-6 animate-pulse" />
                <span className="text-sm">Loading recording…</span>
              </div>
            )}
            {status === "empty" && (
              <div className="max-w-sm space-y-1 px-6">
                <p className="font-medium text-foreground">No recording for this session</p>
                <p className="text-sm text-muted-foreground">
                  Replays are captured live by eesa-analytics.js. Demo sessions and very
                  short visits don&apos;t have one.
                </p>
              </div>
            )}
            {status === "error" && (
              <p className="px-6 text-sm text-destructive">
                Couldn&apos;t load the replay engine.
              </p>
            )}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-3">
        <button
          onClick={togglePlay}
          disabled={status !== "ready"}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-ember text-primary-foreground transition-transform hover:scale-105 disabled:opacity-40"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
        </button>

        <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
          {fmt(cur)}
        </span>

        <input
          type="range"
          min={0}
          max={total || 1}
          value={Math.min(cur, total)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={status !== "ready"}
          className="h-1.5 min-w-[120px] flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[var(--ember)]"
          style={{
            background: total
              ? `linear-gradient(to right, var(--ember) ${(Math.min(cur, total) / total) * 100}%, var(--muted) 0)`
              : undefined,
          }}
        />

        <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
          {fmt(total)}
        </span>

        {/* speed */}
        <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-border">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={cn(
                "px-2 py-1 font-mono text-xs transition-colors",
                speed === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}×
            </button>
          ))}
        </div>

        <button
          onClick={toggleSkip}
          className={cn(
            "shrink-0 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition-colors",
            skip
              ? "border-[var(--pine)]/30 bg-[var(--pine)]/10 text-[var(--pine)]"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          title="Skip inactivity"
        >
          skip idle
        </button>

        {/* zoom */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-1.5 py-1">
          <button
            onClick={() => setZoomValue(zoom - 0.25)}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoomValue(Number(e.target.value))}
            className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-muted accent-[var(--ember)]"
            aria-label="Zoom"
          />
          <button
            onClick={() => setZoomValue(zoom + 0.25)}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            onClick={() => setZoomValue(1)}
            className="tabular ml-0.5 w-9 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[0.68rem] text-muted-foreground hover:text-foreground"
            title="Reset to fit"
          >
            {pct}%
          </button>
        </div>

        {/* fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
          title={isFs ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>

        {meta && !isFs && (
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground xl:inline">
            {meta.device} · {meta.page}
          </span>
        )}
      </div>
    </div>
  );
}
