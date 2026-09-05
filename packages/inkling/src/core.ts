// The `./core` subpath entry (plan C5) — the comment-level composition
// surface. Everything here is card-free: no DEFAULT_NODES, no card shims or
// INSERT_*_COMMAND, no feature plugins (emoji/at-link/snippet/selector/
// card-menu), no markdown round-trip, no HtmlOutputPlugin. The `.` entry is
// untouched and stays the full bundle.
//
// The composition contract changes two defaults versus `.`:
// - `InklingComposer` is the core variant — `nodes` is REQUIRED (the host
//   names its node set instead of defaulting to the full card set).
// - `MarkdownShortcutPlugin`'s default transformer set is
//   MINIMAL_TRANSFORMERS everywhere; a bare InklingSurface gets no
//   heading/list/fence shortcuts unless the host passes them explicitly.

/* Components */
import InklingComposer from '@/components/InklingComposerBase'

/* The contract shared with the `.` entry (host-config types, labels, the
 * library browser, the card-free composition pieces, version) is
 * single-sourced in ./shared-exports — add shared names there, never here. */
export * from './shared-exports'

/* The core composer's props are entry-specific: `nodes` is REQUIRED here,
 * optional on the `.` entry's defaulted variant. */
export type { InklingComposerProps } from '@/components/InklingComposerBase'

export { InklingComposer }
