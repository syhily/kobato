import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/ui/components/card'
import { Checkbox } from '@/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/components/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/ui/components/empty'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/ui/components/field'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { Input } from '@/ui/components/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from '@/ui/components/input-group'
import { Label } from '@/ui/components/label'
import { NumberFlow } from '@/ui/components/number-flow'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/ui/components/pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/components/popover'
import { RadioGroup, RadioGroupItem } from '@/ui/components/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'
import { Separator } from '@/ui/components/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/components/sheet'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/ui/components/sidebar'
import { Skeleton } from '@/ui/components/skeleton'
import { Toaster } from '@/ui/components/sonner'
import { Switch } from '@/ui/components/switch'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/ui/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/components/tabs'
import { Textarea } from '@/ui/components/textarea'
import { Tooltip } from '@/ui/components/tooltip'

describe('snapshot: Button primitives', () => {
  it('renders the default variant', () => {
    const html = renderToHtml(<Button>Click me</Button>)
    expect(html).toContain('Click me')
    expect(html).toContain('data-slot="button"')
    expect(html).toContain('type="button"')
  })

  it('renders the submit type', () => {
    const html = renderToHtml(<Button type="submit">Submit</Button>)
    expect(html).toContain('type="submit"')
  })

  it('renders the destructive variant', () => {
    const html = renderToHtml(<Button variant="destructive">Delete</Button>)
    expect(html).toContain('Delete')
  })

  it('renders the icon size', () => {
    const html = renderToHtml(<Button size="icon">+</Button>)
    expect(html).toContain('+')
  })

  it('renders the block layout', () => {
    const html = renderToHtml(<Button block>Block</Button>)
    expect(html).toContain('Block')
  })

  it('renders the circle shape', () => {
    const html = renderToHtml(<Button shape="circle">O</Button>)
    expect(html).toContain('O')
  })
})

describe('snapshot: Badge primitives', () => {
  it('renders the default badge', () => {
    const html = renderToHtml(<Badge>New</Badge>)
    expect(html).toContain('New')
    expect(html).toContain('data-slot="badge"')
  })

  it('renders the outline variant', () => {
    const html = renderToHtml(<Badge variant="outline">Outline</Badge>)
    expect(html).toContain('Outline')
  })
})

describe('snapshot: Avatar primitives', () => {
  it('renders an avatar with fallback', () => {
    const html = renderToHtml(
      <Avatar>
        <AvatarImage src="/avatar.png" alt="User" />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>,
    )
    expect(html).toContain('data-slot="avatar"')
    expect(html).toContain('data-slot="avatar-fallback"')
    expect(html).toContain('U')
  })
})

describe('snapshot: Empty primitives', () => {
  it('renders the empty state with all slots', () => {
    const html = renderToHtml(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">📭</EmptyMedia>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>Try again later.</EmptyDescription>
        </EmptyHeader>
      </Empty>,
    )
    expect(html).toContain('data-slot="empty"')
    expect(html).toContain('Nothing here')
    expect(html).toContain('Try again later.')
  })
})

describe('snapshot: Skeleton primitive', () => {
  it('renders a skeleton placeholder', () => {
    const html = renderToHtml(<Skeleton className="h-4 w-20" />)
    expect(html).toContain('data-slot="skeleton"')
  })
})

describe('snapshot: Card primitives', () => {
  it('renders a card with all subcomponents', () => {
    const html = renderToHtml(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description.</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(html).toContain('data-slot="card"')
    expect(html).toContain('data-slot="card-header"')
    expect(html).toContain('Card Title')
    expect(html).toContain('Card description.')
    expect(html).toContain('Content')
    expect(html).toContain('Footer')
  })
})

describe('snapshot: Checkbox primitive', () => {
  it('renders a checkbox', () => {
    const html = renderToHtml(<Checkbox defaultChecked />)
    expect(html).toContain('data-slot="checkbox"')
    expect(html).toContain('role="checkbox"')
  })
})

describe('snapshot: Dialog primitives', () => {
  it('renders the dialog trigger on SSR; content is client-only', () => {
    const html = renderToHtml(
      <Dialog defaultOpen>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description.</DialogDescription>
          </DialogHeader>
          <div>Body</div>
          <DialogFooter>Footer</DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    expect(html).toContain('Open')
    expect(html).toContain('data-slot="dialog-trigger"')
    expect(html).not.toContain('Dialog Title')
  })
})

describe('snapshot: DropdownMenu primitives', () => {
  it('renders the dropdown trigger on SSR; items are client-only', () => {
    const html = renderToHtml(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(html).toContain('Menu')
    expect(html).toContain('data-slot="dropdown-menu-trigger"')
    expect(html).not.toContain('Item 1')
  })
})

describe('snapshot: Field primitives', () => {
  it('renders a field set with label, description, and error', () => {
    const html = renderToHtml(
      <FieldSet>
        <FieldLegend>Preferences</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <FieldContent>
              <Input id="email" />
              <FieldDescription>Your email address.</FieldDescription>
              <FieldError errors={[{ message: 'Invalid email' }]} />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>,
    )
    expect(html).toContain('data-slot="field-set"')
    expect(html).toContain('Preferences')
    expect(html).toContain('Email')
    expect(html).toContain('Your email address.')
    expect(html).toContain('Invalid email')
  })
})

describe('snapshot: Input primitive', () => {
  it('renders an input with size variant', () => {
    const html = renderToHtml(<Input placeholder="Type here" size="lg" />)
    expect(html).toContain('data-slot="input"')
    expect(html).toContain('placeholder="Type here"')
  })
})

describe('snapshot: InputGroup primitives', () => {
  it('renders an input group with addon, text, button, and input', () => {
    const html = renderToHtml(
      <InputGroup>
        <InputGroupAddon>$</InputGroupAddon>
        <InputGroupInput placeholder="Amount" />
        <InputGroupText>USD</InputGroupText>
        <InputGroupButton>Send</InputGroupButton>
      </InputGroup>,
    )
    expect(html).toContain('data-slot="input-group"')
    expect(html).toContain('data-slot="input-group-addon"')
    expect(html).toContain('Amount')
    expect(html).toContain('USD')
    expect(html).toContain('Send')
  })

  it('renders an input group textarea', () => {
    const html = renderToHtml(
      <InputGroup>
        <InputGroupTextarea placeholder="Notes" />
      </InputGroup>,
    )
    expect(html).toContain('data-slot="input-group-control"')
    expect(html).toContain('placeholder="Notes"')
  })
})

describe('snapshot: Label primitive', () => {
  it('renders a label', () => {
    const html = renderToHtml(<Label htmlFor="name">Name</Label>)
    expect(html).toContain('data-slot="label"')
    expect(html).toContain('Name')
  })
})

describe('snapshot: NumberFlow primitive', () => {
  it('renders a numeric value as digit columns', () => {
    const html = renderToHtml(<NumberFlow value={42} />)
    expect(html).toContain('aria-label="42"')
    expect(html).toContain('42')
  })
})

describe('snapshot: Pagination primitives', () => {
  it('renders pagination controls', () => {
    const html = renderToHtml(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink isActive>1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    )
    expect(html).toContain('data-slot="pagination"')
    expect(html).toContain('data-slot="pagination-link"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('更多')
  })
})

describe('snapshot: Popover primitives', () => {
  it('renders the popover trigger on SSR; content is client-only', () => {
    const html = renderToHtml(
      <Popover defaultOpen>
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Popover content</PopoverContent>
      </Popover>,
    )
    expect(html).toContain('Trigger')
    expect(html).toContain('data-slot="popover-trigger"')
    expect(html).not.toContain('Popover content')
  })
})

describe('snapshot: RadioGroup primitives', () => {
  it('renders a radio group', () => {
    const html = renderToHtml(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>,
    )
    expect(html).toContain('data-slot="radio-group"')
    expect(html).toContain('data-slot="radio-group-item"')
  })
})

describe('snapshot: Select primitives', () => {
  it('renders the select trigger and value on SSR; items are client-only', () => {
    const html = renderToHtml(
      <Select defaultOpen defaultValue="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Option A</SelectItem>
          <SelectItem value="b">Option B</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(html).toContain('data-slot="select-trigger"')
    expect(html).toContain('data-slot="select-value"')
    expect(html).not.toContain('data-slot="select-content"')
  })
})

describe('snapshot: Separator primitive', () => {
  it('renders horizontal and vertical separators', () => {
    const html = renderToHtml(
      <>
        <Separator />
        <Separator orientation="vertical" />
      </>,
    )
    expect(html).toContain('data-slot="separator"')
    expect(html).toContain('data-orientation="horizontal"')
    expect(html).toContain('data-orientation="vertical"')
  })
})

describe('snapshot: Sheet primitives', () => {
  it('renders the sheet trigger on SSR; content is client-only', () => {
    const html = renderToHtml(
      <Sheet defaultOpen>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
          </SheetHeader>
          <div>Sheet body</div>
        </SheetContent>
      </Sheet>,
    )
    expect(html).toContain('Open')
    expect(html).toContain('data-slot="sheet-trigger"')
    expect(html).not.toContain('Sheet Title')
  })
})

describe('snapshot: Sidebar primitives', () => {
  it('renders a desktop sidebar inside a provider', () => {
    const html = renderToHtml(
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>Header</SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Home</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>,
    )
    expect(html).toContain('Header')
    expect(html).toContain('Home')
    expect(html).toContain('data-slot="sidebar-menu-button"')
  })
})

describe('snapshot: Sonner primitive', () => {
  it('renders the toaster', () => {
    const html = renderToHtml(<Toaster />)
    expect(html).toContain('通知')
  })
})

describe('snapshot: Switch primitive', () => {
  it('renders a switch', () => {
    const html = renderToHtml(<Switch defaultChecked />)
    expect(html).toContain('data-slot="switch"')
    expect(html).toContain('role="switch"')
  })
})

describe('snapshot: Table primitives', () => {
  it('renders a table with head, body, caption, and rows', () => {
    const html = renderToHtml(
      <Table>
        <TableCaption>A sample table</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>42</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(html).toContain('data-slot="table"')
    expect(html).toContain('A sample table')
    expect(html).toContain('Alice')
    expect(html).toContain('42')
  })
})

describe('snapshot: Tabs primitives', () => {
  it('renders a tab list with panels', () => {
    const html = renderToHtml(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
          <TabsTrigger value="b">Tab B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Content A</TabsContent>
        <TabsContent value="b">Content B</TabsContent>
      </Tabs>,
    )
    expect(html).toContain('data-slot="tabs"')
    expect(html).toContain('Tab A')
    expect(html).toContain('Tab B')
    expect(html).toContain('Content A')
  })
})

describe('snapshot: Textarea primitive', () => {
  it('renders a textarea', () => {
    const html = renderToHtml(<Textarea placeholder="Write something" />)
    expect(html).toContain('data-slot="textarea"')
    expect(html).toContain('placeholder="Write something"')
  })
})

describe('snapshot: Tooltip primitives', () => {
  it('renders a tooltip trigger', () => {
    const html = renderToHtml(
      <Tooltip.Root>
        <Tooltip.Trigger>Hover me</Tooltip.Trigger>
        <Tooltip.Content>Tooltip text</Tooltip.Content>
      </Tooltip.Root>,
    )
    expect(html).toContain('Hover me')
  })
})

describe('snapshot: IconButtonContent primitive', () => {
  it('renders centered icon content', () => {
    const html = renderToHtml(
      <IconButtonContent>
        <span data-icon>icon</span>
      </IconButtonContent>,
    )
    expect(html).toContain('icon')
  })
})
