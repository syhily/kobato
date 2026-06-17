import { describe, expect, it } from 'vitest'

import { renderInRouter, stableHtml } from '#/_helpers/render'
import UsersRoute from '@/routes/admin/security/users/index'

describe('snapshot: routes/admin/security/users/index', () => {
  it('renders the users index route', () => {
    const html = stableHtml(renderInRouter(<UsersRoute />, '/admin/security/users'))
    expect(html.length).toBeGreaterThan(0)
  })
})
