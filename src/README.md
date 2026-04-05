# Sileo SolidJS

> An opinionated, physics-based toast notification library for SolidJS.

A faithful SolidJS port of [sileo](https://github.com/hiaaryan/sileo) — replacing React hooks with SolidJS primitives and `motion/react` with the vanilla `motion` DOM animation API.

![Sileo Preview](https://github.com/user-attachments/assets/08f55559-fd1c-42a3-ba72-6787844831e3)

## Features

- **Physics-based animations** — SVG gooey effect with spring easing
- **Swipe to dismiss** — pointer-based gesture support
- **Header layer transitions** — smooth state/icon/title swaps
- **Auto expand/collapse** — hover or timed reveal
- **Promise support** — loading → success/error flow
- **Theme aware** — light/dark/system with CSS variable fills
- **Zero React dependencies** — pure SolidJS + motion DOM

## Installation

The library is included locally at `packages/ui/src/lib/sileo/`. No npm install needed.

```tsx
import { Toaster, sileo } from "./lib/sileo"
```

## Quick Start

### 1. Add the Toaster

Place `<Toaster />` near the root of your app (e.g. `App.tsx`):

```tsx
import { Toaster } from "./lib/sileo"

function App() {
  return (
    <>
      {/* your app */}
      <Toaster position="top-center" offset={12} options={{ duration: 2500 }} />
    </>
  )
}
```

### 2. Show Toasts

```tsx
import { sileo } from "./lib/sileo"

// Basic
sileo.success({ title: "Saved!", description: "Your changes have been saved" })
sileo.error({ title: "Error", description: "Something went wrong" })
sileo.warning({ title: "Warning", description: "Please review before continuing" })
sileo.info({ title: "Info", description: "New version available" })

// With action button
sileo.action({
  title: "New message",
  description: "You have a new message from Alice",
  button: { title: "View", onClick: () => navigate("/messages/1") },
})

// Promise
sileo.promise(
  fetch("/api/data").then(r => r.json()),
  {
    loading: { title: "Loading...", description: "Fetching data" },
    success: { title: "Done!", description: "Data loaded successfully" },
    error: { title: "Failed", description: "Could not fetch data" },
  }
)

// Dismiss
sileo.dismiss("my-toast-id")
sileo.clear()
```

## API

### `sileo.show(options)`
### `sileo.success(options)`
### `sileo.error(options)`
### `sileo.warning(options)`
### `sileo.info(options)`
### `sileo.action(options)`

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Toast title text |
| `description` | `string \| JSX.Element` | Description content |
| `position` | `"top-left" \| "top-center" \| "top-right" \| "bottom-left" \| "bottom-center" \| "bottom-right"` | Toast position |
| `duration` | `number \| null` | Auto-dismiss duration in ms. `null` = no auto-dismiss |
| `icon` | `JSX.Element \| null` | Custom icon (overrides state icon) |
| `fill` | `string` | SVG fill color |
| `roundness` | `number` | Border radius (default: 16) |
| `button` | `{ title: string; onClick: () => void }` | Action button |
| `styles` | `{ title?: string; description?: string; badge?: string; button?: string }` | CSS class overrides |
| `autopilot` | `boolean \| { expand?: number; collapse?: number }` | Auto expand/collapse timing |

### `sileo.promise(promise, options)`

| Option | Type | Description |
|--------|------|-------------|
| `loading` | `SileoOptions` | Shown while promise is pending |
| `success` | `SileoOptions \| ((data) => SileoOptions)` | Shown on resolve |
| `error` | `SileoOptions \| ((err) => SileoOptions)` | Shown on reject |
| `action` | `SileoOptions \| ((data) => SileoOptions)` | Optional action state instead of success |
| `position` | `SileoPosition` | Override position |

### `<Toaster />` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `SileoPosition` | `"top-right"` | Default position for toasts |
| `offset` | `number \| string \| { top?, right?, bottom?, left? }` | — | Viewport offset |
| `options` | `Partial<SileoOptions>` | — | Default options for all toasts |
| `theme` | `"light" \| "dark" \| "system"` | — | Color theme |

## Differences from Original (React)

| React (original) | SolidJS (this port) |
|-----------------|---------------------|
| `useState`, `useMemo`, `useEffect` | `createSignal`, `createMemo`, `createEffect` |
| `useRef` | `let` refs / plain objects |
| `<motion.rect>` from `motion/react` | `<rect>` + `animate()` from `motion` (DOM API) |
| `ReactNode` | `JSX.Element` |
| `className` | `class` |
| `key` prop for lists | `<For>` / `<Index>` from solid-js |
| `"use client"` directive | Not needed |

## License

MIT — same as the original [sileo](https://github.com/hiaaryan/sileo).
