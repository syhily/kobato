export function Equalizer({ color = 'var(--brand)' }: { color?: string }) {
  return (
    <div className="flex items-end gap-0.5" style={{ color }}>
      <div className="h-3 w-0.5 animate-equalizer rounded-sm" />
      <div className="h-2 w-0.5 animate-equalizer-delay-1 rounded-sm" />
      <div className="h-4 w-0.5 animate-equalizer-delay-2 rounded-sm" />
    </div>
  )
}
