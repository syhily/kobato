import { Music2Icon } from 'lucide-react'

import type { Block, MusicPlayerBlock } from '@/shared/pt/schema'

import { Checkbox } from '@/ui/components/checkbox'
import { Label } from '@/ui/components/label'
import { MusicPlayer } from '@/ui/pt/blocks/MusicPlayer'

export function musicBlockIcon(props: { className?: string }) {
  return <Music2Icon {...props} />
}

export function musicBlockTitle() {
  return '音乐播放器'
}

export function patchMusicPlayerFlag(payload: Block, flag: 'auto' | 'center', enabled: boolean): Block {
  if (payload._type !== 'musicPlayer') {
    return payload
  }
  const next: MusicPlayerBlock = { ...payload }
  if (enabled) {
    next[flag] = true
  } else {
    delete next[flag]
  }
  return next
}

interface MusicPlayerOptionsProps {
  stableId: string
  auto: boolean
  center: boolean
  onFlagChange: (flag: 'auto' | 'center', enabled: boolean) => void
}

export function MusicPlayerOptions({ stableId, auto, center, onFlagChange }: MusicPlayerOptionsProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-b border-border/80 pb-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`music-auto-${stableId}`}
          checked={auto}
          onCheckedChange={(v) => onFlagChange('auto', v === true)}
        />
        <Label htmlFor={`music-auto-${stableId}`} className="cursor-pointer text-xs leading-none font-normal">
          自动播放
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`music-center-${stableId}`}
          checked={center}
          onCheckedChange={(v) => onFlagChange('center', v === true)}
        />
        <Label htmlFor={`music-center-${stableId}`} className="cursor-pointer text-xs leading-none font-normal">
          永远居中
        </Label>
      </div>
    </div>
  )
}

export function MusicBlockSummary({ payload }: { payload: MusicPlayerBlock }) {
  return (
    <div className="mt-2">
      <MusicPlayer id={payload.playerId} auto={false} alignment={payload.center ? 'center' : 'start'} />
    </div>
  )
}
