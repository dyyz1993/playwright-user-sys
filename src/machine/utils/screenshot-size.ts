export const MAX_SCREENSHOT_WIDTH = 1920;
export const MAX_SCREENSHOT_HEIGHT = 1080;

export function clampScreenshotSize(
  viewportWidth: number,
  viewportHeight: number,
  maxWidth: number = MAX_SCREENSHOT_WIDTH,
  maxHeight: number = MAX_SCREENSHOT_HEIGHT
): { width: number; height: number } {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  let width = viewportWidth;
  let height = viewportHeight;

  if (width > maxWidth) {
    height = Math.round(height * (maxWidth / width));
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = Math.round(width * (maxHeight / height));
    height = maxHeight;
  }

  return { width, height };
}
