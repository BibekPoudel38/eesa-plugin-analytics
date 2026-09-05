/**
 * What this plugin tried to do, reported to Eesa.
 *
 * Every other Eesa plugin is an Express server and logs its own requests with a
 * shared middleware. This one is a Next.js app, and the equivalent hook is not
 * the same shape — `proxy.ts` (which is what `middleware.ts` became in Next 16)
 * is explicitly documented as something that may be deployed to a CDN edge and
 * must not rely on shared modules or globals, so the batched buffer the other
 * plugins use cannot live there.
 *
 * `onRequestError` runs in the Node runtime, is awaited, and fires on exactly
 * the thing worth knowing: a request that failed. That is the whole reason this
 * exists — the analytics plugin could throw on every page load and the only
 * evidence anywhere would be a container log nobody reads.
 *
 * Silent without PLUGIN_GATEWAY_SECRET, so a fork or a local run reports
 * nothing to anyone.
 */
import type { Instrumentation } from 'next';

const API_BASE = (process.env.EESA_API_BASE || 'https://eesa.ai/api/v1').replace(/\/+$/, '');
const SECRET = process.env.PLUGIN_GATEWAY_SECRET || '';
const PLUGIN = process.env.PLUGIN_NAME || 'analytics';
const VERSION = process.env.RAILWAY_GIT_COMMIT_SHA
  ? String(process.env.RAILWAY_GIT_COMMIT_SHA).slice(0, 12)
  : '';

export function register() {
  // Nothing to start. The hook below is the whole integration, and a `register`
  // that opened a timer would keep a serverless instance alive for a log.
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (!SECRET) return;
  try {
    const error = err as { message?: string; name?: string; digest?: string };
    await fetch(`${API_BASE}/telemetry/plugin-requests/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Eesa-Gateway-Secret': SECRET },
      body: JSON.stringify({
        requests: [{
          plugin: PLUGIN,
          plugin_version: VERSION,
          // The route pattern, not the path: the same page with a different id
          // in it must group, or a thousand rows answer nothing.
          route: String(context?.routePath || request?.path || '').slice(0, 255),
          method: String(request?.method || 'GET').slice(0, 8),
          status: 500,
          duration_ms: 0,
          // Ties this to the backend request and the click that caused it.
          trace_id: String(
            (request?.headers as Record<string, string> | undefined)?.['x-eesa-trace'] || '',
          ).slice(0, 64),
          // Split, because the server groups by class and shows the message:
          // one field holding both would make every error its own signature.
          error_class: String(error?.name || 'Error').slice(0, 128),
          error_message: String(error?.message || '').slice(0, 2000),
        }],
      }),
    });
  } catch {
    // A monitoring failure must never become a second error on a failing
    // request. There is nowhere better to report this to, by definition.
  }
};
