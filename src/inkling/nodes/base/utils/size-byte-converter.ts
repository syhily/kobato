export function sizeToBytes(size: string) {
  if (!size) {
    return 0
  }
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const sizeParts = size.split(' ')
  const sizeNumber = parseFloat(sizeParts[0])
  const sizeUnit = sizeParts[1]
  const sizeUnitIndex = sizes.indexOf(sizeUnit)
  if (sizeUnitIndex === -1) {
    return 0
  }
  return Math.round(sizeNumber * Math.pow(1024, sizeUnitIndex))
}

export function bytesToSize(bytes: number) {
  if (!bytes) {
    return '0 Byte'
  }
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  // clamp to the largest unit — past TB the unclamped index read sizes[5+]
  // (undefined) and produced strings like '1 undefined'
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i]
}
