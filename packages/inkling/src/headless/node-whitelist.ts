export const ROOT_NODE_TYPE = 'root'

export const SOLUTION_NODE_TYPE = 'solution'
export const TWO_COLUMN_NODE_TYPE = 'two-column'
export const MUSIC_PLAYER_NODE_TYPE = 'music-player'
export const KOBATO_HOST_CARD_NODE_TYPES = [SOLUTION_NODE_TYPE, TWO_COLUMN_NODE_TYPE, MUSIC_PLAYER_NODE_TYPE] as const

export const FULL_EDITOR_NODE_TYPES = [
  'paragraph',
  'linebreak',
  'extended-text',
  'extended-heading',
  'extended-quote',
  'list',
  'listitem',
  'link',
  'autolink',
  'image',
  'codeblock',
  'math',
  'math-inline',
  'footnote-ref',
  'footnotedefinition',
  'horizontalrule',
  'table',
  'tablerow',
  'tablecell',
  ...KOBATO_HOST_CARD_NODE_TYPES,
] as const

export type FullEditorNodeType = (typeof FULL_EDITOR_NODE_TYPES)[number]

export const COMMENT_NODE_TYPES = [
  'paragraph',
  'linebreak',
  'extended-text',
  'extended-quote',
  'list',
  'listitem',
  'link',
  'autolink',
  'codeblock',
  'math',
  'math-inline',
] as const

export type CommentNodeType = (typeof COMMENT_NODE_TYPES)[number]
