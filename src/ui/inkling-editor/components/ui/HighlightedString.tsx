import escapeRegExp from 'lodash/escapeRegExp'

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
  let charOffset = 0

  return (
    <>
      {parts.map((part: string) => {
        const key = `part-${charOffset}`
        charOffset += part.length

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
