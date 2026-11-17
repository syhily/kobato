import { audioDeclaration } from './audio.declaration'
import { bookmarkDeclaration } from './bookmark.declaration'
import { buttonDeclaration } from './button.declaration'
import { calloutDeclaration } from './callout.declaration'
import { codeBlockDeclaration } from './codeblock.declaration'
import { fileDeclaration } from './file.declaration'
import { footnoteDefinitionDeclaration } from './footnotedefinition.declaration'
import { galleryDeclaration } from './gallery.declaration'
import { headerDeclaration } from './header.declaration'
import { horizontalRuleDeclaration } from './horizontalrule.declaration'
import { htmlDeclaration } from './html.declaration'
import { imageDeclaration } from './image.declaration'
import { mathDeclaration } from './math.declaration'
import { toggleDeclaration } from './toggle.declaration'
import { videoDeclaration } from './video.declaration'

export type { AnyCardDeclaration, CardDeclaration } from './card-declaration'

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
