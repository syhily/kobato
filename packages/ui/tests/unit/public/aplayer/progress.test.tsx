import { ProgressBar } from '@kobato/ui/public/aplayer/progress'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('ui/public/aplayer/progress', () => {
  it('renders progress bar structure', () => {
    const html = renderToStaticMarkup(
      <ProgressBar themeColor="#008c95" playedPercentage={0.3} bufferedPercentage={0.6} />,
    )
    expect(html).toContain('aplayer-bar-wrap')
    expect(html).toContain('aplayer-bar')
    expect(html).toContain('aplayer-played')
    expect(html).toContain('aplayer-loaded')
    expect(html).toContain('aplayer-thumb')
  })

  it('sets played width from percentage', () => {
    const html = renderToStaticMarkup(<ProgressBar themeColor="#008c95" playedPercentage={0.25} />)
    expect(html).toContain('width:25%')
    expect(html).toContain('background-color:#008c95')
  })

  it('sets buffered width from percentage', () => {
    const html = renderToStaticMarkup(
      <ProgressBar themeColor="#008c95" playedPercentage={0} bufferedPercentage={0.75} />,
    )
    expect(html).toContain('width:75%')
  })

  it('omits loaded bar when bufferedPercentage is undefined', () => {
    const html = renderToStaticMarkup(<ProgressBar themeColor="#008c95" playedPercentage={0.5} />)
    expect(html).not.toContain('aplayer-loaded')
  })

  it('hides loading icon by default', () => {
    const html = renderToStaticMarkup(<ProgressBar themeColor="#008c95" playedPercentage={0.5} />)
    expect(html).toContain('aplayer-loading-icon')
    expect(html).toContain('hidden')
  })
})
