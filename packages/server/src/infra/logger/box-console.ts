type BoxStyle = 'single' | 'double' | 'round' | 'bold'

interface BoxChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
}

const STYLES: Record<BoxStyle, BoxChars> = {
  single: { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', horizontal: '─', vertical: '│' },
  double: { topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝', horizontal: '═', vertical: '║' },
  round: { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│' },
  bold: { topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛', horizontal: '━', vertical: '┃' },
}

interface BoxLogOptions {
  style?: BoxStyle
  padding?: number
  title?: string
  align?: 'left' | 'center' | 'right'
}

export function boxLog(lines: string | readonly string[], options: BoxLogOptions = {}): void {
  const { style = 'double', padding = 2, title, align = 'left' } = options

  const chars = STYLES[style]
  const normalizedLines: readonly string[] = typeof lines === 'string' ? [lines] : lines

  const contentWidth = Math.max(...normalizedLines.map((line) => line.length), title?.length ?? 0)

  const innerWidth = contentWidth + padding * 2
  const border = chars.horizontal.repeat(innerWidth)

  const alignText = (text: string, width: number): string => {
    const padLength = width - text.length
    if (align === 'center') {
      const left = Math.floor(padLength / 2)
      return ' '.repeat(left) + text + ' '.repeat(padLength - left)
    }
    if (align === 'right') {
      return ' '.repeat(padLength) + text
    }
    // 'left' is the only remaining case
    return text + ' '.repeat(padLength)
  }

  const padLine = (text: string): string =>
    chars.vertical + ' '.repeat(padding) + alignText(text, contentWidth) + ' '.repeat(padding) + chars.vertical

  const output: string[] = []

  if (title) {
    const titleLen = title.length + 2
    const leftBorder = chars.horizontal.repeat(2)
    const rightBorder = chars.horizontal.repeat(Math.max(0, innerWidth - 2 - titleLen))
    output.push(chars.topLeft + leftBorder + ` ${title} ` + rightBorder + chars.topRight)
  } else {
    output.push(chars.topLeft + border + chars.topRight)
  }

  normalizedLines.forEach((line) => output.push(padLine(line)))
  output.push(chars.bottomLeft + border + chars.bottomRight)

  // eslint-disable-next-line no-console
  console.log(output.join('\n'))
}
