// @vitest-environment happy-dom

import type { ReactElement } from 'react'

import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The unit setup registers an inert `sonner` stub; this file asserts the real
// `<Toaster />` container label, so restore the actual module.
vi.mock('sonner', async (importOriginal) => importOriginal<typeof import('sonner')>())

import type { AppLocale } from '@/shared/i18n/locales'

import { renderWithI18n } from '#/_helpers/i18n-render'
import { Dialog, DialogContent, DialogTitle } from '@/ui/components/dialog'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationNext,
  PaginationPrevious,
} from '@/ui/components/pagination'
import { Sheet, SheetContent, SheetTitle } from '@/ui/components/sheet'
import { SidebarProvider, SidebarTrigger } from '@/ui/components/sidebar'
import { Toaster } from '@/ui/components/sonner'
import { Table, TableBody, TableCell, TableRow } from '@/ui/components/table'

function render(node: ReactElement, locale: AppLocale) {
  return renderWithI18n(node, { locale })
}

describe('shared primitives — zh-CN', () => {
  it('labels the pagination group and its controls', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationPrevious />
          <PaginationEllipsis />
          <PaginationNext />
        </PaginationContent>
      </Pagination>,
      'zh-CN',
    )

    expect(screen.getByRole('navigation', { name: '分页' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '上一页' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '下一页' })).toBeTruthy()
    expect(screen.getByText('更多')).toBeTruthy()
  })

  it('localizes the table region, dialog close and sheet close', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
      'zh-CN',
    )
    expect(screen.getByRole('region', { name: '数据表格' })).toBeTruthy()
  })

  it('names the dialog and sheet close buttons', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>标题</DialogTitle>
        </DialogContent>
      </Dialog>,
      'zh-CN',
    )
    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy()
    screen.getByRole('button', { name: '关闭' }).click()

    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>抽屉</SheetTitle>
        </SheetContent>
      </Sheet>,
      'zh-CN',
    )
    expect(screen.getAllByRole('button', { name: '关闭' }).length).toBeGreaterThan(0)
  })

  it('labels the sidebar trigger', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>,
      'zh-CN',
    )
    expect(screen.getByRole('button', { name: '切换侧边栏' })).toBeTruthy()
  })

  it('labels the toast region', () => {
    render(<Toaster />, 'zh-CN')
    expect(screen.getByLabelText(/^通知/)).toBeTruthy()
  })
})

describe('shared primitives — en-US', () => {
  it('labels the pagination group and its controls', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationPrevious />
          <PaginationEllipsis />
          <PaginationNext />
        </PaginationContent>
      </Pagination>,
      'en-US',
    )

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
    expect(screen.getByText('More pages')).toBeTruthy()
  })

  it('localizes the table region, dialog close and sheet close', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
      'en-US',
    )
    expect(screen.getByRole('region', { name: 'Data table' })).toBeTruthy()
  })

  it('names the dialog and sheet close buttons', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
      'en-US',
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()

    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Drawer</SheetTitle>
        </SheetContent>
      </Sheet>,
      'en-US',
    )
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })

  it('labels the sidebar trigger', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>,
      'en-US',
    )
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeTruthy()
  })

  it('labels the toast region', () => {
    render(<Toaster />, 'en-US')
    expect(screen.getByLabelText(/^Notifications/)).toBeTruthy()
  })
})

describe('combobox defaults', () => {
  it('falls back to the localized placeholder and empty copy when no props are given', async () => {
    const { SettingsCombobox } = await import('@/ui/admin/settings/shell/SettingsCombobox')
    const { ComboboxContent, ComboboxTrigger, ComboboxValue } = await import('@/ui/components/combobox')

    render(
      <SettingsCombobox<{ value: string; label: string }>
        name="zone"
        items={[{ value: 'UTC', label: 'UTC' }]}
        value={{ value: 'UTC', label: 'UTC' }}
        save={() => {}}
      >
        <ComboboxTrigger aria-label="timezone">
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent<{ value: string; label: string }>>
          {(item) => <div key={item.value}>{item.label}</div>}
        </ComboboxContent>
      </SettingsCombobox>,
      'en-US',
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'timezone' }))
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } })
    expect(await screen.findByText('No matching results')).toBeTruthy()
  })
})
