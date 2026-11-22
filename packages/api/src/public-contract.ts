import { avatarContract } from '@kobato/api/rpc/public/avatar'
import { commentsContract } from '@kobato/api/rpc/public/comments'
import { contentContract } from '@kobato/api/rpc/public/content'
import { githubContract } from '@kobato/api/rpc/public/github'
import { imagesContract } from '@kobato/api/rpc/public/images'
import { musicContract } from '@kobato/api/rpc/public/music'
import { webmentionsContract } from '@kobato/api/rpc/public/webmentions'

export const publicContract = {
  content: contentContract,
  comments: commentsContract,
  webmentions: webmentionsContract,
  avatar: avatarContract,
  github: githubContract,
  images: imagesContract,
  music: musicContract,
}
