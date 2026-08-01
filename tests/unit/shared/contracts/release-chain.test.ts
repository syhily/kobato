import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Release-chain acceptance contract (D-1). The 2026-08-01 audit found the
// entire automated release flow dead (P0-1): scripts/release.ts creates
// the GitHub release as a DRAFT, and GitHub fires NO workflow events for
// draft releases — so `release: [created]` triggers never fired, the SEA
// assets never uploaded, the draft never published, and the semver Docker
// image never built. The chain was re-designed around the one event the
// flow always produces — the TAG PUSH:
//
//   release.ts: push tag ──► sea.yml (push:tags): build matrix
//                          └► release-upload job: upload assets ──►
//     gh release edit --draft=false ──► `published` event ──►
//     docker.yml (release:[published]): semver image
//
// These tests read the workflow files and release.ts as TEXT and pin the
// links of that chain, so a future edit that re-breaks any handoff fails
// here instead of during a release. (Text assertions, not YAML parsing:
// what matters is the exact trigger/gate/step spelling GitHub evaluates.)

const sea = readFileSync('.github/workflows/sea.yml', 'utf-8')
const docker = readFileSync('.github/workflows/docker.yml', 'utf-8')
const releaseTs = readFileSync('scripts/release.ts', 'utf-8')

describe('release chain: the draft-release flow stays triggerable', () => {
  it('release.ts pushes the tag BEFORE creating the release (the event the chain rides on)', () => {
    const pushIdx = releaseTs.indexOf('git push origin')
    const createIdx = releaseTs.indexOf('gh release create')
    expect(pushIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(pushIdx).toBeLessThan(createIdx)
  })

  it('release.ts creates the release as a draft (the no-partial-release guarantee)', () => {
    // Users must never see a release with missing assets: the release
    // stays a draft until sea.yml's release-upload publishes it.
    expect(releaseTs).toMatch(/gh release create[^\n]*--draft/)
  })

  it('sea.yml triggers on tag pushes (draft releases fire no release events)', () => {
    const onBlock = sea.split('jobs:')[0]
    expect(onBlock).toMatch(/push:[\s\S]*tags:/)
  })

  it('sea.yml build matrix gate admits tag pushes', () => {
    // Without this the matrix jobs would be skipped on the tag push and
    // release-upload's `needs` would never be satisfiable.
    expect(sea).toMatch(/if:.*startsWith\(github\.ref, 'refs\/tags\/'\)/)
  })

  it('sea.yml release-upload runs on the tag push and publishes the draft', () => {
    expect(sea).toMatch(
      /release-upload:[\s\S]*if: github\.event_name == 'release' \|\| \(github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)\)/,
    )
    expect(sea).toMatch(/gh release edit "[^"]*" --draft=false/)
  })

  it('sea.yml release-upload addresses the release via github.ref_name (release context is null on tag pushes)', () => {
    expect(sea).not.toMatch(/github\.event\.release\.tag_name/)
    expect(sea).toMatch(/gh release upload "\$\{\{ github\.ref_name \}\}"/)
  })

  it('docker.yml builds the semver image on the `published` event the upload job produces', () => {
    const onBlock = docker.split('jobs:')[0]
    expect(onBlock).toMatch(/release:[\s\S]*types: \[[^\]]*\bpublished\b/)
    // The semver tags are what the release commit writes into
    // docker-compose.yml — without this link the compose pull breaks.
    expect(docker).toMatch(/type=semver,pattern=\{\{version\}\}/)
    expect(releaseTs).toMatch(/ghcr\.io\/syhily\/kobato:\$\{version\}/)
  })

  it('docker.yml keeps the draft guard (a discarded draft must not leave semver tags behind)', () => {
    expect(docker).toMatch(/if: \$\{\{ !github\.event\.release\.draft \}\}/)
  })
})
