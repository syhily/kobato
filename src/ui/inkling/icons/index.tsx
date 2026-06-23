/**
 * Koenig editor icon set — SVG paths ported from Ghost's koenig-lexical
 * (packages/koenig-lexical/src/assets/icons/kg-*.svg).
 *
 * Each icon uses `stroke="currentColor"` so it inherits the text color from
 * Tailwind utility classes (text-black, text-green-600, etc.), matching
 * Koenig's design exactly. The viewBox is 0 0 24 24 for all icons.
 *
 * We inline the SVG paths as React components rather than importing .svg
 * files because the project has no vite-plugin-svgr / `?react` pipeline —
 * all other icons in the codebase use lucide-react (pre-built React SVGs).
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function svgProps(props: IconProps): IconProps {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none',
    viewBox: '0 0 24 24',
    ...props,
  }
}

export function BoldIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 2v10h8a5 5 0 0 0 0-10H3m2 20V12h9c3.314 0 6 2.238 6 5s-2.686 5-6 5H3"
      />
    </svg>
  )
}

export function ItalicIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 2h-9.333m-1.334 20H2m4.667 0L17.333 2"
      />
    </svg>
  )
}

export function HeadingTwoIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M4 22V12M4 2v10m0 0h16m0-10v20" />
    </svg>
  )
}

export function HeadingThreeIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 19.5v-6.25M7 7v6.25m0 0h10M17 7v12.5"
      />
    </svg>
  )
}

export function QuoteIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12h8v10H1V12Zm0 0C1 5 2.75 3.344 6 2m8 10h8v10h-8V12Zm0 0c0-7 1.75-8.656 5-10"
      />
    </svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.54 10.46c2.2 2.2 2.2 5.61 0 7.81l-3.08 3.08c-2.2 2.2-5.61 2.2-7.81 0-2.2-2.2-2.2-5.61 0-7.81L5.4 10.9"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.46 13.54c-2.2-2.2-2.2-5.61 0-7.81l3.08-3.08c2.2-2.2 5.61-2.2 7.81 0 2.2 2.2 2.2 5.61 0 7.81L18.6 13.1"
      />
    </svg>
  )
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.2 4.3 5.5 5.5m-11 11L1 23l2.2-7.7L16.856 1.644a2.2 2.2 0 0 1 3.11 0l2.39 2.39a2.2 2.2 0 0 1 0 3.11L8.7 20.8Z"
      />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1.917 5.583h20.166m-8.02-3.666H9.936a1.375 1.375 0 0 0-1.374 1.375v2.291h6.874V3.292a1.375 1.375 0 0 0-1.374-1.375ZM9.938 17.27v-6.874m4.125 6.874v-6.874"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.288 20.818a1.366 1.366 0 0 1-1.366 1.265H7.077a1.366 1.366 0 0 1-1.365-1.265L4.438 5.583h15.125l-1.275 15.235Z"
      />
    </svg>
  )
}
