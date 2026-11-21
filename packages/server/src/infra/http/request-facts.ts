export interface RequestFacts {
  analyticsEventId: string
  path: string
  isDataRequest: boolean
  userAgent: string | null
  referer: string | null
  acceptLanguage: string | null
  purpose: string | null
  cookie: string | null
  clientHints: {
    model: string | null
    platform: string | null
    platformVersion: string | null
    mobile: string | null
    brands: string | null
    fullVersion: string | null
    arch: string | null
    bitness: string | null
    formFactors: string | null
  } | null
}
