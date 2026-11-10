import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { DeviceEnvClientRow, DeviceEnvServerRow } from '@/server/domains/analytics/services/device-env'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import {
  DEVICE_ENV_CLIENT_DDL,
  DEVICE_ENV_SERVER_DDL,
  appendDeviceEnvClientRows,
  appendDeviceEnvServerRows,
} from '@/server/domains/analytics/services/device-env'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'

// DDL is idempotent (old sidecars upgrade in place on boot) and columns round-trip
// through the Appender protocol, NULLs and defaults included.

const dirs: string[] = []
const handles: AnalyticsHandle[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-device-env-'))
  dirs.push(dir)
  return dir
}

async function openAt(analyticsPath: string): Promise<AnalyticsHandle> {
  const handle = await openAnalyticsDatabase(analyticsPath, [DEVICE_ENV_SERVER_DDL, DEVICE_ENV_CLIENT_DDL])
  handles.push(handle)
  return handle
}

async function close(handle: AnalyticsHandle): Promise<void> {
  await closeAnalyticsDatabase(handle)
  const index = handles.indexOf(handle)
  if (index !== -1) {
    handles.splice(index, 1)
  }
}

async function tableNames(handle: AnalyticsHandle): Promise<string[]> {
  const result = await handle.reader.runAndReadAll(
    `SELECT table_name FROM duckdb_tables() WHERE table_name LIKE 'device_env_%' ORDER BY table_name`,
  )
  return result.getRowObjects().map((row) => row.table_name as string)
}

function serverRow(overrides: Partial<DeviceEnvServerRow> = {}): DeviceEnvServerRow {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    uaFullVersion: '141.0.7390.55',
    platform: 'macOS',
    platformVersion: '15.1.0',
    model: 'MacBook Pro',
    mobile: false,
    brands: '"Chromium";v="141.0.7390.55", "Google Chrome";v="141.0.7390.55"',
    arch: 'arm',
    bitness: '64',
    formFactors: 'Desktop,Laptop',
    acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
    ...overrides,
  }
}

function clientRow(overrides: Partial<DeviceEnvClientRow> = {}): DeviceEnvClientRow {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    screenW: 2560,
    screenH: 1440,
    availW: 2560,
    availH: 1380,
    viewportW: 1280,
    viewportH: 720,
    dpr: 2,
    colorDepth: 30,
    touchPoints: 5,
    pointer: 'fine',
    hover: 'hover',
    colorScheme: 'dark',
    reducedMotion: true,
    netEffectiveType: '4g',
    netDownlink: 9.5,
    netRtt: 75,
    netSaveData: false,
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    hardwareConcurrency: 10,
    deviceMemory: 16,
    hasStatic: true,
    ...overrides,
  }
}

afterAll(async () => {
  for (const handle of handles.splice(0)) {
    await closeAnalyticsDatabase(handle).catch(() => undefined)
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('device_env DDL', () => {
  it('is idempotent across reopens and preserves existing rows', async () => {
    const analyticsPath = join(tempDir(), 'analytics.duckdb')

    const first = await openAt(analyticsPath)
    expect(await tableNames(first)).toEqual(['device_env_client', 'device_env_server'])
    await appendDeviceEnvServerRows(first.writer, [serverRow()])
    await close(first)

    const second = await openAt(analyticsPath)
    expect(await tableNames(second)).toEqual(['device_env_client', 'device_env_server'])
    const rows = await second.reader.runAndReadAll('SELECT event_id::VARCHAR AS eventId FROM device_env_server')
    expect(rows.getRowObjects()).toEqual([{ eventId: '00000000-0000-4000-8000-000000000001' }])
  })

  it('applies the declared defaults when a column is omitted', async () => {
    const handle = await openAt(join(tempDir(), 'analytics.duckdb'))
    await handle.writer.run(
      `INSERT INTO device_env_server (event_id, timestamp) VALUES ('00000000-0000-4000-8000-000000000002', to_timestamp(0))`,
    )
    await handle.writer.run(
      `INSERT INTO device_env_client (event_id, timestamp, has_static) VALUES ('00000000-0000-4000-8000-000000000002', to_timestamp(0), false)`,
    )

    expect(
      (
        await handle.reader.runAndReadAll(`
          SELECT
            event_id::VARCHAR AS eventId,
            epoch_ms(timestamp) AS ts,
            ua_full_version AS uaFullVersion,
            platform,
            platform_version AS platformVersion,
            model,
            mobile,
            brands,
            arch,
            bitness,
            form_factors AS formFactors,
            accept_language AS acceptLanguage
          FROM device_env_server
        `)
      ).getRowObjects(),
    ).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000002',
        ts: 0n,
        uaFullVersion: '',
        platform: '',
        platformVersion: '',
        model: '',
        mobile: null,
        brands: '',
        arch: '',
        bitness: '',
        formFactors: '',
        acceptLanguage: '',
      },
    ])
    expect(
      (
        await handle.reader.runAndReadAll(`
          SELECT
            event_id::VARCHAR AS eventId,
            epoch_ms(timestamp) AS ts,
            screen_w AS screenW,
            screen_h AS screenH,
            avail_w AS availW,
            avail_h AS availH,
            viewport_w AS viewportW,
            viewport_h AS viewportH,
            dpr,
            color_depth AS colorDepth,
            touch_points AS touchPoints,
            pointer,
            hover,
            color_scheme AS colorScheme,
            reduced_motion AS reducedMotion,
            net_effective_type AS netEffectiveType,
            net_downlink AS netDownlink,
            net_rtt AS netRtt,
            net_save_data AS netSaveData,
            locale,
            timezone,
            hardware_concurrency AS hardwareConcurrency,
            device_memory AS deviceMemory,
            has_static AS hasStatic
          FROM device_env_client
        `)
      ).getRowObjects(),
    ).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000002',
        ts: 0n,
        screenW: null,
        screenH: null,
        availW: null,
        availH: null,
        viewportW: null,
        viewportH: null,
        dpr: null,
        colorDepth: null,
        touchPoints: null,
        pointer: '',
        hover: '',
        colorScheme: '',
        reducedMotion: null,
        netEffectiveType: '',
        netDownlink: null,
        netRtt: null,
        netSaveData: null,
        locale: '',
        timezone: '',
        hardwareConcurrency: null,
        deviceMemory: null,
        hasStatic: false,
      },
    ])
  })
})

describe('device_env append', () => {
  it('round-trips every device_env_server column', async () => {
    const handle = await openAt(join(tempDir(), 'analytics.duckdb'))
    await appendDeviceEnvServerRows(handle.writer, [
      serverRow({ eventId: '00000000-0000-4000-8000-000000000001', timestamp: new Date('2026-01-01T00:00:00Z') }),
      serverRow({
        eventId: '00000000-0000-4000-8000-000000000002',
        timestamp: new Date('2026-01-02T03:04:05Z'),
        uaFullVersion: '141.0.7390.55',
        platform: 'Windows',
        platformVersion: '11.0.0',
        model: 'Surface Laptop',
        mobile: true,
        brands: '"Chromium";v="141.0.7390.55"',
        arch: 'x86',
        bitness: '64',
        formFactors: 'Desktop',
        acceptLanguage: 'en-US,en;q=0.9',
      }),
      // First hit of a session: no client hints arrived at all.
      {
        eventId: '00000000-0000-4000-8000-000000000003',
        timestamp: new Date('2026-01-03T00:00:00Z'),
        uaFullVersion: '',
        platform: '',
        platformVersion: '',
        model: '',
        mobile: null,
        brands: '',
        arch: '',
        bitness: '',
        formFactors: '',
        acceptLanguage: '',
      },
    ])

    const result = await handle.reader.runAndReadAll(`
      SELECT
        event_id::VARCHAR AS eventId,
        epoch_ms(timestamp) AS ts,
        ua_full_version AS uaFullVersion,
        platform,
        platform_version AS platformVersion,
        model,
        mobile,
        brands,
        arch,
        bitness,
        form_factors AS formFactors,
        accept_language AS acceptLanguage
      FROM device_env_server
      ORDER BY event_id
    `)
    expect(result.getRowObjects()).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        ts: BigInt(new Date('2026-01-01T00:00:00Z').getTime()),
        uaFullVersion: '141.0.7390.55',
        platform: 'macOS',
        platformVersion: '15.1.0',
        model: 'MacBook Pro',
        mobile: false,
        brands: '"Chromium";v="141.0.7390.55", "Google Chrome";v="141.0.7390.55"',
        arch: 'arm',
        bitness: '64',
        formFactors: 'Desktop,Laptop',
        acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      {
        eventId: '00000000-0000-4000-8000-000000000002',
        ts: BigInt(new Date('2026-01-02T03:04:05Z').getTime()),
        uaFullVersion: '141.0.7390.55',
        platform: 'Windows',
        platformVersion: '11.0.0',
        model: 'Surface Laptop',
        mobile: true,
        brands: '"Chromium";v="141.0.7390.55"',
        arch: 'x86',
        bitness: '64',
        formFactors: 'Desktop',
        acceptLanguage: 'en-US,en;q=0.9',
      },
      {
        eventId: '00000000-0000-4000-8000-000000000003',
        ts: BigInt(new Date('2026-01-03T00:00:00Z').getTime()),
        uaFullVersion: '',
        platform: '',
        platformVersion: '',
        model: '',
        mobile: null,
        brands: '',
        arch: '',
        bitness: '',
        formFactors: '',
        acceptLanguage: '',
      },
    ])
  })

  it('round-trips every device_env_client column, NULLs included', async () => {
    const handle = await openAt(join(tempDir(), 'analytics.duckdb'))
    await appendDeviceEnvClientRows(handle.writer, [
      clientRow(),
      // Dynamic-only beacon: the static block already went out this session and several dynamic fields are unavailable.
      clientRow({
        eventId: '00000000-0000-4000-8000-000000000002',
        timestamp: new Date('2026-01-02T00:00:00Z'),
        screenW: null,
        screenH: null,
        availW: null,
        availH: null,
        viewportW: 800,
        viewportH: 600,
        dpr: null,
        colorDepth: null,
        touchPoints: null,
        pointer: '',
        hover: '',
        colorScheme: 'light',
        reducedMotion: null,
        netEffectiveType: '',
        netDownlink: null,
        netRtt: null,
        netSaveData: null,
        locale: '',
        timezone: '',
        hardwareConcurrency: null,
        deviceMemory: null,
        hasStatic: false,
      }),
    ])

    const result = await handle.reader.runAndReadAll(`
      SELECT
        event_id::VARCHAR AS eventId,
        epoch_ms(timestamp) AS ts,
        screen_w AS screenW,
        screen_h AS screenH,
        avail_w AS availW,
        avail_h AS availH,
        viewport_w AS viewportW,
        viewport_h AS viewportH,
        dpr,
        color_depth AS colorDepth,
        touch_points AS touchPoints,
        pointer,
        hover,
        color_scheme AS colorScheme,
        reduced_motion AS reducedMotion,
        net_effective_type AS netEffectiveType,
        net_downlink AS netDownlink,
        net_rtt AS netRtt,
        net_save_data AS netSaveData,
        locale,
        timezone,
        hardware_concurrency AS hardwareConcurrency,
        device_memory AS deviceMemory,
        has_static AS hasStatic
      FROM device_env_client
      ORDER BY event_id
    `)
    expect(result.getRowObjects()).toEqual([
      {
        eventId: '00000000-0000-4000-8000-000000000001',
        ts: BigInt(new Date('2026-01-01T00:00:00Z').getTime()),
        screenW: 2560,
        screenH: 1440,
        availW: 2560,
        availH: 1380,
        viewportW: 1280,
        viewportH: 720,
        dpr: 2,
        colorDepth: 30,
        touchPoints: 5,
        pointer: 'fine',
        hover: 'hover',
        colorScheme: 'dark',
        reducedMotion: true,
        netEffectiveType: '4g',
        netDownlink: 9.5,
        netRtt: 75,
        netSaveData: false,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        hardwareConcurrency: 10,
        deviceMemory: 16,
        hasStatic: true,
      },
      {
        eventId: '00000000-0000-4000-8000-000000000002',
        ts: BigInt(new Date('2026-01-02T00:00:00Z').getTime()),
        screenW: null,
        screenH: null,
        availW: null,
        availH: null,
        viewportW: 800,
        viewportH: 600,
        dpr: null,
        colorDepth: null,
        touchPoints: null,
        pointer: '',
        hover: '',
        colorScheme: 'light',
        reducedMotion: null,
        netEffectiveType: '',
        netDownlink: null,
        netRtt: null,
        netSaveData: null,
        locale: '',
        timezone: '',
        hardwareConcurrency: null,
        deviceMemory: null,
        hasStatic: false,
      },
    ])
  })

  it('flushes in 2048-row chunks without losing rows', async () => {
    const handle = await openAt(join(tempDir(), 'analytics.duckdb'))
    const rows = Array.from({ length: 2050 }, (_, i) =>
      clientRow({
        eventId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        hasStatic: false,
      }),
    )
    await appendDeviceEnvClientRows(handle.writer, rows)

    const result = await handle.reader.runAndReadAll('SELECT count(*) AS c FROM device_env_client')
    expect(result.getRowObjects()[0]?.c).toBe(2050n)
  })
})
