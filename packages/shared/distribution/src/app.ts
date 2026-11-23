declare global {
  const __APP_NAME__: string
  const __APP_VERSION__: string
  const __APP_DESCRIPTION__: string
  const __APP_AUTHOR_NAME__: string
  const __APP_HOMEPAGE__: string
  const __APP_REPOSITORY__: string

  interface Window {
    __APP_VERSION__?: string
  }
}

export const APP_NAME = __APP_NAME__
export const APP_VERSION = __APP_VERSION__
export const APP_DESCRIPTION = __APP_DESCRIPTION__
export const APP_AUTHOR = { name: __APP_AUTHOR_NAME__ }
export const APP_HOMEPAGE = __APP_HOMEPAGE__
export const APP_REPOSITORY = __APP_REPOSITORY__
