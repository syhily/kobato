export interface UnsplashUserLinks {
  html?: string
}

export interface UnsplashUserProfileImage {
  small?: string
  medium?: string
}

export interface UnsplashUser {
  name?: string
  links?: UnsplashUserLinks
  profile_image?: UnsplashUserProfileImage
}

export interface UnsplashLinks {
  html?: string
  download?: string
}

export interface UnsplashUrls {
  raw?: string
  full?: string
  regular?: string
  small?: string
  thumb?: string
}

export interface UnsplashImagePayload {
  id?: string
  alt_description?: string
  description?: string
  likes?: number
  urls?: UnsplashUrls
  links?: UnsplashLinks
  user?: UnsplashUser
  width?: number
  height?: number
  [key: string]: unknown
}
