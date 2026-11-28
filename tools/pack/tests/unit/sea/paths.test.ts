import { repoRoot, workspaceClientBuildDir } from '@kobato/pack/sea/paths'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SEA paths', () => {
  it('reads the workspace client build from the kobato app build, anchored on the repository root', () => {
    expect(relative(repoRoot, workspaceClientBuildDir())).toBe('apps/kobato/build/workspace/client')
  })
})
