import { escapeRegExp } from '@/utils'

export function HighlightedString({
  string,
  highlightString,
  shouldHighlight = true,
}: {
  string: string
  highlightString?: string
  shouldHighlight?: boolean
}) {
  if (!highlightString || shouldHighlight === false) {
    return string
  }

  const parts = string.split(new RegExp(`(${escapeRegExp(highlightString)})`, 'gi'))
  // precompute the running offset for stable keys in render scope — the map
  // callback below must not mutate a counter while rendering
  const keyedParts: Array<{ part: string; key: string }> = []
  let charOffset = 0
  for (const part of parts) {
    keyedParts.push({ part, key: `part-${charOffset}` })
    charOffset += part.length
  }

  return (
    <>
      {keyedParts.map(({ part, key }) => {
        if (part.toLowerCase() === highlightString.toLowerCase()) {
          return (
            <span key={key} className="font-bold">
              {part}
            </span>
          )
        }

        return <span key={key}>{part}</span>
      })}
    </>
  )
}
