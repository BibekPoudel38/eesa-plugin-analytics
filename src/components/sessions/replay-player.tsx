"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Film } from "lucide-react";
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

export function ReplayPlayer({ id }: { id: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  const [status, setStatus] = useState<Status>("loading");
  const [playing, setPlaying] = useState(false);
  const [total, setTotal] = useState(0);
  const [cur, setCur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState(true);
  const [meta, setMeta] = useState<Meta | null>(null);

  const scaleStage = useCallback(() => {
    const root = stageRef.current;
    if (!root) return;
    const wrapper = root.querySelector<HTMLElement>(".replayer-wrapper");
    if (!wrapper) return;
    const w = parseInt(wrapper.style.width) || 1024;
    const h = parseInt(wrapper.style.height) || 640;
    const scale = Math.min(1.4, root.clientWidth / w);
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = "top left";
    root.style.height = `${h * scale}px`;
  }, []);

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
        const res = await fetch(`/api/rec/${id}`, { cache: "no-store" });
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

        // give the iframe a beat to lay out, then scale + autoplay
        setTimeout(() => {
          if (cancelled) return;
          scaleStage();
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
  }, [id, scaleStage, tick]);

  useEffect(() => {
    const onResize = () => scaleStage();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scaleStage]);

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
    const r = replayerRef.current;
    if (!r) return;
    r.setConfig({ speed: s });
  };

  const toggleSkip = () => {
    const next = !skip;
    setSkip(next);
    replayerRef.current?.setConfig({ skipInactive: next });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* stage */}
      <div className="relative bg-[repeating-conic-gradient(var(--muted)_0deg_90deg,transparent_90deg_180deg)] [background-size:16px_16px]">
        <div ref={stageRef} className="relative w-full overflow-hidden" style={{ minHeight: 320 }} />
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
                  Replays are captured live by chups.js. Demo sessions and very
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
      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
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
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[var(--ember)]"
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

        {meta && (
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground lg:inline">
            {meta.device} · {meta.page}
          </span>
        )}
      </div>
    </div>
  );
}
