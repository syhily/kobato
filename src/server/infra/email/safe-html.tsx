/**
 * Server-side HTML injection helper for email templates.
 *
 * All HTML passed here is produced by `commentBodyToHtml`, which escapes
 * every text node and attribute. This wrapper exists so email templates
 * never call `dangerouslySetInnerHTML` directly.
 *
 * The name `RawEmailHtml` (not `SafeEmailHtml`) is intentional: the
 * safety guarantee comes from the CALLER sanitising input, not from this
 * component. If you pass unsanitised HTML here, XSS will reach the
 * recipient.
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
