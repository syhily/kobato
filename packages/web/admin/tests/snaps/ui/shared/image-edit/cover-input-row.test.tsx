import { renderToHtml, stableHtml } from '@kobato/web-admin/tests/utils/render.tsx'
import { CoverInputRow } from '@kobato/web-admin/ui/shared/image-edit/CoverInputRow.tsx'
import { afterAll, describe, expect, it, vi } from 'vitest'

const mod_UploadImageDialog = await import('@kobato/web-admin/ui/shared/image-edit/UploadImageDialog.tsx')
vi.spyOn(mod_UploadImageDialog, 'UploadImageDialog').mockImplementation((() => null) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

describe('CoverInputRow — upload gating', () => {
  it('keeps the upload trigger enabled whenever a kind is supplied (no S3 toggle)', () => {
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
