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
} as const;

/** Files above these sizes trigger warnings / refusal (bytes). */
export const LIMITS = {
  warnBytes: 100 * 1024 * 1024,
  hardBytes: 1024 * 1024 * 1024,
  imagePixelsWarn: 40_000_000,
} as const;
