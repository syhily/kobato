import { createRenderContext } from '@/nodes/base/render-context'
import { appendCardCaption, CARD_CAPTION_MARKER_CLASS } from '@/nodes/base/utils/append-card-caption'

describe('appendCardCaption', function () {
  it('adds the marker class without a null prefix when the element has no class attribute', function () {
    const figure = document.createElement('figure')

    appendCardCaption(figure, 'A caption', createRenderContext({}))

    expect(figure.getAttribute('class')).toBe(CARD_CAPTION_MARKER_CLASS)
    expect(figure.getAttribute('class')).not.toContain('null')
  })

  it('appends the marker class after an existing class', function () {
    const figure = document.createElement('figure')
    figure.setAttribute('class', 'inkling-image-card')

    appendCardCaption(figure, 'A caption', createRenderContext({}))

    expect(figure.getAttribute('class')).toBe(`inkling-image-card ${CARD_CAPTION_MARKER_CLASS}`)
  })

  it('appends the sanitized caption as a figcaption', function () {
    const figure = document.createElement('figure')

    appendCardCaption(figure, 'A caption', createRenderContext({}))

    expect(figure.querySelector('figcaption')?.innerHTML).toBe('A caption')
  })
})
