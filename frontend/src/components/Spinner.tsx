export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <output className="flex items-center gap-3 py-6 text-text-muted">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary"
      />
      <span>{label}</span>
    </output>
  )
}
