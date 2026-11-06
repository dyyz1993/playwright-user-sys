import { generateFingerprint } from '../../../machine/browser-utils.js';

describe('fingerprint viewport alignment', () => {
  it('aligns generated screen metrics with the requested viewport', () => {
    const fingerprint = generateFingerprint({
      viewport: { width: 1280, height: 800 },
      fingerprintOptions: { enabled: true },
    });

    expect(fingerprint).toBeTruthy();
    expect(fingerprint?.fingerprint.screen).toMatchObject({
      width: 1280,
      height: 800,
      availWidth: 1280,
      availHeight: 800,
      innerWidth: 1280,
      innerHeight: 800,
      outerWidth: 1280,
      outerHeight: 800,
      clientWidth: 1280,
      clientHeight: 800,
      devicePixelRatio: 1,
    });
  });

  it('keeps fingerprint injection disabled when requested', () => {
    expect(
      generateFingerprint({
        viewport: { width: 1280, height: 800 },
        fingerprintOptions: { enabled: false },
      })
    ).toBeNull();
  });
});
