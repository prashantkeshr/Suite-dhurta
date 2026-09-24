/**
 * Product identity. Rename the product here — nothing else in the codebase
 * should hard-code the name.
 */
export const APP = {
  name: 'Dhurta Suite',
  shortName: 'Dhurta',
  tagline: 'Private, in-browser productivity tools',
  org: 'Dhurta.Org',
  siteUrl: 'https://suite.dhurta.com',
  version: '0.1.0',
  /**
   * Search-engine ownership verification codes (the content value of the
   * meta tag each console gives you). Leave empty if you verify by DNS.
   */
  /** IndexNow key (Bing, Yandex, Seznam, Naver); the matching file is public/<key>.txt. */
  indexNowKey: '4086779dc860c39e9ac1f9359acfd8cc',
  verification: {
    google: '',
    bing: '',
    yandex: '',
  },
} as const;

/** Files above these sizes trigger warnings / refusal (bytes). */
export const LIMITS = {
  warnBytes: 100 * 1024 * 1024,
  hardBytes: 1024 * 1024 * 1024,
  imagePixelsWarn: 40_000_000,
} as const;
