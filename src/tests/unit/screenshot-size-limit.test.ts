import { describe, test, expect } from 'vitest';
import { clampScreenshotSize, MAX_SCREENSHOT_WIDTH, MAX_SCREENSHOT_HEIGHT } from '@machine/utils/screenshot-size.js';

describe('clampScreenshotSize', () => {
  test('viewport 在限制内 → 返回原始尺寸', () => {
    const result = clampScreenshotSize(1280, 720);
    expect(result).toEqual({ width: 1280, height: 720 });
  });

  test('viewport 等于最大限制 → 返回原始尺寸', () => {
    const result = clampScreenshotSize(MAX_SCREENSHOT_WIDTH, MAX_SCREENSHOT_HEIGHT);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('viewport 超过 maxWidth → 返回 maxWidth, 等比缩放 height', () => {
    const result = clampScreenshotSize(3840, 2160);
    expect(result.width).toBe(MAX_SCREENSHOT_WIDTH);
    const expectedHeight = Math.round(2160 * (MAX_SCREENSHOT_WIDTH / 3840));
    expect(result.height).toBe(expectedHeight);
  });

  test('viewport 超过 maxHeight → 返回 maxHeight, 等比缩放 width', () => {
    const result = clampScreenshotSize(1280, 2160);
    expect(result.height).toBe(MAX_SCREENSHOT_HEIGHT);
    const expectedWidth = Math.round(1280 * (MAX_SCREENSHOT_HEIGHT / 2160));
    expect(result.width).toBe(expectedWidth);
  });

  test('viewport 两个方向都超 → 宽度限制优先，等比缩放', () => {
    const result = clampScreenshotSize(3840, 2160);
    expect(result.width).toBeLessThanOrEqual(MAX_SCREENSHOT_WIDTH);
    expect(result.height).toBeLessThanOrEqual(MAX_SCREENSHOT_HEIGHT);
  });

  test('viewport 宽度为 0 → 返回默认 1920x1080', () => {
    const result = clampScreenshotSize(0, 720);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('viewport 高度为 0 → 返回默认 1920x1080', () => {
    const result = clampScreenshotSize(1280, 0);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('viewport 宽度为负数 → 返回默认 1920x1080', () => {
    const result = clampScreenshotSize(-100, 720);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('viewport 高度为负数 → 返回默认 1920x1080', () => {
    const result = clampScreenshotSize(1280, -100);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('viewport 两个方向都为 0 → 返回默认 1920x1080', () => {
    const result = clampScreenshotSize(0, 0);
    expect(result).toEqual({ width: MAX_SCREENSHOT_WIDTH, height: MAX_SCREENSHOT_HEIGHT });
  });

  test('自定义 maxWidth 和 maxHeight', () => {
    const result = clampScreenshotSize(2000, 1500, 1000, 800);
    expect(result.width).toBeLessThanOrEqual(1000);
    expect(result.height).toBeLessThanOrEqual(800);
  });

  test('保持等比缩放精度', () => {
    const result = clampScreenshotSize(2560, 1440, 1920, 1080);
    const aspectOriginal = 2560 / 1440;
    const aspectResult = result.width / result.height;
    expect(Math.abs(aspectOriginal - aspectResult)).toBeLessThan(0.01);
  });
});
