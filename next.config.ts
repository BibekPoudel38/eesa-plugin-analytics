import type { NextConfig } from "next";

// Which Eesa origins may embed the dashboard in an iframe (the "app section").
// Overridable per-env; defaults cover the production shell + apex.
const FRAME_ANCESTORS =
  process.env.EESA_FRAME_ANCESTORS || "https://app.eesa.ai https://eesa.ai";

const nextConfig: NextConfig = {
  // Self-contained server bundle for a small Docker image (Coolify deploy).
  output: "standalone",
  // node-postgres has native/dynamic requires the bundler can't trace — resolve
  // it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      // The embedded dashboard + its assets must be framable by the Eesa shell.
      // `frame-ancestors` (CSP) is the modern control; we deliberately do NOT
      // send X-Frame-Options here. Scoped to /app so the public tracker/ingest
      // routes keep default (unframed) behaviour.
      {
        source: "/app/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS};` },
        ],
      },
      {
        source: "/app",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS};` },
        ],
      },
    ];
  },
};

export default nextConfig;
