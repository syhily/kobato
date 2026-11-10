export const getAvailableImageWidths = function (
  image: { width: number },
  imageSizes: Record<string, { width: number }>,
) {
  // get a sorted list of the available responsive widths
  const imageWidths = Object.values(imageSizes)
    .map(({ width }) => width)
    .sort((a, b) => a - b)

  // select responsive widths that are usable based on the image width
  const availableImageWidths = imageWidths.filter((width) => width <= image.width)

  // add the original image size to the responsive list if it's not captured by largest responsive size
  // - the original `src` may not have been resized to a standard width, and omitting it
  //   would serve smaller images than necessary
  if (
    image.width > availableImageWidths[availableImageWidths.length - 1] &&
    image.width < imageWidths[imageWidths.length - 1]
  ) {
    availableImageWidths.push(image.width)
  }

  return availableImageWidths
}
