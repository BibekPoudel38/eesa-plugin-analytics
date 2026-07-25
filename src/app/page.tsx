import { redirect } from "next/navigation";

// The embedded dashboard lives under /app; the root just forwards there. The
// public plugin surfaces (/eesa-analytics.js, /api/collect, /api/rec, /health, /manifest,
// /mcp, /me) all live at the root and are unaffected by this page.
export default function RootPage() {
  redirect("/app");
}
