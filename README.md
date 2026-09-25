# Nitro: `swr` cache with the `fs` driver calls the handler many times per expiry

Minimal reproduction for Nitro v3 (`nitro` 3.0.260903-beta). A cached handler with `swr: true`
is expected to run once per expiry. With the `fs` storage driver, under concurrent load, it
runs dozens to hundreds of times.

The same bug also occurs in Nitro v2 (`nitropack` 2.13.4). See the `master` branch.

## Run

```sh
pnpm install
pnpm build
pnpm start        # terminal 1: server on :3000, logs every handler call
pnpm load         # terminal 2: 40 concurrent clients for 12 seconds
```

## Setup

- `routes/index.ts`: `defineCachedHandler(..., { swr: true, maxAge: 5 })` from `nitro/cache`, logs every call
- `nitro.config.ts`: cache storage on the file system (`driver: 'fs'`)
- `load.mjs`: 40 clients request `/` without pause for 12 seconds

## Expected vs. observed

With 12 s of load and `maxAge: 5`, the handler should run **3** times: the initial fill, the
revalidation at 5 s and the revalidation at 10 s.

| Nitro | Cache driver | Initial fill | 1st expiry | 2nd expiry | Total |
|---|---|---|---|---|---|
| v3 beta | `fs` (run 1) | 79 | 93 | 58 | **230** |
| v3 beta | `fs` (run 2) | 79 | 60 | 250 | **389** |
| v3 beta | memory (default) | 1 | 1 | 1 | **3** |
| v2 | `fs` | 40 | 125 | 142 | **307** |
| v2 | memory (default) | 1 | 1 | 1 | **3** |

Log excerpt with `fs` on v3:

```
05:26:32.088  handler call #1
05:26:32.092  handler call #2
...
05:26:32.154  handler call #79
05:26:37.155  handler call #80
...
05:26:37.244  handler call #172
05:26:42.246  handler call #173
...
05:26:42.296  handler call #230
```

To run the memory variant, comment out the `storage` line in `nitro.config.ts` and rebuild.

The build prints an `UNRESOLVED_IMPORT` warning for `chokidar`. The `fs` driver uses it only
for watch mode, so the warning does not affect this reproduction.

Environment: Windows 11, Node 26.1.0, nitro 3.0.260903-beta.
