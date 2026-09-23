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
