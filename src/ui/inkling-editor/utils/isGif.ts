export function isGif(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    return /\.(gif)$/i.test(pathname)
  } catch {
    return /\.(gif)$/i.test(url)
  }
}
