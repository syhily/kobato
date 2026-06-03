import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Volume } from '@/ui/public/aplayer/volume'

describe('ui/public/aplayer/volume', () => {
  it('renders volume control structure', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={0.5}
        muted={false}
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-volume-wrap')
    expect(html).toContain('aplayer-volume-bar-wrap')
    expect(html).toContain('aplayer-volume-bar')
    expect(html).toContain('aplayer-volume')
  })

  it('renders volume-off icon when muted', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={0.5}
        muted
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-icon-volume-down')
  })

  it('renders volume-up icon when volume >= 1', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={1}
        muted={false}
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-icon-volume-down')
  })

  it('renders volume-down icon when volume between 0 and 1', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={0.5}
        muted={false}
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-icon-volume-down')
  })

  it('sets volume height from percentage', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={0.5}
        muted={false}
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('height:50%')
  })

  it('sets volume height to 0 when muted', () => {
    const html = renderToStaticMarkup(
      <Volume
        themeColor="#008c95"
        volume={0.8}
        muted
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('height:0')
  })
})
