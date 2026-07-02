import { type Photo } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

export interface IUnsplashProvider {
  fetchPhotos(): Promise<Photo[]>
  fetchNextPage(): Promise<Photo[] | null>
  searchPhotos(term: string): Promise<Photo[]>
  triggerDownload(photo: Pick<Photo, 'links'>): Promise<void> | void
  searchIsRunning(): boolean
}
