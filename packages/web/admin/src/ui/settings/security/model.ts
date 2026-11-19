export interface ExemptPathRow {
  clientId: string
  path: string
}

export interface OriginRow {
  clientId: string
  url: string
}

export const MAX_EXEMPT_PATHS = 20
export const MAX_ORIGINS = 20
