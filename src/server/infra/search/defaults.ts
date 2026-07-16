import type { SearchSettings } from '@/shared/config/types'

import { projectSearchForAdmin } from '@/shared/config/projection'

/**
 * Infra-side fallback for the search section, used only when the settings
 * bundle is absent (install gate, pre-seed window). Derived from the
 * shared settings projection's empty-input defaults — the copy the
 * schema, registry seed, and admin projection are deliberately kept in
 * lockstep on — so there is no fourth literal to drift. Pinned against
 * the zod schema defaults by
 * `tests/unit/server/infra/search/defaults.test.ts`; do NOT re-literal
 * these values here.
 */
export const INFRA_SEARCH_DEFAULTS: SearchSettings['search'] = projectSearchForAdmin(undefined).search
