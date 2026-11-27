import type {
  BenchmarkResults,
  DeployedPackage,
  SuiteContext,
  SweepPoint,
} from '@kobato/font-split/scripts/bench/suite/types'

import { runFixtureBaseline, runPageCostReport, runSweep } from '@kobato/font-split/scripts/bench/suite/cargo'
import { deployedBaselineFile } from '@kobato/font-split/scripts/bench/suite/paths'
import { MU_KB, SHIPPED_LAMBDA_KB, SWEEP_LAMBDAS_KB } from '@kobato/font-split/scripts/bench/suite/profile'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

export const DEPLOYED_SOURCE = 'cn-font-split 7.6.8 wasm core (git 120cbd7cd), css.fontFamily "OPPOSerif"'

const reportSchema = z.object({
  chunks: z.number(),
  totalBytes: z.number(),
  cssBytes: z.number(),
  pages: z.number(),
  coldMeanBytes: z.number(),
  coldP90Bytes: z.number(),
  coldMeanChunks: z.number(),
  coldP90Chunks: z.number(),
  coldMaxChunks: z.number(),
  sessionMeanBytes: z.number(),
  sessionMeanChunks: z.number(),
  incrementalMeanBytes: z.number(),
  nextMeanBytes: z.number(),
  nextMeanChunks: z.number(),
  bySize: z.array(z.object({ band: z.string(), pages: z.number(), meanBytes: z.number(), meanChunks: z.number() })),
})

const deployedSchema = z.object({
  schemaVersion: z.literal(1),
  measured: z.string(),
  source: z.string(),
  font: z.object({ file: z.string(), sha256: z.string() }),
  chunks: z.number(),
  chunkBytes: z.number(),
  cssBytes: z.number(),
  corpora: z.object({ hans: reportSchema, hant: reportSchema, blog: reportSchema }),
})

export function sweepDirName(lambdaKb: number, muKb: number): string {
  return `l${lambdaKb * 1000}-m${muKb * 1000}`
}

export function measurePageCost(ctx: SuiteContext): BenchmarkResults['pageCost'] {
  const fixture = runFixtureBaseline()
  ctx.log(`page cost: fixture baseline ${fixture.blog.chunks} chunks`)
  const sweep: Record<string, SweepPoint[]> = {}
  for (const font of ctx.fonts) {
    const lambdasKb = font.key === ctx.primary.key ? SWEEP_LAMBDAS_KB : [SHIPPED_LAMBDA_KB]
    const outDir = join(ctx.options.workDir, 'sweep', font.key)
    rmSync(outDir, { recursive: true, force: true })
    const points = runSweep(
      font.path,
      lambdasKb.map((lambda) => lambda * 1000),
      MU_KB * 1000,
      outDir,
    )
    sweep[font.key] = points
    ctx.sweepDirs.set(
      font.key,
      new Map(points.map((point) => [point.lambdaKb, join(outDir, sweepDirName(point.lambdaKb, point.muKb))])),
    )
    const shipped = points.find((point) => point.lambdaKb === SHIPPED_LAMBDA_KB)
    ctx.log(
      `page cost: ${font.label} — ${points.length} λ points; shipped ${shipped?.corpora.blog.chunks} chunks, ` +
        `blog cold ${((shipped?.corpora.blog.coldMeanBytes ?? 0) / 1024).toFixed(0)} KB`,
    )
  }
  const deployed = ctx.options.deployedPackage === null ? readDeployedBaseline(ctx) : measureDeployedBaseline(ctx)
  ctx.log(`page cost: deployed package ${deployed.chunks} chunks, measured ${deployed.measured}`)
  return { fixture, sweep, deployed }
}

export function deployedBaselineJson(baseline: DeployedPackage): string {
  return `${JSON.stringify({ schemaVersion: 1, ...baseline }, null, 2)}\n`
}

export function parseDeployedBaseline(json: string): DeployedPackage {
  const parsed = deployedSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    throw new Error('malformed deployed-package.json', { cause: parsed.error })
  }
  const data = parsed.data
  return {
    measured: data.measured,
    source: data.source,
    font: data.font,
    chunks: data.chunks,
    chunkBytes: data.chunkBytes,
    cssBytes: data.cssBytes,
    corpora: data.corpora,
  }
}

function readDeployedBaseline(ctx: SuiteContext): DeployedPackage {
  if (!existsSync(deployedBaselineFile)) {
    throw new Error(
      `${deployedBaselineFile} is missing — measure the deployed cn-font-split package once with --deployed-package <dir>`,
    )
  }
  let baseline: DeployedPackage
  try {
    baseline = parseDeployedBaseline(readFileSync(deployedBaselineFile, 'utf8'))
  } catch (error) {
    throw new Error(`${deployedBaselineFile} is malformed — re-measure it with --deployed-package <dir>`, {
      cause: error,
    })
  }
  if (baseline.font.sha256 !== ctx.primary.sha256) {
    throw new Error(
      `${deployedBaselineFile} was measured on another font (${baseline.font.file}) — re-measure it with --deployed-package <dir>`,
    )
  }
  return baseline
}

function localDay(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function measureDeployedBaseline(ctx: SuiteContext): DeployedPackage {
  const dir = ctx.options.deployedPackage!
  const faces = readdirSync(dir).filter((name) => name.endsWith('.woff2'))
  const baseline: DeployedPackage = {
    measured: localDay(),
    source: DEPLOYED_SOURCE,
    font: { file: ctx.primary.file, sha256: ctx.primary.sha256 },
    chunks: faces.length,
    chunkBytes: faces.reduce((total, name) => total + statSync(join(dir, name)).size, 0),
    cssBytes: statSync(join(dir, 'result.css')).size,
    corpora: runPageCostReport(ctx.primary.path, dir),
  }
  writeFileSync(deployedBaselineFile, deployedBaselineJson(baseline))
  return baseline
}
