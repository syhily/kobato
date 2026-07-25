// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  SettingsSecretInput,
  secretFieldPatch,
  secretFieldStrings,
} from '@/ui/admin/settings/shell/SettingsSecretInput'

// The "Secret field" pattern's write path: an empty or whitespace-only input
// omits the key from the patch (the server's deep-merge then preserves the
// stored secret); any real input replaces it, trimmed.

describe('ui/admin/settings/shell/secretFieldPatch', () => {
  it('omits the field when the input is empty', () => {
    expect(secretFieldPatch('', 'apiKey')).toEqual({})
  })

  it('omits the field when the input is whitespace-only', () => {
    expect(secretFieldPatch('   ', 'apiKey')).toEqual({})
    expect(secretFieldPatch('\t\n ', 'smtpPass')).toEqual({})
  })

  it('patches the field with the trimmed value', () => {
    expect(secretFieldPatch('key-123', 'apiKey')).toEqual({ apiKey: 'key-123' })
    expect(secretFieldPatch('  key-123  ', 'apiKey')).toEqual({ apiKey: 'key-123' })
  })

  it('uses the given field name', () => {
    expect(secretFieldPatch('s3cr3t', 'secretAccessKey')).toEqual({ secretAccessKey: 's3cr3t' })
  })
})

describe('ui/admin/settings/shell/secretFieldStrings', () => {
  it('returns the empty-state strings when no mask exists', () => {
    expect(
      secretFieldStrings({
        mask: null,
        keepLabel: '保留现有 Key',
        emptyHint: '尚未配置。',
        emptyPlaceholder: '粘贴 OpenAI API Key',
      }),
    ).toEqual({ hint: '尚未配置。', placeholder: '粘贴 OpenAI API Key' })
  })

  it('composes the configured hint from the mask and keep label', () => {
    expect(
      secretFieldStrings({
        mask: 'wxyz',
        keepLabel: '保留现有 Key',
        emptyHint: '尚未配置。',
        emptyPlaceholder: '粘贴 OpenAI API Key',
      }),
    ).toEqual({ hint: '当前已配置（结尾 …wxyz）。留空保存表示保留现有 Key。', placeholder: '保留现有 Key' })
  })

  it('supports non-Key keep labels byte-identically (no inserted space)', () => {
    const { hint, placeholder } = secretFieldStrings({
      mask: 'abcd',
      keepLabel: '保留现有密码',
      emptyHint: '尚未配置。',
      emptyPlaceholder: '输入 SMTP 密码',
    })
    expect(hint).toBe('当前已配置（结尾 …abcd）。留空保存表示保留现有密码。')
    expect(placeholder).toBe('保留现有密码')
  })
})

describe('ui/admin/settings/shell/SettingsSecretInput', () => {
  it('bakes the secret-input invariants and merges blur with flushOnBlur', () => {
    const flushOnBlur = vi.fn()
    const onBlur = vi.fn()
    render(
      <SettingsSecretInput aria-label="secret" flushOnBlur={flushOnBlur} onBlur={onBlur} placeholder="保留现有 Key" />,
    )

    const input = screen.getByLabelText('secret')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toHaveAttribute('maxlength', '512')
    expect(input).toHaveAttribute('placeholder', '保留现有 Key')

    fireEvent.blur(input)
    expect(onBlur).toHaveBeenCalledOnce()
    expect(flushOnBlur).toHaveBeenCalledOnce()
  })
})
