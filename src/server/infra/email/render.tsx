import type { CSSProperties, ReactElement, ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'

type StyledProps = { style?: CSSProperties; children?: ReactNode }

export function render(element: ReactElement): string {
  return `<!DOCTYPE html>${renderToStaticMarkup(element)}`
}

export function Html({ lang = 'en', children }: { lang?: string; children?: ReactNode }) {
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
      </head>
      {children}
    </html>
  )
}

export function Body({ style, children }: StyledProps) {
  return <body style={style}>{children}</body>
}

export function Container({ style, children }: StyledProps) {
  return <div style={{ maxWidth: 600, margin: '0 auto', ...style }}>{children}</div>
}

export function Section({ style, children }: StyledProps) {
  return <div style={{ width: '100%', ...style }}>{children}</div>
}

export function Text({ style, children }: StyledProps) {
  return <p style={{ fontSize: 14, lineHeight: 1.5, margin: '16px 0', ...style }}>{children}</p>
}

type LinkProps = {
  href: string
  target?: string
  rel?: string
  style?: CSSProperties
  children?: ReactNode
}
export function Link({ href, target, rel, style, children }: LinkProps) {
  return (
    <a href={href} target={target} rel={rel} style={style}>
      {children}
    </a>
  )
}

type ImgProps = {
  src: string
  alt?: string
  style?: CSSProperties
  width?: number
  height?: number
}
export function Img({ src, alt = '', style, width, height }: ImgProps) {
  return <img src={src} alt={alt} style={style} width={width} height={height} />
}
