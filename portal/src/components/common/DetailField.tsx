/** Label-over-value pair used in the detail pages' summary grids. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      {/* Wraps rather than truncates: on a phone the grid drops to one column
          and an ellipsis would swallow half of an address or an email. */}
      <dd className="mt-1 font-medium break-words text-foreground">{value}</dd>
    </div>
  );
}

/** Boxed read-only value, matching the design's field-like table cells. */
export function ValueChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="tnum inline-flex min-w-[4.5rem] items-center justify-start rounded-lg border border-border px-3 py-2 whitespace-nowrap text-foreground">
      {children}
    </span>
  );
}
