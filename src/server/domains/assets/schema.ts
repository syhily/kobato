export interface SvgRoute {
  kind: 'svg'
  slot: string
}

export interface BinaryRoute {
  kind: 'binary'
  slot: string
}

export type AssetRoute = SvgRoute | BinaryRoute

export interface ResolvedAsset {
  content: Buffer
  contentType: string
  etag: string
}
