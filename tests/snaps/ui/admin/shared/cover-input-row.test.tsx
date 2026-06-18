import { describe, expect, it, vi } from 'vitest'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { CoverInputRow } from '@/ui/admin/shared/CoverInputRow'

// CoverInputRow renders a real upload dialog when a `kind` is present; stub
// it so SSR stays deterministic and offline.
vi.mock('@/ui/admin/shared/UploadImageDialog', () => ({
  UploadImageDialog: () => null,
}))

describe('CoverInputRow — upload gating', () => {
  it('keeps the upload trigger enabled whenever a kind is supplied (no S3 toggle)', () => {
    // The old `assets.storage.enabled` gate is gone — uploads always go to
    // the active backend, so a populated kind is the only precondition.
    const html = stableHtml(
      renderToHtml(
        <CoverInputRow
          label="封面"
          htmlFor="cover"
          value=""
          onChange={() => {}}
          uploadKind={{ kind: 'category', slug: 'my-slug' }}
        />,
      ),
    )
    expect(html).toContain('点击上传')
    // No stale S3-disabled hint leaks into the UI.
    expect(html).not.toContain('S3 上传未开启')
    expect(html).not.toContain('请到 /admin/settings/assets 启用')
  })

  it('disables the upload trigger only when no kind is supplied', () => {
    const html = stableHtml(
      renderToHtml(<CoverInputRow label="封面" htmlFor="cover" value="" onChange={() => {}} uploadKind={null} />),
    )
    expect(html).toContain('请先填写 slug / host 后再上传')
    expect(html).toContain('disabled')
  })
})
