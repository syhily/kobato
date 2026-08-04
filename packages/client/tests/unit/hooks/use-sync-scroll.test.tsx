import { renderHook } from '#/_helpers/hook'

import { useSyncScroll } from '@kobato/client/hooks/use-sync-scroll'
import { describe, expect, it } from 'vitest'

describe('useSyncScroll', () => {
  it('renders without error when disabled', () => {
    expect(() =>
      renderHook(() =>
        useSyncScroll({
          editorRef: { current: null },
          previewRef: { current: null },
          enabled: false,
        }),
      ),
    ).not.toThrow()
  })

  it('renders without error when refs are null', () => {
    expect(() =>
      renderHook(() =>
        useSyncScroll({
          editorRef: { current: null },
          previewRef: { current: null },
          enabled: true,
        }),
      ),
    ).not.toThrow()
  })
})
