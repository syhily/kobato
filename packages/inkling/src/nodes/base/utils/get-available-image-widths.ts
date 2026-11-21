export const getAvailableImageWidths = function (
  image: { width: number },
  imageSizes: Record<string, { width: number }>,
) {
  const imageWidths = Object.values(imageSizes)
    .map(({ width }) => width)
    .sort((a, b) => a - b)

  const availableImageWidths = imageWidths.filter((width) => width <= image.width)

  if (
    image.width > availableImageWidths[availableImageWidths.length - 1] &&
    image.width < imageWidths[imageWidths.length - 1]
  ) {
    availableImageWidths.push(image.width)
  }

  return availableImageWidths
}
