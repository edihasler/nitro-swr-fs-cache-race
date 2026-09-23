# Nitro: `swr` cache with the `fs` driver calls the handler many times per expiry

Minimal reproduction for Nitro v2 (`nitropack` 2.13.4). A cached event handler with `swr: true`
is expected to run once per expiry. With the `fs` storage driver, under concurrent load, it
runs dozens to hundreds of times.

## Run

```sh
pnpm install
pnpm build
pnpm start        # terminal 1: server on :3000, logs every handler call
pnpm load         # terminal 2: 40 concurrent clients for 12 seconds
```

## Setup

- `routes/index.ts`: `defineCachedEventHandler(..., { swr: true, maxAge: 5 })`, logs every call
- `nitro.config.ts`: cache storage on the file system (`driver: 'fs'`)
- `load.mjs`: 40 clients request `/` without pause for 12 seconds

## Expected vs. observed

With 12 s of load and `maxAge: 5`, the handler should run **3** times: the initial fill, the
revalidation at 5 s and the revalidation at 10 s.

| Cache driver | Initial fill | 1st expiry | 2nd expiry | Total |
|---|---|---|---|---|
| `fs` | 40 | 125 | 142 | **307** |
| memory (default) | 1 | 1 | 1 | **3** |

Log excerpt with `fs`:

```
13:52:14.387  handler call #1
13:52:14.390  handler call #2
...
13:52:14.427  handler call #40
13:52:19.390  handler call #41
...
13:52:19.763  handler call #165
13:52:24.767  handler call #166
...
13:52:25.036  handler call #307
```

To run the memory variant, comment out the `storage` line in `nitro.config.ts` and rebuild.

Environment: Windows 11, Node 26.1.0, nitropack 2.13.4.

## Cause

`defineCachedFunction` in
[`src/runtime/internal/cache.ts`](https://github.com/nitrojs/nitro/blob/e7fb09cb8617f47773a26aeea14ce6da4497e354/src/runtime/internal/cache.ts#L117-L136)
deduplicates concurrent resolutions through a `pending` map. After the resolver returns,
`pending[key]` is deleted **before** the new entry is written, and `useStorage().setItem()`
is not awaited:

```ts
entry.mtime = Date.now();
entry.integrity = integrity;
delete pending[key];                 // slot released here
if (validate(entry) !== false) {
  const promise = useStorage()
    .setItem(cacheKey, entry, setOpts) // write still in flight
    ...
```

Every request that reads the cache entry in this window still gets the old (or no) entry,
finds no pending resolution and starts its own. With the memory driver the write finishes
almost immediately, so the window is practically closed. With the `fs` driver it stays open
for the duration of a file write, and under load many requests fall into it.

## Fix tested

Releasing `pending[key]` only after the write has settled brings the `fs` variant down to
**3** handler calls, and throughput in the same 12 s went from 25 452 to 57 357 requests:

```diff
       entry.mtime = Date.now();
       entry.integrity = integrity;
-      delete pending[key];
-      if (validate(entry) !== false) {
+      if (validate(entry) === false) {
+        delete pending[key];
+      } else {
         let setOpts: TransactionOptions | undefined;
         if (opts.maxAge && !opts.swr /* TODO: respect staleMaxAge */) {
           setOpts = { ttl: opts.maxAge };
         }
         const promise = useStorage()
           .setItem(cacheKey, entry, setOpts)
           .catch((error) => {
             console.error(`[cache] Cache write error.`, error);
             useNitroApp().captureError(error, { event, tags: ["cache"] });
           });
+        promise.finally(() => {
+          delete pending[key];
+        });
         if (event?.waitUntil) {
           event.waitUntil(promise);
         }
       }
```

It was tested by patching the built `.output/server/chunks/_/nitro.mjs`, not the source.
