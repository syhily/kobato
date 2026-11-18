import { audioDeclaration } from '@kobato/inkling-internal/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@kobato/inkling-internal/nodes/cards/bookmark.declaration'
import { buttonDeclaration } from '@kobato/inkling-internal/nodes/cards/button.declaration'
import { calloutDeclaration } from '@kobato/inkling-internal/nodes/cards/callout.declaration'
import { codeBlockDeclaration } from '@kobato/inkling-internal/nodes/cards/codeblock.declaration'
import { fileDeclaration } from '@kobato/inkling-internal/nodes/cards/file.declaration'
import { footnoteDefinitionDeclaration } from '@kobato/inkling-internal/nodes/cards/footnotedefinition.declaration'
import { galleryDeclaration } from '@kobato/inkling-internal/nodes/cards/gallery.declaration'
import { headerDeclaration } from '@kobato/inkling-internal/nodes/cards/header.declaration'
import { horizontalRuleDeclaration } from '@kobato/inkling-internal/nodes/cards/horizontalrule.declaration'
import { htmlDeclaration } from '@kobato/inkling-internal/nodes/cards/html.declaration'
import { imageDeclaration } from '@kobato/inkling-internal/nodes/cards/image.declaration'
import { mathDeclaration } from '@kobato/inkling-internal/nodes/cards/math.declaration'
import { toggleDeclaration } from '@kobato/inkling-internal/nodes/cards/toggle.declaration'
import { videoDeclaration } from '@kobato/inkling-internal/nodes/cards/video.declaration'

export type { AnyCardDeclaration, CardDeclaration } from '@kobato/inkling-internal/nodes/cards/card-declaration'

/**
 * The card declarations — the single per-card source of truth. Every node-set
 * registry and per-card registry is a derived view over this list, and the array
 * order sets each derived registry's order.
 *
 * ADDING A CARD:
 *
 * 1. `packages/inkling/src/nodes/base/nodes/<card>/` — the React-free base node
 *    (properties, renderers, importSpec) built with `generateDecoratorNode`.
 * 2. `<card>.declaration.ts` beside this file plus one entry in
 *    `CARD_DECLARATIONS` below (position = node-set order). The declaration names
 *    menu commands by string (`CardMenuCommand`) and markdown eligibility by spec
 *    (`CardMarkdownSpec`); it imports no registry table.
 * 3. `packages/inkling/src/nodes/<Card>Node.ts` — the shim (assembled class, `$create*`,
 *    dataset type) — and `<Card>NodeComponent.tsx` with its `render<Card>Card`
 *    export, paired in `card-decorate.tsx`'s `CARD_DECORATE_MODULES`
 *    (compile-time exhaustive).
 * 4. `card-commands.ts` — the `*NodeDataset` type, the `INSERT_*` constant, and one
 *    `BUILTIN_INSERT_COMMANDS` entry (compile-time exhaustive).
 * 5. `src/labels/inkling-labels.ts` — `menu.<labelKey>.label`/`.desc` per menu entry.
 * 6. `card-markdown-transformers.ts` — the fence payload, only for
 *    `markdown: { kind: 'fence' }` cards (compile-time exhaustive by fence
 *    declarations, module-init throw as runtime backstop).
 * 7. A new menu icon id (only if needed): the SVG asset plus a `CARD_ICONS` entry.
 *
 * Pins: `card-cross-registry-consistency.test.ts`, `card-declarations.test.ts`,
 * `card-transformer-drift.test.ts`, and `card-layering-imports.test.ts` (keeps the
 * declaration modules React-free and off the wrapper layer).
 */
export const CARD_DECLARATIONS = [
  codeBlockDeclaration,
  horizontalRuleDeclaration,
  imageDeclaration,
  audioDeclaration,
  videoDeclaration,
  calloutDeclaration,
  htmlDeclaration,
  fileDeclaration,
  buttonDeclaration,
  toggleDeclaration,
  headerDeclaration,
  bookmarkDeclaration,
  galleryDeclaration,
  mathDeclaration,
  footnoteDefinitionDeclaration,
]

export type CardNodeType = (typeof CARD_DECLARATIONS)[number]['nodeType']
