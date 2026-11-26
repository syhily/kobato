import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sea = readFileSync('.github/workflows/sea.yml', 'utf-8')
const releaseTs = readFileSync('tools/pack/src/release.ts', 'utf-8')
const packageTs = readFileSync('tools/pack/src/sea/package.ts', 'utf-8')

function buildBlock(): string {
  const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
  const build = jobBlocks.find((b) => b.startsWith('build:'))
  expect(build, 'sea.yml job block for build').toBeDefined()
  return build as string
}

describe('release chain: the draft-release flow stays triggerable', () => {
  it('release.ts pushes the tag BEFORE creating the release (the event the chain rides on)', () => {
    const pushIdx = releaseTs.indexOf('git push origin')
    const createIdx = releaseTs.indexOf('gh release create')
    expect(pushIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(pushIdx).toBeLessThan(createIdx)
  })

  it('release.ts creates the release as a draft (the no-partial-release guarantee)', () => {
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

    expect(buildBlock()).not.toMatch(/github\.ref == 'refs\/heads\/main'/)
  })

  it('sea.yml build matrix gate admits tag pushes', () => {
    expect(buildBlock()).toMatch(/if:.*startsWith\(github\.ref, 'refs\/tags\/'\)/)
  })

  it('the merged build matrix still covers all five delivery targets', () => {
    for (const target of ['linux-x64', 'linux-arm64', 'darwin-arm64', 'win32-x64', 'win32-arm64']) {
      expect(buildBlock(), `matrix entry for ${target}`).toMatch(new RegExp(`target: ${target}\n`))
    }
  })

  it('sea.yml release-upload runs on the tag push and publishes the draft', () => {
    expect(sea).toMatch(
      /release-upload:[\s\S]*if: github\.event_name == 'release' \|\| \(github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)\)/,
    )
    expect(sea).toMatch(/gh release edit "[^"]*" --draft=false/)
  })

  it('sea.yml release-upload stays gated on the full build matrix and uploads BEFORE publishing (fix-review)', () => {
    expect(sea).toMatch(/release-upload:[\s\S]*?needs: build\n/)
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

  it('ships no Debian packages — release assets are tar.gz archives and bare binaries only', () => {
    const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
    const releaseUpload = jobBlocks.find((block) => block.startsWith('release-upload:'))

    expect(buildBlock()).not.toMatch(/--deb/)
    expect(buildBlock()).not.toMatch(/amd64\.deb/)
    expect(releaseUpload).not.toMatch(/amd64\.deb/)
    expect(packageTs).not.toMatch(/build-deb/)
  })

  it('sea:package owns the platform packaging the per-OS shell steps used to do (checksums via node:crypto)', () => {
    expect(packageTs).toMatch(/createHash\('sha256'\)/)
    expect(packageTs).toMatch(/`\$\{app\}-\$\{target\}\.tar\.gz`/)
    expect(packageTs).toMatch(/writeVerifiedChecksum/)
  })

  it('sea.yml release-upload deletes the workflow artifacts after the release is published', () => {
    const jobBlocks = sea.slice(sea.indexOf('jobs:')).split(/\n  (?=\S)/)
    const releaseUpload = jobBlocks.find((block) => block.startsWith('release-upload:'))

    const publishIdx = sea.indexOf('--draft=false')
    const deleteIdx = sea.indexOf('actions/artifacts/')
    expect(publishIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(publishIdx).toBeLessThan(deleteIdx)
    expect(releaseUpload).toMatch(/actions: write/)
    expect(releaseUpload).toMatch(/GITHUB_RUN_ID/)
  })

  it('no workflow consumes the `published` release event — the chain ends at release-upload (M2: the ghcr chain is gone)', () => {
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
