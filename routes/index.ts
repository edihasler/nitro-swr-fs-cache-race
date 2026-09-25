import { defineCachedHandler } from 'nitro/cache'

let calls = 0

// Cached for 5 seconds, then served stale while one revalidation is expected to run.
export default defineCachedHandler(
  () => {
    calls++
    console.log(`${new Date().toISOString().slice(11, 23)}  handler call #${calls}`)
    return `handler call #${calls}`
  },
  { swr: true, maxAge: 5 },
)
