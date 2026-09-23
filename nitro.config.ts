export default defineNitroConfig({
  compatibilityDate: '2026-09-01',

  // Comment this out to use the default in-memory cache, which calls the handler
  // exactly once per expiry.
  storage: { cache: { driver: 'fs', base: './.nitro-cache' } },
})
