export function isNavigationRequest(request: Request): boolean {
  const dest = request.headers.get('sec-fetch-dest')
  return dest === null || dest === 'document'
}
