import { cn } from '@kobato/ui/lib/cn'
import { describe, expect, it } from 'vitest'

// Guards against tailwind-merge regressions in `cn()`.
//
// These tests pin the merge semantics:
//   - dedupe conflicting Tailwind utilities (gap-2 + gap-4 → gap-4)
//   - leave non-Tailwind class literals (`btn`, `media`, `post-like`) opaque
//   - respect responsive variant scoping (`md:gap-4` and `gap-3` are
//     different cascade slots and both survive)
describe('cn() — Tailwind utility merging', () => {
  it('drops falsy entries without leaving stray spaces', () => {
    const liked: boolean = false
    expect(cn('media', liked && 'media-36x17')).toBe('media')
    expect(cn('a', null, undefined, '', 'b')).toBe('a b')
  })

  it('preserves order when there is no conflict', () => {
    expect(cn('post-like', 'btn', 'btn-secondary')).toBe('post-like btn btn-secondary')
  })

  it('flattens arrays / objects via clsx semantics', () => {
    expect(cn(['a', ['b', { c: true, d: false }]])).toBe('a b c')
  })

  it('dedupes conflicting Tailwind spacing utilities (last wins)', () => {
    expect(cn('gap-2', 'gap-4')).toBe('gap-4')
    expect(cn('p-2', 'p-1', 'p-3')).toBe('p-3')
  })

  it('dedupes conflicting Tailwind sizing utilities', () => {
    expect(cn('h-4', 'h-6')).toBe('h-6')
    expect(cn('w-full', 'w-1/2')).toBe('w-1/2')
  })

  it('dedupes conflicting Tailwind text utilities', () => {
    expect(cn('text-sm', 'text-base')).toBe('text-base')
    expect(cn('text-(--color-foreground)', 'text-(--color-primary)')).toBe('text-(--color-primary)')
  })

  // cn must NOT collapse a custom font-size token and a custom color
  // token that share the text- prefix. Without explicit theme
  // registration in cn.ts, every custom --text-foo token would
  // arbitrate against every custom --color-bar token through a shared
  // "unknown text-*" group, silently dropping the font-size.
  describe('cn() — custom theme tokens distinguished by namespace', () => {
    it('keeps custom --text-* font-size and custom --color-* text color side by side', () => {
      expect(cn('text-toc-toggle', 'text-ink-3')).toBe('text-toc-toggle text-ink-3')
      expect(cn('text-ink-3', 'text-toc-toggle')).toBe('text-ink-3 text-toc-toggle')
      expect(cn('text-badge', 'text-ink-3')).toBe('text-badge text-ink-3')
      expect(cn('text-empty-state-hero', 'text-brand')).toBe('text-empty-state-hero text-brand')
      expect(cn('text-btn-lg', 'text-ink-1')).toBe('text-btn-lg text-ink-1')
    })

    it('still dedupes two custom font-sizes against each other', () => {
      expect(cn('text-toc-toggle', 'text-toc-title')).toBe('text-toc-title')
      expect(cn('text-md', 'text-2xl')).toBe('text-2xl')
    })

    it('still dedupes two custom text colors against each other', () => {
      expect(cn('text-ink-1', 'text-ink-3')).toBe('text-ink-3')
      expect(cn('text-brand', 'text-alert')).toBe('text-alert')
    })

    it('dedupes a stock font-size against a custom font-size', () => {
      expect(cn('text-base', 'text-toc-toggle')).toBe('text-toc-toggle')
      expect(cn('text-toc-toggle', 'text-lg')).toBe('text-lg')
    })

    it('dedupes a stock text color against a custom text color', () => {
      expect(cn('text-red-500', 'text-ink-3')).toBe('text-ink-3')
      expect(cn('text-ink-3', 'text-red-500')).toBe('text-red-500')
    })

    it('handles other namespaces correctly: custom shadow tokens collapse against the stock scale', () => {
      expect(cn('shadow-md', 'shadow-tooltip')).toBe('shadow-tooltip')
      expect(cn('shadow-tooltip', 'shadow-lg')).toBe('shadow-lg')
    })

    it('handles other namespaces correctly: custom font tokens collapse against the stock scale', () => {
      expect(cn('font-sans', 'font-code')).toBe('font-code')
      expect(cn('font-code', 'font-mono')).toBe('font-mono')
    })

    it('handles other namespaces correctly: custom radius tokens collapse against the stock scale', () => {
      expect(cn('rounded-sm', 'rounded-xs')).toBe('rounded-xs')
    })

    // Tailwind v4 links font-size and line-height through a built-in
    // "text resets leading" conflicting-class-groups rule. The project
    // ships --text-badge and --leading-badge as a paired token, so
    // cn.ts intentionally leaves leading-* unregistered.
    it('keeps leading-<custom> alongside text-<same-name> on the badge call site', () => {
      const html = cn(
        'inline-flex shrink-0 items-center',
        'px-1.5 py-0.5 leading-badge whitespace-nowrap',
        'rounded-full text-badge font-bold',
      )
      expect(html).toContain('leading-badge')
      expect(html).toContain('text-badge')
      expect(html).toContain('font-bold')
    })
  })

  it('does NOT dedupe non-conflicting Tailwind utilities', () => {
    const result = cn('gap-4', 'p-2', 'text-base')
    expect(result.split(' ').sort()).toEqual(['gap-4', 'p-2', 'text-base'])
  })

  it('dedupes Tailwind responsive variants independently', () => {
    expect(cn('gap-2', 'md:gap-4', 'gap-3')).toBe('md:gap-4 gap-3')
  })

  it('treats non-Tailwind (legacy WordPress-compat) utilities as opaque — no merging', () => {
    expect(cn('btn', 'btn')).toBe('btn btn')
    expect(cn('media', 'media-36x17')).toBe('media media-36x17')
  })

  it('mixes legacy and Tailwind utilities cleanly', () => {
    expect(cn('btn btn-secondary', 'gap-2', 'gap-4')).toBe('btn btn-secondary gap-4')
  })

  it('handles conditional shorthand (null/undefined/false short-circuits)', () => {
    const isPending: boolean = false
    const liked: boolean = true
    expect(cn('post-like btn btn-secondary btn-lg btn-rounded', liked && 'current', isPending && 'lock')).toBe(
      'post-like btn btn-secondary btn-lg btn-rounded current',
    )
  })

  it('returns an empty string for empty input', () => {
    expect(cn()).toBe('')
    expect(cn(null, undefined, false)).toBe('')
  })
})
