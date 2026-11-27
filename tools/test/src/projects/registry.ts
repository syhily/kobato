import { apiProjects } from '@kobato/test/projects/api-projects'
import { dbProjects } from '@kobato/test/projects/db-projects'
import { kobatoAppProjects } from '@kobato/test/projects/kobato-app-projects'
import { sayakaAppProjects } from '@kobato/test/projects/sayaka-app-projects'
import { serverProjects } from '@kobato/test/projects/server-projects'
import sharedSnapsProject from '@kobato/test/projects/shared-snaps'
import sharedUnitProject from '@kobato/test/projects/shared-unit'
import { uiProjects } from '@kobato/test/projects/ui-projects'
import webSnapsProject from '@kobato/test/projects/web-snaps'
import { webUnitProjects } from '@kobato/test/projects/web-unit'

export const inklingUnitConfigPath = 'packages/inkling/tests/vitest.config.ts'
export const demoUnitConfigPath = 'apps/inkling-demo/tests/vitest.config.ts'
export const packUnitConfigPath = 'tools/pack/tests/unit/vitest.config.ts'
export const traceUnitConfigPath = 'tools/trace/tests/unit/vitest.config.ts'

export const allTestProjects = [
  sharedUnitProject,
  sharedSnapsProject,
  ...webUnitProjects,
  webSnapsProject,
  ...uiProjects,
  ...dbProjects,
  ...serverProjects,
  ...apiProjects,
  ...kobatoAppProjects,
  ...sayakaAppProjects,
  inklingUnitConfigPath,
  demoUnitConfigPath,
  packUnitConfigPath,
  traceUnitConfigPath,
]
