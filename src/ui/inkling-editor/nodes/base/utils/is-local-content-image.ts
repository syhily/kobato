export const isLocalContentImage = function (url: string, siteUrl = '') {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '')
  const imagePath = url.replace(normalizedSiteUrl, '')
  return /^(\/.*|__INKLING_URL__)\/?content\/images\//.test(imagePath)
}
