/** Faithful copy of Koenig's Tooltip.jsx */
export function Tooltip({ label, shortcutKeys }: { label: string; shortcutKeys?: string[] }) {
  return (
    <div
      className={`text-2xs invisible absolute -top-8 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-md bg-black py-1 font-sans font-medium whitespace-nowrap text-white group-hover:visible dark:bg-grey-900 ${shortcutKeys ? 'pr-1 pl-[1rem]' : 'px-[1rem]'}`}
    >
      <span>{label}</span>
      {shortcutKeys &&
        shortcutKeys.map((k) => (
          <div key={k} className="text-2xs rounded bg-grey-900 px-2 text-white dark:bg-grey-950">
            {k}
          </div>
        ))}
    </div>
  )
}
