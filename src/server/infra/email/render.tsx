import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'

type StyledProps = { style?: CSSProperties; className?: string; children?: ReactNode }

export function render(element: ReactElement): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`
}

export function Html({ lang = 'en', children }: { lang?: string; children?: ReactNode }) {
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="x-apple-disable-message-reformatting" />
        <meta name="color-scheme" content="light dark" />
        <style>{darkModeStyles}</style>
      </head>
      {children}
    </html>
  )
}

const darkModeStyles = `
@media (prefers-color-scheme: dark) {
  .dark-bg { background-color: #0f172a !important; }
  .dark-text-primary { color: #e2e8f0 !important; }
  .dark-text-secondary { color: #94a3b8 !important; }
  .dark-text-muted { color: #64748b !important; }
  .dark-card { background-color: #1e293b !important; }
  .dark-card-alt { background-color: #334155 !important; }
  .dark-border { border-color: #334155 !important; }
  .dark-cta { background-color: #2dd4bf !important; color: #0f172a !important; }
  .dark-cta-text { color: #2dd4bf !important; }
}
`.trim()

export function Body({ style, className, children }: StyledProps) {
  return (
    <body style={style} className={className}>
      {children}
    </body>
  )
}

export function Container({ style, className, children }: StyledProps) {
  return (
    <div style={{ maxWidth: 540, margin: '0 auto', ...style }} className={className}>
      {children}
    </div>
  )
}

export function Section({ style, className, children }: StyledProps) {
  return (
    <div style={{ width: '100%', ...style }} className={className}>
      {children}
    </div>
  )
}

export function Text({ style, className, children }: StyledProps) {
  return (
    <p style={{ fontSize: 16, lineHeight: 1.5, margin: '16px 0', ...style }} className={className}>
      {children}
    </p>
  )
}

type LinkProps = {
  href: string
  target?: string
  rel?: string
  style?: CSSProperties
  className?: string
  children?: ReactNode
}
export function Link({ href, target, rel, style, className, children }: LinkProps) {
  return (
    <a href={href} target={target} rel={rel} style={style} className={className}>
      {children}
    </a>
  )
}

export function Hr({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <hr
      style={{
        borderWidth: 0,
        height: 0,
        marginTop: 34,
        marginBottom: 34,
        borderBottomWidth: 1,
        borderBottomStyle: 'solid',
        borderBottomColor: '#EEF5F8',
        ...style,
      }}
      className={className}
    />
  )
}
