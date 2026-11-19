export interface ResolvedFont {
  family: string
  href: string
}

export interface ResolvedFonts {
  global: ResolvedFont[]
  post: ResolvedFont[]
  code: ResolvedFont[]
}
