import { renderToHtml } from '#/_helpers/render'

import { ErrorView } from '@kobato/ui/public/chrome/ErrorView'
import { describe, expect, it } from 'vitest'

function routeError(status: number, statusText: string) {
  return {
    status,
    statusText,
    internal: false,
    data: null,
  }
}

describe('snapshot: ErrorView', () => {
  it('renders the 404 page for a route error response', () => {
    const html = renderToHtml(<ErrorView error={routeError(404, 'Not Found')} />)
    expect(html).toContain('404')
    expect(html).toContain('抱歉，没有你要找的内容')
  })

  it('renders the WordPress probe warning for the special 404 status text', () => {
    const html = renderToHtml(<ErrorView error={routeError(404, 'Not WordPress')} />)
    expect(html).toContain('这里不是 WordPress 网站')
    expect(html).toContain('This is not a WordPress site')
  })

  it('renders the generic 500 page for a non-route error', () => {
    const html = renderToHtml(<ErrorView error={new Error('boom')} />)
    expect(html).toContain('500')
    expect(html).toContain('内部错误')
    expect(html).not.toContain('boom')
  })

  it('shows the error message in development mode', () => {
    const html = renderToHtml(<ErrorView error={new Error('dev only message')} isDev />)
    expect(html).toContain('500')
    expect(html).toContain('dev only message')
  })
})
