import type { Editor } from '@tiptap/core'

import { BubbleMenu } from '@tiptap/react/menus'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/select'

// Floating language picker for `codeBlock` — the curated list stays small because Shiki's full set (~200 grammars) is unusable in a dropdown.
interface LanguageOption {
  value: string
  label: string
}

interface LanguageGroup {
  label: string
  options: LanguageOption[]
}

const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    label: '通用',
    options: [
      { value: 'plaintext', label: '纯文本' },
      { value: 'bash', label: 'Bash' },
      { value: 'shell', label: 'Shell' },
      { value: 'powershell', label: 'PowerShell' },
      { value: 'diff', label: 'Diff' },
      { value: 'http', label: 'HTTP' },
    ],
  },
  {
    label: '前端',
    options: [
      { value: 'html', label: 'HTML' },
      { value: 'css', label: 'CSS' },
      { value: 'scss', label: 'SCSS' },
      { value: 'javascript', label: 'JavaScript' },
      { value: 'typescript', label: 'TypeScript' },
      { value: 'jsx', label: 'JSX' },
      { value: 'tsx', label: 'TSX' },
      { value: 'vue', label: 'Vue' },
      { value: 'svelte', label: 'Svelte' },
    ],
  },
  {
    label: '后端 / 系统',
    options: [
      { value: 'python', label: 'Python' },
      { value: 'java', label: 'Java' },
      { value: 'kotlin', label: 'Kotlin' },
      { value: 'go', label: 'Go' },
      { value: 'rust', label: 'Rust' },
      { value: 'c', label: 'C' },
      { value: 'cpp', label: 'C++' },
      { value: 'csharp', label: 'C#' },
      { value: 'php', label: 'PHP' },
      { value: 'ruby', label: 'Ruby' },
      { value: 'swift', label: 'Swift' },
      { value: 'objective-c', label: 'Objective-C' },
      { value: 'scala', label: 'Scala' },
      { value: 'dart', label: 'Dart' },
      { value: 'lua', label: 'Lua' },
    ],
  },
  {
    label: '数据 / 配置',
    options: [
      { value: 'json', label: 'JSON' },
      { value: 'yaml', label: 'YAML' },
      { value: 'toml', label: 'TOML' },
      { value: 'xml', label: 'XML' },
      { value: 'sql', label: 'SQL' },
      { value: 'graphql', label: 'GraphQL' },
      { value: 'dockerfile', label: 'Dockerfile' },
      { value: 'nginx', label: 'Nginx' },
      { value: 'markdown', label: 'Markdown' },
      { value: 'tex', label: 'TeX / LaTeX' },
    ],
  },
]

const KNOWN_VALUES = new Set(LANGUAGE_GROUPS.flatMap((group) => group.options.map((option) => option.value)))

const PLACEHOLDER_VALUE = 'plaintext'

const CODE_BLOCK_BUBBLE_MENU_OPTIONS = { placement: 'top' as const, offset: 8 }

export interface CodeBlockBubbleMenuProps {
  editor: Editor
}

export function CodeBlockBubbleMenu({ editor }: CodeBlockBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      options={CODE_BLOCK_BUBBLE_MENU_OPTIONS}
      shouldShow={({ editor: instance }) => instance.isEditable && instance.isActive('codeBlock')}
      className="z-50 rounded-xl border bg-popover text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-xs text-muted-foreground">代码语言</span>
        <LanguageSelect editor={editor} />
      </div>
    </BubbleMenu>
  )
}

interface LanguageSelectProps {
  editor: Editor
}

function LanguageSelect({ editor }: LanguageSelectProps) {
  const raw: unknown = editor.getAttributes('codeBlock').language
  const current = typeof raw === 'string' && raw !== '' ? raw : PLACEHOLDER_VALUE
  const isKnown = KNOWN_VALUES.has(current)
  return (
    <Select
      value={isKnown ? current : PLACEHOLDER_VALUE}
      onValueChange={(value: string | null) => {
        if (typeof value !== 'string') {
          return
        }
        const next = value === PLACEHOLDER_VALUE ? null : value
        editor.chain().focus().updateAttributes('codeBlock', { language: next }).run()
      }}
    >
      <SelectTrigger size="sm" className="h-7 min-w-32" aria-label="代码语言">
        <SelectValue placeholder="选择语言">
          {(value) => labelFor(typeof value === 'string' ? value : '') ?? (isKnown ? '' : current)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGE_GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function labelFor(value: string): string | undefined {
  for (const group of LANGUAGE_GROUPS) {
    const match = group.options.find((option) => option.value === value)
    if (match) {
      return match.label
    }
  }
  return undefined
}
