/**
 * Koenig editor icon set — SVG paths copied verbatim from Ghost's
 * koenig-lexical (packages/koenig-lexical/src/assets/icons/kg-*.svg).
 *
 * Each icon uses `stroke="currentColor"` so it inherits the text color from
 * Tailwind utility classes (text-black, text-green-600, etc.), matching
 * Koenig's design exactly.
 *
 * Inlined as React components because the project has no vite-plugin-svgr.
 */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function svg(props: IconProps): IconProps {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none',
    viewBox: '0 0 24 24',
    ...props,
  }
}

export function AddIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M12 2v20m10-10H2" />
    </svg>
  )
}

export function BoldIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 2v10h8a5 5 0 0 0 0-10H3m2 20V12h9c3.314 0 6 2.238 6 5s-2.686 5-6 5H3"
      />
    </svg>
  )
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m14.2 4.3 5.5 5.5m-11 11L1 23l2.2-7.7L16.856 1.644a2.2 2.2 0 0 1 3.11 0l2.39 2.39a2.2 2.2 0 0 1 0 3.11L8.7 20.8Z"
      />
    </svg>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1.373 13.33A2.528 2.528 0 0 1 1 12c0-.476.13-.94.373-1.33C2.946 8.163 6.819 3 12 3c5.181 0 9.054 5.164 10.627 7.67.243.39.373.854.373 1.33 0 .476-.13.94-.373 1.33C21.054 15.837 17.181 21 12 21c-5.181 0-9.054-5.164-10.627-7.67Z"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
      />
    </svg>
  )
}

export function HeadingThreeIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 19.5v-6.25M7 7v6.25m0 0h10M17 7v12.5"
      />
    </svg>
  )
}

export function HeadingTwoIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M4 22V12M4 2v10m0 0h16m0-10v20" />
    </svg>
  )
}

export function ItalicIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 2h-9.333m-1.334 20H2m4.667 0L17.333 2"
      />
    </svg>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
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

export function QuoteIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12h8v10H1V12Zm0 0C1 5 2.75 3.344 6 2m8 10h8v10h-8V12Zm0 0c0-7 1.75-8.656 5-10"
      />
    </svg>
  )
}

export function QuoteOneIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12h8v10H1V12Zm0 0C1 5 2.75 3.344 6 2m8 10h8m-8 0v10h4m-4-10c0-7 1.75-8.656 5-10m1.7 14.4 1.75-1.4h.35v7"
      />
    </svg>
  )
}

export function QuoteTwoIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12h8v10H1V12Zm0 0C1 5 2.75 3.344 6 2m8 10h8m-8 0v10h2m-2-10c0-7 1.75-8.656 5-10m.5 13.583c.517-.311 1.275-.559 1.878-.583 1.195 0 2.22.512 2.22 1.878-.015 2.205-4.098 4.78-4.098 4.78V22h4.098"
      />
    </svg>
  )
}

export function SnippetIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 13.667V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9.667M22 13.667 13.667 22M22 13.667h-6.333a2 2 0 0 0-2 2V22"
      />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...svg(props)}>
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

export function WandIcon(props: IconProps) {
  return (
    <svg {...svg({ ...props, viewBox: '0 0 24 25' })}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 21.094 3.913 24 17 10.906 14.125 8 1 21.094ZM11 11l3 3M5.25 4.25a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-2.5-2.5Zm12 0a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-2.5-2.5Zm0 11.99a2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-2.5-2.5Z"
      />
    </svg>
  )
}
