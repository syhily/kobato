import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'
import type { EditorToolbarState } from '@/ui/admin/editor-shell/editor-shell-types'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { EditorToolbar } from '@/ui/admin/editor-shell/EditorToolbar'

// The toolbar weaves the entity noun into every piece of chrome through one
// message id — this pins both entity ids and both locales, so a regression to
// a literal label fails here.

function makeState(overrides: Partial<EditorToolbarState> = {}): EditorToolbarState {
  return {
    metaOpen: false,
    setMetaOpen: () => {},
    published: true,
    isPending: false,
    isSavingDraft: false,
    isPublishing: false,
    isUnpublishing: false,
    isCreating: false,
    canPersistMeta: true,
    canPublish: true,
    publishStatus: 'live',
    persistCreate: async () => {},
    persistSave: () => {},
    persistPublish: () => {},
    persistUnpublish: () => {},
    ...overrides,
  }
}

interface RenderOptions {
  mode?: 'create' | 'edit'
  entityLabelId?: UiMessageId
  locale?: AppLocale
  state?: Partial<EditorToolbarState>
}

function renderToolbar({
  mode = 'edit',
  entityLabelId = 'admin.editor.entity.post',
  locale = 'zh-CN',
  state = {},
}: RenderOptions = {}): string {
  const toolbar = (
    <EditorToolbar
      mode={mode}
      entityLabelId={entityLabelId}
      listPath="/admin/posts"
      publicPath="/posts/hello-world"
      analyticsPath="/editor/post/1/analytics"
      state={makeState(state)}
    />
  )
  return renderToStaticMarkup(<MemoryRouter>{wrapWithI18n(toolbar, { locale })}</MemoryRouter>)
}

describe('EditorToolbar i18n', () => {
  it('weaves the post noun through the zh-CN chrome', () => {
    const markup = renderToolbar({ entityLabelId: 'admin.editor.entity.post' })

    expect(markup).toContain('title="保存文章信息')
    expect(markup).toContain('title="展开文章信息面板"')
    expect(markup).toContain('aria-label="切换文章信息面板"')
    // The remaining chrome is entity-less but translated.
    expect(markup).toContain('返回列表')
    expect(markup).toContain('公开预览')
    expect(markup).toContain('分析')
    expect(markup).toContain('发布草稿')
    expect(markup).toContain('取消发布')
    expect(markup).toContain('元数据')
  })

  it('switches the noun with entityLabelId (pages)', () => {
    const markup = renderToolbar({ entityLabelId: 'admin.editor.entity.page' })

    expect(markup).toContain('title="保存页面信息')
    expect(markup).toContain('title="展开页面信息面板"')
    expect(markup).toContain('aria-label="切换页面信息面板"')
    expect(markup).not.toContain('文章信息')
  })

  it('renders the English chrome for en-US', () => {
    const markup = renderToolbar({ entityLabelId: 'admin.editor.entity.post', locale: 'en-US' })

    expect(markup).toContain('title="Save the post info')
    expect(markup).toContain('aria-label="Toggle the post info panel"')
    expect(markup).toContain('Back to the list')
    expect(markup).toContain('Public preview')
    expect(markup).toContain('Publish draft')
    expect(markup).toContain('Unpublish')
    expect(markup).toContain('Metadata')
  })

  it('localizes the create-mode chrome', () => {
    const zh = renderToolbar({ mode: 'create', entityLabelId: 'admin.editor.entity.post' })
    expect(zh).toContain('title="保存文章信息并上传当前正文"')
    expect(zh).toContain('创建文章')

    const en = renderToolbar({ mode: 'create', entityLabelId: 'admin.editor.entity.page', locale: 'en-US' })
    expect(en).toContain('title="Save the page info and upload the current body"')
    expect(en).toContain('Create page')
  })

  it('keeps the scheduled and disabled publish hints translated', () => {
    const scheduled = renderToolbar({
      state: { publishStatus: 'scheduled' },
    })
    expect(scheduled).toContain('将最新草稿按计划时间上线')
    expect(scheduled).toContain('计划发布')

    const disabled = renderToolbar({ state: { canPublish: false } })
    expect(disabled).toContain('当前没有待发布的草稿')
  })
})
