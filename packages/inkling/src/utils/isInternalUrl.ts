// "Own URL" checks come in an input/export pair: `isInternalUrl` decides
// whether a link points at our own site (at-link labeling); the export-side
// counterpart is `isLocalContentImage`
// (`@/nodes/base/utils/content-image-url`, behind the render context),
// which recognizes our own content images in exported markup.
export function isInternalUrl(url: string, siteUrl?: string): boolean {
  if (!url || !siteUrl) {
    return false
  }

  try {
    const urlObj = new URL(url)
    const subdir = `/${new URL(siteUrl).pathname.split('/')[1]}`
    return urlObj.hostname === new URL(siteUrl).hostname && urlObj.pathname.startsWith(subdir)
  } catch {
    return false
  }
}
