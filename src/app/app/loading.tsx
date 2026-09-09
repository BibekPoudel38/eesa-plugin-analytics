/**
 * What you see while a page is being built.
 *
 * Every page here is rendered on the server on each request, and a few take a
 * second or two. Without this the browser simply kept showing the previous
 * page for that whole time — the click looked ignored, and clicking again was
 * the reasonable thing to do. React swaps this in the instant you navigate, so
 * the wait is visible and obviously a wait.
 */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="space-y-2">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-56" />
        <Bar className="h-3 w-80" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
            <Bar className="h-2.5 w-16" />
            <Bar className="h-7 w-24" />
            <Bar className="h-2.5 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-8">
          <Bar className="h-4 w-40" />
          <Bar className="h-[210px] w-full" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5 lg:col-span-4">
          <Bar className="h-4 w-28" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Bar key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
