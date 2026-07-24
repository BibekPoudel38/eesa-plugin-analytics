"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Eesa embed handshake. Mounted once in the /app layout.
 *
 * When framed by the Eesa shell it posts `eesa:plugin-ready`, waits for the
 * `eesa:session` reply carrying the short-lived UI token, POSTs that token to
 * /api/session/set (which stores it as the partitioned session cookie), then
 * refreshes so the now-authenticated server components render.
 *
 * Standalone (not in a frame): if ALLOW_DEV_AUTH is on the app already works via
 * the dev tenant, so this quietly no-ops.
 */
export function SessionBridge({ authed }: { authed: boolean }) {
  const router = useRouter();
  const [applied, setApplied] = useState(authed);

  useEffect(() => {
    if (applied) return;

    let done = false;
    async function apply(token: string, theme?: string) {
      if (done) return;
      done = true;
      if (theme) {
        document.documentElement.dataset.theme = theme;
      }
      try {
        const res = await fetch("/api/session/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          setApplied(true);
          router.refresh();
        }
      } catch {
        /* the shell will resend on its next tick */
      }
    }

    function onMessage(ev: MessageEvent) {
      const msg = ev.data;
      if (msg && msg.type === "eesa:session" && typeof msg.token === "string") {
        apply(msg.token, typeof msg.theme === "string" ? msg.theme : undefined);
      }
    }

    window.addEventListener("message", onMessage);
    // Announce readiness to the parent shell (if embedded).
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "eesa:plugin-ready", plugin: "analytics" }, "*");
    }
    return () => window.removeEventListener("message", onMessage);
  }, [applied, router]);

  return null;
}
