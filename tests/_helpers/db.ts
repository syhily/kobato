import type { MetricRow } from '@/server/infra/db/types'

export function seedMetric(overrides: Partial<MetricRow> = {}): MetricRow {
  const now = overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z')
  return {
    id: overrides.id ?? 2n,
    type: overrides.type ?? 'post',
    ownerId: overrides.ownerId ?? 1n,
    publicId: overrides.publicId ?? '00000000-0000-0000-0000-000000000001',
    pv: overrides.pv ?? 0,
    voteUp: overrides.voteUp ?? 0,
    voteDown: overrides.voteDown ?? 0,
    createdAt: now,
    updatedAt: overrides.updatedAt ?? now,
    deletedAt: overrides.deletedAt ?? null,
  } as MetricRow
}
