/* oxlint-disable react/jsx-key */
import type { Meta, StoryObj } from '@storybook/react'

import CenterAlignIcon from '@/assets/icons/inkling-align-center.svg?react'
import LeftAlignIcon from '@/assets/icons/inkling-align-left.svg?react'
import ImgFullIcon from '@/assets/icons/inkling-img-full.svg?react'
import ImgRegularIcon from '@/assets/icons/inkling-img-regular.svg?react'
import ImgWideIcon from '@/assets/icons/inkling-img-wide.svg?react'
import {
  ButtonGroupSetting,
  ColorOptionSetting,
  ColorPickerSetting,
  InputSetting,
  MediaUploadSetting,
  SettingsPanel,
  ToggleSetting,
} from '@/components/ui/SettingsPanel'

const meta = {
  title: 'Settings panel/Settings panel',
  component: SettingsPanel,
  subcomponents: { ToggleSetting, InputSetting, ButtonGroupSetting },
  parameters: {
    status: {
      type: 'uiReady',
    },
  },
} satisfies Meta<typeof SettingsPanel>
export default meta

type Story = StoryObj<typeof meta>

const alignmentButtonGroup = [
  {
    label: 'Left',
    name: 'left',
    Icon: LeftAlignIcon,
  },
  {
    label: 'Center',
    name: 'center',
    Icon: CenterAlignIcon,
  },
]

const widthButtonGroup = [
  {
    label: 'Regular',
    name: 'regular',
    Icon: ImgRegularIcon,
  },
  {
    label: 'Wide',
    name: 'wide',
    Icon: ImgWideIcon,
  },
  {
    label: 'Full',
    name: 'full',
    Icon: ImgFullIcon,
  },
]

const sizeButtonGroup = [
  {
    label: 'S',
    name: 'S',
  },
  {
    label: 'M',
    name: 'M',
  },
  {
    label: 'L',
    name: 'L',
  },
]

export const SignupCard: Story = {
  args: {
    children: [
      <ColorPickerSetting
        label="Background color"
        onPickerChange={() => {}}
        swatches={[
          { title: 'Brand color', accent: true },
          { title: 'Black', hex: '#000000' },
          { title: 'Transparent', transparent: true },
        ]}
        value="#777777"
      />,
    ],
  },
}

export const ButtonCard: Story = {
  args: {
    children: [
      <ButtonGroupSetting buttons={alignmentButtonGroup} label="Content alignment" onClick={() => {}} />,
      <InputSetting label="Button text" onChange={() => {}} placeholder="Add button text" value="" />,
      <InputSetting
        label="Button URL"
        onChange={() => {}}
        placeholder="https://yoursite.com/#/portal/signup/"
        value=""
      />,
    ],
  },
}

const calloutColorPicker = [
  {
    label: 'Grey',
    name: 'grey',
    color: 'bg-grey-100',
  },
  {
    label: 'White',
    name: 'white',
    color: 'bg-white',
  },
  {
    label: 'Blue',
    name: 'blue',
    color: 'bg-blue-100',
  },
  {
    label: 'Green',
    name: 'green',
    color: 'bg-green-100',
  },
  {
    label: 'Yellow',
    name: 'yellow',
    color: 'bg-yellow-100',
  },
  {
    label: 'Red',
    name: 'red',
    color: 'bg-red-100',
  },
  {
    label: 'Pink',
    name: 'pink',
    color: 'bg-pink-100',
  },
  {
    label: 'Purple',
    name: 'purple',
    color: 'bg-purple-100',
  },
  {
    label: 'Accent',
    name: 'accent',
    color: 'bg-pink',
  },
]

export const CalloutCard: Story = {
  args: {
    children: [
      <ColorOptionSetting buttons={calloutColorPicker} label="Background color" layout="stacked" onClick={() => {}} />,
      <ToggleSetting isChecked={false} label="Emoji" onChange={() => {}} />,
    ],
  },
}

export const VideoCard: Story = {
  args: {
    children: [
      <ButtonGroupSetting buttons={widthButtonGroup} label="Video width" onClick={() => {}} />,
      <ToggleSetting
        isChecked={false}
        description="Autoplay your video on a loop without sound."
        label="Loop"
        onChange={() => {}}
      />,
      <MediaUploadSetting
        borderStyle="simple"
        desc=""
        icon="file"
        label="Custom thumbnail"
        onFileChange={() => {}}
        onRemoveMedia={() => {}}
        openImageEditor={() => {}}
        placeholderRef={() => {}}
        setFileInputRef={() => {}}
        size="xsmall"
      />,
    ],
  },
}

export const ProductCard: Story = {
  args: {
    children: [
      <ToggleSetting isChecked={false} label="Rating" onChange={() => {}} />,
      <ToggleSetting isChecked={false} label="Button" onChange={() => {}} />,
      <InputSetting label="Button text" onChange={() => {}} placeholder="Add button text" value="" />,
      <InputSetting
        label="Button URL"
        onChange={() => {}}
        placeholder="https://yoursite.com/#/portal/signup/"
        value=""
      />,
    ],
  },
}

const headerColorPicker = [
  {
    label: 'Dark',
    name: 'black',
    color: 'bg-black',
  },
  {
    label: 'Light',
    name: 'grey-50',
    color: 'bg-grey-50',
  },
  {
    label: 'Accent',
    name: 'pink',
    color: 'bg-pink',
  },
]

export const HeaderCard: Story = {
  args: {
    children: [
      <ButtonGroupSetting buttons={sizeButtonGroup} label="Size" onClick={() => {}} />,
      <ColorOptionSetting buttons={headerColorPicker} label="Style" onClick={() => {}} />,
      <ToggleSetting isChecked={false} label="Button" onChange={() => {}} />,
      <InputSetting label="Button text" onChange={() => {}} placeholder="Add button text" value="" />,
      <InputSetting
        label="Button URL"
        onChange={() => {}}
        placeholder="https://yoursite.com/#/portal/signup/"
        value=""
      />,
    ],
  },
}
