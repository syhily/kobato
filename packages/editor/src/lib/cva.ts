import type { ClassValue } from '@kobato/editor/lib/clsx'

/**
 * Copyright 2022 Joe Bell. All rights reserved.
 *
 * This file is licensed to you under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR REPRESENTATIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
import { clsx } from '@kobato/editor/lib/clsx'

export type ClassPropKey = 'class' | 'className'

export type ClassProp =
  | {
      class: ClassValue
      className?: never
    }
  | { class?: never; className: ClassValue }
  | { class?: never; className?: never }

export type OmitUndefined<T> = T extends undefined ? never : T
export type StringToBoolean<T> = T extends 'true' | 'false' ? boolean : T

export type VariantProps<Component extends (...args: any) => any> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  'class' | 'className'
>

const falsyToString = <T>(value: T) => (typeof value === 'boolean' ? `${value}` : value === 0 ? '0' : value)

/* cx
  ============================================ */

export type CxOptions = Parameters<typeof clsx>
export type CxReturn = ReturnType<typeof clsx>

export const cx = clsx

/* cva
  ============================================ */

type ConfigSchema = Record<string, Record<string, ClassValue>>

type ConfigVariants<T extends ConfigSchema> = {
  [Variant in keyof T]?: StringToBoolean<keyof T[Variant]> | null | undefined
}
type ConfigVariantsMulti<T extends ConfigSchema> = {
  [Variant in keyof T]?: StringToBoolean<keyof T[Variant]> | StringToBoolean<keyof T[Variant]>[] | undefined
}

type Config<T> = T extends ConfigSchema
  ? {
      variants?: T
      defaultVariants?: ConfigVariants<T>
      compoundVariants?: (T extends ConfigSchema
        ? (ConfigVariants<T> | ConfigVariantsMulti<T>) & ClassProp
        : ClassProp)[]
    }
  : never

type Props<T> = T extends ConfigSchema ? ConfigVariants<T> & ClassProp : ClassProp

export const cva =
  <T>(base?: ClassValue, config?: Config<T>) =>
  (props?: Props<T>) => {
    if (config?.variants == null) {
      return cx(base, props?.class, props?.className)
    }

    const { variants, defaultVariants } = config

    const propsRecord = props as Record<string, unknown> | undefined
    const defaultVariantsRecord = defaultVariants as Record<string, unknown> | undefined
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = propsRecord?.[variant]
      const defaultVariantProp = defaultVariantsRecord?.[variant]

      if (variantProp === null) {
        return null
      }

      const variantKey = String(falsyToString(variantProp) || falsyToString(defaultVariantProp))

      return variants[variant][variantKey]
    })

    const propsWithoutUndefined =
      props &&
      Object.entries(props).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (value === undefined) {
          return acc
        }

        acc[key] = value
        return acc
      }, {})

    const getCompoundVariantClassNames = config?.compoundVariants?.reduce(
      (acc, { class: cvClass, className: cvClassName, ...compoundVariantOptions }) =>
        Object.entries(compoundVariantOptions).every(([key, value]) =>
          Array.isArray(value)
            ? value.includes(
                {
                  ...defaultVariants,
                  ...propsWithoutUndefined,
                }[key],
              )
            : {
                ...defaultVariants,
                ...propsWithoutUndefined,
              }[key] === value,
        )
          ? acc.concat(cvClass, cvClassName)
          : acc,
      [] as ClassValue[],
    )

    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props?.class, props?.className)
  }
