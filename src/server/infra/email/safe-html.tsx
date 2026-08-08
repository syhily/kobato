/**
 * Email HTML injection wrapper so templates never call `dangerouslySetInnerHTML`.
 * Pass only sanitised HTML (e.g. from `commentBodyToHtml`) — this component
 * does not sanitise.
 */
export function RawEmailHtml({
  html,
  tag = 'div',
  style,
}: {
  html: string
  tag?: 'div' | 'span'
  style?: React.CSSProperties
}) {
  const Tag = tag
  return <Tag style={style} data-safe-html-strategy="email" dangerouslySetInnerHTML={{ __html: html }} />
}
