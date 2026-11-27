import type { SliceVariantSpec } from '@kobato/font-split/scripts/bench/suite/profile'
import type {
  ResolvedFont,
  SliceSample,
  SliceVariant,
  SliceVariantResult,
  SlicingTimeResult,
  SuiteContext,
} from '@kobato/font-split/scripts/bench/suite/types'

import { runCommand, runCommandOrThrow } from '@kobato/font-split/scripts/bench/command'
import { recordNumber, recordString, recordsOf, theRecord } from '@kobato/font-split/scripts/bench/records'
import { median, spread } from '@kobato/font-split/scripts/bench/stats'
import { buildAddon, runSlicingPhases } from '@kobato/font-split/scripts/bench/suite/cargo'
import { STAGES } from '@kobato/font-split/scripts/bench/suite/options'
import { fontSplitDir, repoRoot, sliceDriverFile } from '@kobato/font-split/scripts/bench/suite/paths'
import {
  PGO_BUILDS,
  PGO_BUILDS_QUICK,
  SLICE_RUNS,
  SLICE_RUNS_QUICK,
  SLICE_RUNS_SECONDARY,
  SLICE_VARIANTS_PRIMARY,
  SLICE_VARIANTS_SECONDARY,
  SLICE_VARIANT_SPECS,
} from '@kobato/font-split/scripts/bench/suite/profile'
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

type AddonName = Exclude<SliceVariantSpec['addon'], 'pgo'>

interface Addons {
  files: Map<AddonName, string>
  pgo: string[]
  profdata: string | null
}

interface Target {
  variant: SliceVariant
  build: number | null
  addonPath: string
}

interface Timed {
  variants: SliceVariantResult[]
  fingerprint: string
}

function stage(targetDir: string, addon: string, source: string): string {
  mkdirSync(targetDir, { recursive: true })
  const target = join(targetDir, `${addon}.node`)
  if (!sameFile(source, target)) {
    copyFileSync(source, target)
  }
  return target
}

function sameFile(source: string, target: string): boolean {
  try {
    const left = statSync(source)
    const right = statSync(target)
    return left.size === right.size && left.mtimeMs === right.mtimeMs
  } catch {
    return false
  }
}

function toolWorks(candidate: string): boolean {
  try {
    return runCommand(candidate, ['--version'], { cwd: fontSplitDir }).status === 0
  } catch {
    return false
  }
}

function toolVersion(candidate: string): string {
  return runCommand(candidate, ['--version'], { cwd: fontSplitDir }).stdout.trim().split('\n')[0]!
}

function findProfdataTool(): string | null {
  const cwd = fontSplitDir
  const candidates: string[] = []
  const explicit = process.env.KOBATO_BENCH_LLVM_PROFDATA
  if (explicit !== undefined && explicit !== '') {
    candidates.push(explicit)
  }
  const sysroot = runCommand('rustc', ['--print', 'sysroot'], { cwd })
  const verbose = runCommand('rustc', ['-vV'], { cwd })
  if (sysroot.status === 0 && verbose.status === 0) {
    const host = /^host: (\S+)$/m.exec(verbose.stdout)?.[1]
    if (host !== undefined) {
      candidates.push(join(sysroot.stdout.trim(), 'lib', 'rustlib', host, 'bin', 'llvm-profdata'))
    }
    const major = /LLVM version: (\d+)\./.exec(verbose.stdout)?.[1]
    if (major !== undefined) {
      for (const base of ['/opt/homebrew/opt', '/usr/local/opt']) {
        candidates.push(join(base, `llvm@${major}`, 'bin', 'llvm-profdata'))
      }
    }
  }
  candidates.push('/opt/homebrew/opt/llvm/bin/llvm-profdata', '/usr/local/opt/llvm/bin/llvm-profdata', 'llvm-profdata')
  return candidates.find((candidate) => toolWorks(candidate)) ?? null
}

function mergeProfiles(tool: string, rawDir: string, output: string): string | null {
  const raw = readdirSync(rawDir)
    .filter((name) => name.endsWith('.profraw'))
    .map((name) => join(rawDir, name))
  if (raw.length === 0) {
    return null
  }
  rmSync(output, { force: true })
  const outcome = runCommand(tool, ['merge', '-o', output, ...raw], { cwd: fontSplitDir })
  return outcome.status === 0 ? output : null
}

function train(ctx: SuiteContext, addonPath: string, rawDir: string): void {
  for (const font of ctx.fonts) {
    runCommandOrThrow(process.execPath, ['--no-warnings', sliceDriverFile, addonPath, font.path, font.label], {
      cwd: repoRoot,
      env: { RAYON_NUM_THREADS: String(ctx.options.threads), LLVM_PROFILE_FILE: join(rawDir, '%p.profraw') },
    })
  }
}

function buildAddons(ctx: SuiteContext): Addons {
  const workDir = ctx.options.workDir
  const addonsDir = join(workDir, 'addons')
  const plain = { features: [], env: {}, fresh: false }
  const defaultTarget = join(fontSplitDir, 'target')
  const files = new Map<AddonName, string>()
  ctx.log('slicing time: building the shipped, bench-seam and previous-profile addons')
  files.set('shipped', stage(addonsDir, 'shipped', buildAddon({ ...plain, targetDir: defaultTarget })))
  files.set('bench', stage(addonsDir, 'bench', buildAddon({ ...plain, targetDir: defaultTarget, features: ['bench'] })))
  files.set(
    'previous-profile',
    stage(
      addonsDir,
      'previous-profile',
      buildAddon({
        ...plain,
        targetDir: join(workDir, 'target-previous-profile'),
        env: { CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '16', CARGO_PROFILE_RELEASE_STRIP: 'none' },
      }),
    ),
  )
  const tool = findProfdataTool()
  if (tool === null) {
    ctx.log('slicing time: no llvm-profdata matching rustc — skipping profile-guided optimization')
    return { files, pgo: [], profdata: null }
  }
  const profileRoot = join(workDir, 'pgo')
  const rawDir = join(profileRoot, 'raw')
  const merged = join(profileRoot, 'merged.profdata')
  rmSync(profileRoot, { recursive: true, force: true })
  ctx.log('slicing time: building the instrumented addon')
  const instrumented = stage(
    addonsDir,
    'pgo-instrumented',
    buildAddon({
      ...plain,
      targetDir: join(workDir, 'target-pgo-instrumented'),
      env: { RUSTFLAGS: `-Cprofile-generate=${rawDir}` },
    }),
  )
  const pgo: string[] = []
  const builds = ctx.options.quick ? PGO_BUILDS_QUICK : PGO_BUILDS
  for (let build = 1; build <= builds; build += 1) {
    rmSync(rawDir, { recursive: true, force: true })
    mkdirSync(rawDir, { recursive: true })
    ctx.log(`slicing time: training run ${build} of ${builds} — the instrumented addon slices the fonts`)
    train(ctx, instrumented, rawDir)
    if (mergeProfiles(tool, rawDir, merged) === null) {
      throw new Error('llvm-profdata could not merge the training profiles')
    }
    ctx.log(`slicing time: building the profile-guided addon from training run ${build}`)
    pgo.push(
      stage(
        addonsDir,
        `pgo-${build}`,
        buildAddon({
          ...plain,
          targetDir: join(workDir, 'target-pgo-optimized'),
          env: { RUSTFLAGS: `-Cprofile-use=${merged}` },
          fresh: true,
        }),
      ),
    )
  }
  return { files, pgo, profdata: toolVersion(tool) }
}

type DriverEnv = {
  RAYON_NUM_THREADS: string
  FONT_SPLIT_BENCH_VARIANT: string
  FONT_SPLIT_BENCH_WOFF2_QUALITY?: string
  FONT_SPLIT_BENCH_SKIP_COMPRESSION?: string
}

function drive(font: ResolvedFont, addonPath: string, env: DriverEnv): SliceSample & { fingerprint: string } {
  const outcome = runCommandOrThrow(
    process.execPath,
    ['--no-warnings', sliceDriverFile, addonPath, font.path, font.label],
    { cwd: repoRoot, env },
  )
  const record = theRecord(recordsOf(outcome.stdout, 'slice-run'), 'slice-run', {})
  return {
    ms: recordNumber(record, 'ms'),
    chunks: recordNumber(record, 'chunks'),
    chunkBytes: recordNumber(record, 'chunkBytes'),
    cssBytes: recordNumber(record, 'cssBytes'),
    largestFaceBytes: recordNumber(record, 'largestFaceBytes'),
    namesHash: recordString(record, 'namesHash'),
    fingerprint: recordString(record, 'fingerprint'),
  }
}

function targets(variants: readonly SliceVariant[], addons: Addons): Target[] {
  return variants.flatMap((variant): Target[] => {
    const addon = SLICE_VARIANT_SPECS[variant].addon
    if (addon === 'pgo') {
      return addons.pgo.map((addonPath, index) => ({ variant, build: index + 1, addonPath }))
    }
    const addonPath = addons.files.get(addon)
    if (addonPath === undefined) {
      throw new Error(`no addon was built for the ${variant} variant`)
    }
    return [{ variant, build: null, addonPath }]
  })
}

function nameOf(target: Target): string {
  return target.build === null ? target.variant : `${target.variant} build ${target.build}`
}

const STEADY_ABOVE_MS = 1000
const MAX_SPREAD = 0.1

export function assertSteady(name: string, times: readonly number[], again: string): void {
  if (median(times) >= STEADY_ABOVE_MS && spread(times) > MAX_SPREAD) {
    throw new Error(
      `the ${name} samples spread ${Math.round(spread(times) * 100)}% across the interleaved runs — the machine was busy. ` +
        `Measure the stage again on a quiet machine with --skip ${again}`,
    )
  }
}

function timeVariants(
  ctx: SuiteContext,
  font: ResolvedFont,
  variants: readonly SliceVariant[],
  addons: Addons,
  runs: number,
): Timed {
  const plan = targets(variants, addons)
  ctx.log(
    `slicing time: ${font.label} — ${plan.length} builds of ${variants.length} variants × ${runs} interleaved runs`,
  )
  const samples = new Map<Target, SliceSample[]>()
  let fingerprint = ''
  for (let run = 0; run < runs; run += 1) {
    for (let position = 0; position < plan.length; position += 1) {
      const target = plan[(position + run) % plan.length]!
      const spec = SLICE_VARIANT_SPECS[target.variant]
      const sample = drive(font, target.addonPath, {
        RAYON_NUM_THREADS: String(ctx.options.threads),
        FONT_SPLIT_BENCH_VARIANT: target.variant,
        ...(spec.quality === null ? {} : { FONT_SPLIT_BENCH_WOFF2_QUALITY: String(spec.quality) }),
        ...(spec.skipCompression ? { FONT_SPLIT_BENCH_SKIP_COMPRESSION: '1' } : {}),
      })
      fingerprint = sample.fingerprint
      samples.set(target, [...(samples.get(target) ?? []), sample])
    }
  }
  const shipped = plan.find((target) => target.variant === 'shipped')
  if (shipped === undefined) {
    throw new Error('the shipped variant was not timed')
  }
  const shippedSamples = samples.get(shipped)!
  const again = STAGES.filter((stage) => stage !== 'slicing-time').join(',')
  for (const target of plan) {
    const spec = SLICE_VARIANT_SPECS[target.variant]
    const timed = samples.get(target)!
    assertSteady(
      nameOf(target),
      timed.map((sample) => sample.ms),
      again,
    )
    const seamDriven = spec.quality !== null || spec.skipCompression
    if (seamDriven && timed.every((sample) => sample.chunkBytes === shippedSamples[0]!.chunkBytes)) {
      throw new Error(`the ${target.variant} variant produced the shipped bytes — the bench seams did not take effect`)
    }
    if (timed.some((sample) => sample.namesHash !== timed[0]!.namesHash)) {
      throw new Error(`the ${nameOf(target)} variant is not reproducible across its ${runs} runs`)
    }
    if (
      !seamDriven &&
      timed.some(
        (sample) =>
          sample.namesHash !== shippedSamples[0]!.namesHash || sample.chunkBytes !== shippedSamples[0]!.chunkBytes,
      )
    ) {
      throw new Error(`the ${nameOf(target)} variant does not produce the shipped package`)
    }
  }
  return {
    fingerprint,
    variants: plan.map((target) => ({
      variant: target.variant,
      build: target.build,
      addonBytes: statSync(target.addonPath).size,
      samples: samples.get(target)!,
    })),
  }
}

export function measureSlicingTime(ctx: SuiteContext): SlicingTimeResult {
  const addons = buildAddons(ctx)
  const fonts: SlicingTimeResult['fonts'] = {}
  let fingerprint = ''
  for (const font of ctx.fonts) {
    const primary = font.key === ctx.primary.key
    const table = primary ? SLICE_VARIANTS_PRIMARY : SLICE_VARIANTS_SECONDARY
    const variants = addons.pgo.length === 0 ? table.filter((variant) => variant !== 'pgo') : table
    const runs = ctx.options.quick ? SLICE_RUNS_QUICK : primary ? SLICE_RUNS : SLICE_RUNS_SECONDARY
    const timed = timeVariants(ctx, font, variants, addons, runs)
    const { phases } = runSlicingPhases(font.path, ctx.options.threads)
    fingerprint = timed.fingerprint
    fonts[font.key] = { variants: timed.variants, phases }
    const shipped = timed.variants.find((entry) => entry.variant === 'shipped')!
    ctx.log(
      `slicing time: ${font.label} — shipped ${(median(shipped.samples.map((sample) => sample.ms)) / 1000).toFixed(2)} s`,
    )
  }
  return { threads: ctx.options.threads, fingerprint, profdata: addons.profdata, fonts }
}
