# devpage — Agent Context File

This file is a compact reference for AI agents working on this project.
Read it before making changes. It covers purpose, architecture, patterns, and current state.

---

## What this project is

A personal developer page — a single-page app with an animated gradient background
and a floating icon "evolution" system. Icons spawn at random intervals, drift
around the screen with chaotic physics, and bounce off viewport edges.
A settings modal lets the user tune the gradient colour, animation speed, icon
movement speed, and gradient rotation.

**It is intentionally a growing project.** The base page and evolution system are
done; future work will extend icon variety, add icon interactions, and build out
the main content area.

---

## Tech constraints

- Vanilla JS — no framework, no bundler, no build step.
- Pure ES modules (`type="module"` in HTML). All imports use relative paths.
- Requires a local HTTP server — `fetch()` calls fail on `file://`.
  Run with `npx serve .` or `python3 -m http.server` then open `localhost`.
- Browser target: modern evergreen (CSS `@property`, `backdrop-filter`, `scale`
  as standalone property, private class fields all required).

---

## File map

```
index.html                    ← HTML shell + all CSS links + module entry point
src/
  js/
    main.js                   ← Entry point. Instantiates all controllers, boots them.
    constants.js              ← Single source of truth for all numeric/flag defaults.
    gradient.js               ← GradientController. Drives CSS vars on <html>.
    modal.js                  ← ModalController. Open/close, focus trap, Escape dismiss.
    settings.js               ← SettingsController. UI → controller bridge (no own state).
    evolution.js              ← EvolutionController. Spawn scheduler + rAF physics loop.
    entity.js                 ← Entity class. One floating icon: physics + DOM lifecycle.
    iconLoader.js             ← fetch() + Map cache for SVGs. normalizeSvg() strips attrs.
  utils/
    colorUtils.js             ← hexToHSL, hslToHex, deriveGradientPair.
  styles/
    main.css                  ← Base reset, typography (DM Mono), settings button.
    gradient.css              ← @property --gradient-angle, keyframes, body animation.
    modal.css                 ← Glass morphism overlay, controls, toggle switch.
    icons.css                 ← .evolution-container, .icon-entity, appear transition.
  data/
    icons.json                ← Icon registry: groups, per-icon metadata, type colours, spawn config.
  icons/
    *.svg                     ← 34 SVG icons (Solar icon set, 24×24 viewBox, currentColor).
```

---

## Architecture

### Controller pattern

Each domain has one class. No shared mutable globals.

```
main.js
  ├── GradientController   gradient.js     state: color, speed, rotating
  ├── ModalController      modal.js        state: open/closed, trigger ref
  ├── SettingsController   settings.js     no state — reads DOM, forwards to others
  └── EvolutionController  evolution.js    state: entities[], moveSpeed, timers
          └── Entity[]     entity.js       state: x, y, vx, vy, alive, DOM refs
```

### Data flow

```
User interaction (slider/picker/toggle)
  → settings.js listener
  → gradient.setColor() / gradient.setSpeed() / evolution.setMoveSpeed()
  → CSS custom property on <html>  OR  evolution speed multiplier updated live
```

### CSS custom properties (set on `<html>` by GradientController)

```
--color-1        first gradient colour (derived from user's base colour)
--color-2        second gradient colour (hue-shifted companion)
--anim-duration  animation duration in seconds (maps speed 1-10 → ~32s-3.5s)
--gradient-angle registered @property <angle>, animated by gradientRotate keyframe
```

---

## Key patterns and why

### Two-div entity structure
Each entity uses an outer div for JS position (`transform: translate()`) and an
inner div for the CSS appear animation (`scale` standalone property). Separating
them prevents JS transform writes from interrupting the CSS transition.

```html
<div class="icon-entity">         ← JS sets transform: translate(x, y) every frame
  <div class="icon-entity__body"> ← CSS transition: scale 0→1 on [data-state="alive"]
    <svg>…</svg>
  </div>
</div>
```

### Appear animation trigger
`bodyEl.dataset.state = 'spawning'` is set synchronously before mount.
`dataset.state = 'alive'` is set two rAF ticks later. This guarantees the
browser has painted the initial `scale: 0` state before the transition fires.

### Rotation animation without restart
Both `gradientFlow` and `gradientRotate` animations are always declared on `<body>`.
Rotation starts with `animation-play-state: paused`. Toggling `.gradient-rotating`
class switches it to `running`. This avoids restarting `gradientFlow` on toggle.

### Edge bounce
`Math.abs()` trick ensures correct direction regardless of penetration depth:
```js
if (x - h <= 0)  { x = h;      vx =  Math.abs(vx); }  // left wall → go right
if (x + h >= vw) { x = vw - h; vx = -Math.abs(vx); }  // right wall → go left
```

### Colour derivation
`deriveGradientPair(hex)` in `colorUtils.js` produces a two-colour gradient from
one base colour using HSL math. Colour 1: same hue, deeper (sat ×1.15, light ×0.62).
Colour 2: hue +35°, lighter (sat ×0.88, light ×1.48, max 78).

### SVG loading
`iconLoader.js` fetches each SVG once via `fetch()` and caches in a `Map`.
`normalizeSvg()` strips: XML declaration, HTML comments, `width=` attr, `height=` attr.
This lets CSS control icon size. All icons use `fill="currentColor"` (except
`display-line-duotone.svg` which uses `stroke="currentColor"`).

### icons.json loaded at runtime
`import … assert { type: 'json' }` has inconsistent browser support without a bundler.
`EvolutionController` loads `icons.json` via `fetch()` inside `#loadIconsData()`.

---

## Defaults (source of truth: `src/js/constants.js`)

```js
GRADIENT_COLOR:    '#4d22b3'   // deep purple
GRADIENT_SPEED:     2          // slider value 1-10
GRADIENT_ROTATION:  false
SPAWN_DELAY_MIN:    3_000      // ms before first/next icon spawns
SPAWN_DELAY_MAX:   20_000      // ms
ICON_SIZE:              24     // px
ICON_HALF:              12     // px, used in edge bounce math
MOVE_SPEED:              5     // slider default; multiplier = sliderValue / MOVE_SPEED
BASE_SPEED:             0.8    // px/frame at multiplier 1.0
MAX_SPEED_FACTOR:        2.5   // max speed = BASE_SPEED × MAX_SPEED_FACTOR
APPEAR_DURATION:       600     // ms, scale 0→1 CSS transition
DRIFT_CHANCE:           0.02   // probability per frame of a velocity kick
DRIFT_MAGNITUDE:        0.25   // max |Δv| per kick
```

---

## Icon inventory

34 SVG files in `src/icons/`. 9 are registered in `src/data/icons.json`.
The other 25 are present on disk but not yet wired into the evolution system.

### Registered in icons.json

| filename                         | label       | type    | group    |
|----------------------------------|-------------|---------|----------|
| dna-bold-duotone.svg             | DNA         | good    | biology  |
| bug-bold-duotone.svg             | Bug         | bad     | tech     |
| buildings-3-bold-duotone.svg     | Buildings   | good    | economy  |
| chat-round-dots-bold-duotone.svg | Chat        | neutral | social   |
| chat-round-money-bold-duotone.svg| Chat Money  | neutral | economy  |
| chat-round-unread-bold-duotone.svg| Unread Chat| neutral | social   |
| database-bold-duotone.svg        | Database    | good    | tech     |
| delivery-bold-duotone.svg        | Delivery    | good    | economy  |
| display-line-duotone.svg         | Display     | neutral | tech     |

**Note:** `display-line-duotone.svg` uses `stroke` not `fill`. Tinting via `color`
CSS property works, but the visual style differs from the fill-based icons.

### On disk, not yet in icons.json (25 files)

android-old, angular, app-store, apple-brand, claude, code-1, docker, donut-bold-duotone,
face-scan-square-bold-duotone, filters-bold-duotone, gamepad-bold-duotone, git, github,
go, javascript, kubernetes, laravel, mysql, nodejs, open-ai, php, postgresql, python,
signal-app, vs-code

To register any of these: add an entry to `icons.icons` in `icons.json` following the
existing schema `{ "label": "…", "type": "good|bad|neutral", "group": "…" }`.
Create a new group in `icons.groups` if needed.

---

## Current spawn behaviour

Only `dna-bold-duotone` spawns. The icon is set in `icons.json → spawn.initial`.
`EvolutionController.#spawnEntity()` always uses `spawn.initial` — it does not yet
pick from the full icon registry. This is intentional: the spawn logic is the next
thing to extend.

---

## Settings modal controls

| Element ID         | Type    | Default | Wired to                           |
|--------------------|---------|---------|-------------------------------------|
| `colorPicker`      | color   | #4d22b3 | `gradient.setColor(hex)`            |
| `speedSlider`      | range 1-10 | 2    | `gradient.setSpeed(n)`              |
| `moveSpeedSlider`  | range 1-10 | 5    | `evolution.setMoveSpeed(n)`         |
| `rotationToggle`   | checkbox| false   | `gradient.toggleRotation(bool)`     |

---

## Known gaps / next steps

1. **Spawn variety** — `#spawnEntity` always spawns `spawn.initial`. Extend to pick
   randomly from `icons.icons` (or weighted by type) to get diverse entities.
2. **icons.json completeness** — 25 icons on disk are unregistered. Add them to
   unlock their use in spawning.
3. **Icon interactions** — no collision detection between entities yet.
4. **Main content area** — `<main class="page-main">` is empty. Reserved for content.
5. **Entity cap** — no maximum entity count; they accumulate indefinitely.
6. **Persistence** — settings reset on page reload. No localStorage yet.
