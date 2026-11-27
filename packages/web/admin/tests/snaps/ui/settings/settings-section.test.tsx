import { Input } from '@kobato/ui/components/input'
import { SettingsRow } from '@kobato/web-admin/ui/settings/SettingsSection'
import { renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { describe, expect, it } from 'vitest'

describe('snapshot: SettingsRow', () => {
  it('renders a basic label + control row', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="站点标题" htmlFor="site-title" hint="显示在浏览器标签与首页标题处。">
          <Input id="site-title" defaultValue="且听书吟" />
        </SettingsRow>,
      ),
    )
    expect(html).toContain('站点标题')
    expect(html).toContain('site-title')
    expect(html).toContain('显示在浏览器标签与首页标题处')
    expect(html).toContain('且听书吟')
  })

  it('renders an error state', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="邮箱" error="请输入有效的邮箱地址。">
          <Input defaultValue="not-an-email" />
        </SettingsRow>,
      ),
    )
    expect(html).toContain('邮箱')
    expect(html).toContain('请输入有效的邮箱地址')
    expect(html).toContain('data-invalid="true"')
  })

  it('supports render-prop control props', () => {
    const html = stableHtml(
      renderToHtml(
        <SettingsRow label="昵称" hint="2-20 个字符。">
          {(controlProps) => (
            <Input aria-invalid={controlProps['aria-invalid']} aria-describedby={controlProps['aria-describedby']} />
          )}
        </SettingsRow>,
      ),
    )
    expect(html).toContain('昵称')
    expect(html).toContain('2-20 个字符')
  })

  it('wires invalid state to the shadcn field and the control', () => {
    const html = renderToHtml(
      <SettingsRow label="缓存前缀" htmlFor="cache-prefix" hint="必须以分隔符结尾。" error="前缀冲突">
        {(controlProps) => <Input id="cache-prefix" {...controlProps} />}
      </SettingsRow>,
    )

    expect(html).toContain('data-invalid="true"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('前缀冲突')
  })
})
