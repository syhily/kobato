import { audioDeclaration } from '@/inkling/nodes/cards/audio.declaration'
import { bookmarkDeclaration } from '@/inkling/nodes/cards/bookmark.declaration'
import { buttonDeclaration } from '@/inkling/nodes/cards/button.declaration'
import { calloutDeclaration } from '@/inkling/nodes/cards/callout.declaration'
import { codeBlockDeclaration } from '@/inkling/nodes/cards/codeblock.declaration'
import { fileDeclaration } from '@/inkling/nodes/cards/file.declaration'
import { footnoteDefinitionDeclaration } from '@/inkling/nodes/cards/footnotedefinition.declaration'
import { galleryDeclaration } from '@/inkling/nodes/cards/gallery.declaration'
import { headerDeclaration } from '@/inkling/nodes/cards/header.declaration'
import { horizontalRuleDeclaration } from '@/inkling/nodes/cards/horizontalrule.declaration'
import { htmlDeclaration } from '@/inkling/nodes/cards/html.declaration'
import { imageDeclaration } from '@/inkling/nodes/cards/image.declaration'
import { mathDeclaration } from '@/inkling/nodes/cards/math.declaration'
import { toggleDeclaration } from '@/inkling/nodes/cards/toggle.declaration'
import { videoDeclaration } from '@/inkling/nodes/cards/video.declaration'

export type { CardDeclaration } from '@/inkling/nodes/cards/card-declaration'

/**
 * The card declarations — the single per-card source of truth (CONTEXT.md:
 * "card declaration"). Every node-set registry and per-card registry is a
 * derived view over this list.
 *
 * The declaration order reproduces the pre-refactor card run of
 * `@/inkling/nodes/DefaultNodes`; the base `DEFAULT_NODES` in `@/inkling/nodes/base` had a
 * different historical order and pins it explicitly at the derivation site.
 *
 * ADDING A CARD — the full touch-point list:
 *
 * 1. `src/nodes/base/nodes/<card>/` — the React-free base node (properties,
 *    renderers, importSpec) built with `generateDecoratorNode`.
 * 2. `<card>.declaration.ts` beside this file + one entry in
 *    `CARD_DECLARATIONS` below (position = node-set order). The declaration
 *    names its menu commands by string (`CardMenuCommand`) and its markdown
 *    eligibility by spec (`CardMarkdownSpec`) — it imports no registry table.
 * 3. `src/nodes/<Card>Node.ts` — the shim (assembled class, `$create*`,
 *    dataset type) and `src/nodes/<Card>NodeComponent.tsx` with its
 *    `render<Card>Card` export, paired in
 *    `card-decorate.tsx`'s `CARD_DECORATE_MODULES` (compile-time exhaustive).
 * 4. `card-commands.ts` — the `*NodeDataset` type, the `INSERT_*` constant,
 *    and one entry in `BUILTIN_INSERT_COMMANDS` (compile-time exhaustive);
 *    `card-cross-registry-consistency.test.ts` pins resolution identity.
 * 5. `src/labels/inkling-labels.ts` — `menu.<labelKey>.label`/`.desc` for
 *    each menu entry; `card-declarations.test.ts` pins both directions.
 * 6. `card-markdown-transformers.ts` — the fence payload, only for
 *    `markdown: { kind: 'fence' }` cards (compile-time exhaustive keyed by
 *    the fence declarations; module-init throw as runtime backstop);
 *    `card-transformer-drift.test.ts` pins the field vocabulary.
 * 7. A new menu icon id (only if the card needs one): the SVG asset plus one
 *    entry in `card-menus.ts`'s `CARD_ICONS` (compile-time exhaustive).
 *
 * Steps 3–6 are enforced by the guards named; `card-layering-imports.test.ts`
 * keeps the declaration modules React-free and off the wrapper layer.
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
