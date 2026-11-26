// @vitest-environment node
import { isNavigationRequest } from '@sayaka/server/navigation-request'
import { describe, expect, it } from 'vitest'

function requestWithDest(dest: string | null): Request {
  const request = new Request('http://localhost/')
  if (dest !== null) {
    request.headers.set('sec-fetch-dest', dest)
  }
  return request
}

describe('isNavigationRequest', () => {
  it('treats a request without the Sec-Fetch-Dest header as a navigation', () => {
    expect(isNavigationRequest(requestWithDest(null))).toBe(true)
  })

  it('treats a document destination as a navigation', () => {
    expect(isNavigationRequest(requestWithDest('document'))).toBe(true)
  })

  it('treats every sub-resource destination as not a navigation', () => {
    for (const dest of [
      'image',
      'style',
      'script',
      'font',
      'empty',
      'manifest',
      'iframe',
      'worker',
      'audio',
      'video',
    ]) {
      expect(isNavigationRequest(requestWithDest(dest))).toBe(false)
    }
  })

  it('keeps unknown destinations out of the navigation set', () => {
    expect(isNavigationRequest(requestWithDest('sharedworker'))).toBe(false)
  })
})
