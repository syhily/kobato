// purely for testing purposes
import fixturePhotosDataset from '@/ui/inkling-editor/unsplash/api/dataFixtures.json'
import { type Photo } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

// oxlint-disable-next-line typescript/no-explicit-any
export const fixturePhotos: Photo[] = fixturePhotosDataset as unknown as Photo[]
