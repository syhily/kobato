import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Release-chain acceptance contract: the flow is a single chain — tag push →
// sea.yml build matrix → release-upload — ending with the draft flipping
// public. These tests pin each handoff as text so a re-break fails here, not
// during a release.

const sea = readFileSync('.github/workflows/sea.yml', 'utf-8')
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
    // Users must never see a release with missing assets.
    expect(releaseTs).toMatch(/gh release create[^\n]*--draft/)
  })

  it('sea.yml triggers on tag pushes (draft releases fire no release events)', () => {
    const onBlock = sea.split('jobs:')[0]
    expect(onBlock).toMatch(/push:[\s\S]*tags:/)
  })

  it('sea.yml does not trigger release builds on main branch pushes', () => {
    const pushBlock = sea.slice(sea.indexOf('push:'), sea.indexOf('pull_request:'))
    expect(pushBlock).toMatch(/branches: \[develop\]/)
    expect(pushBlock).toMatch(/tags: \['\*'\]/)

    const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
    for (const job of ['build', 'build-darwin', 'build-windows']) {
      const block = jobBlocks.find((b) => b.startsWith(`${job}:`))
      expect(block, `sea.yml job block for ${job}`).toBeDefined()
      expect(block).not.toMatch(/github\.ref == 'refs\/heads\/main'/)
    }
  })

  it('sea.yml build matrix gate admits tag pushes — anchored per release-upload dependency job', () => {
    // Whole-file matches miss one leg's gate breaking — assert per job block.
    const tagGate = /if:.*startsWith\(github\.ref, 'refs\/tags\/'\)/
    // Job keys are the only two-space-indented lines under `jobs:` — one block per job.
    const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
    for (const job of ['build', 'build-darwin', 'build-windows']) {
      const block = jobBlocks.find((b) => b.startsWith(`${job}:`))
      expect(block, `sea.yml job block for ${job}`).toBeDefined()
      expect(block).toMatch(tagGate)
    }
  })

  it('sea.yml release-upload runs on the tag push and publishes the draft', () => {
    expect(sea).toMatch(
      /release-upload:[\s\S]*if: github\.event_name == 'release' \|\| \(github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)\)/,
    )
    expect(sea).toMatch(/gh release edit "[^"]*" --draft=false/)
  })

  it('sea.yml release-upload stays gated on the full matrix and uploads BEFORE publishing (fix-review)', () => {
    expect(sea).toMatch(/release-upload:[\s\S]*?needs: \[build, build-darwin, build-windows\]/)
    const uploadIdx = sea.indexOf('gh release upload')
    const publishIdx = sea.indexOf('--draft=false')
    expect(uploadIdx).toBeGreaterThan(-1)
    expect(publishIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeLessThan(publishIdx)
  })

  it('sea.yml release-upload addresses the release via github.ref_name (release context is null on tag pushes)', () => {
    expect(sea).not.toMatch(/github\.event\.release\.tag_name/)
    expect(sea).toMatch(/gh release upload "\$\{\{ github\.ref_name \}\}"/)
  })

  it('ships the tested Ubuntu x64 deb and its checksum as release assets', () => {
    const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
    const build = jobBlocks.find((block) => block.startsWith('build:'))
    const releaseUpload = jobBlocks.find((block) => block.startsWith('release-upload:'))

    expect(build).toMatch(
      /Package Ubuntu x64 deb with checksum[\s\S]*?if: matrix\.target == 'linux-x64'[\s\S]*?build-deb\.sh/,
    )
    expect(build).toMatch(/dist-sea\/kobato_\*_amd64\.deb\n/)
    expect(build).toMatch(/dist-sea\/kobato_\*_amd64\.deb\.sha256\n/)
    expect(releaseUpload).toMatch(
      /gh release upload "\$\{\{ github\.ref_name \}\}"[^\n]*dist-sea\/kobato-\*[^\n]*dist-sea\/kobato_\*_amd64\.deb[^\n]*dist-sea\/kobato_\*_amd64\.deb\.sha256[^\n]*--clobber/,
    )
  })

  it('no workflow consumes the `published` release event — the chain ends at release-upload (M2: the ghcr chain is gone)', () => {
    // A workflow that also triggers on `release: published` silently forks the
    // release chain.
    for (const file of readdirSync('.github/workflows')) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) {
        continue
      }
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf-8')
      expect(workflow, `${file} must not trigger on release published`).not.toMatch(
        /release:[\s\S]*?types: \[[^\]]*\bpublished\b/,
      )
    }
  })
})
