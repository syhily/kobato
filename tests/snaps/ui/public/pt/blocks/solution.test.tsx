import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Solution, UnstyledSolution } from '@/ui/pt/blocks/Solution'

describe('snapshot: Solution', () => {
  it('renders the styled solution block', () => {
    const html = renderToHtml(
      <Solution>
        <p>Proof goes here.</p>
      </Solution>,
    )
    expect(html).toContain('solution')
    expect(html).toContain('解：')
    expect(html).toContain('Proof goes here.')
  })

  it('renders the unstyled solution block', () => {
    const html = renderToHtml(
      <UnstyledSolution>
        <p>Plain proof.</p>
      </UnstyledSolution>,
    )
    expect(html).toContain('<blockquote')
    expect(html).toContain('Plain proof.')
    expect(html).not.toContain('解：')
  })
})
