# devpage — Agent Context File

This file is a compact reference for AI agents working on this project.
Read it before making changes; it documents architecture, patterns, current
state, and deployment notes.

---

## What this project is

A personal developer page — a single-page app with an animated gradient background
and a floating icon "evolution" system. Icons spawn at random intervals, drift
with chaotic physics, and bounce off viewport edges. A settings modal lets the
user tune colours, speeds, the bump/threshold behaviour of the logo word, and
other simulation parameters.

Recent enhancements include:
- Full localStorage persistence of all settings including slider values,
  toggle states, bump counts, and threshold range.
- Realtime current-value display for every slider.
- Debug/visualisation toggles for per-letter hit counts and detach thresholds.
- Configurable random bump threshold range with immediate update of existing
  letters and regenerated thresholds on evolution restart.
- Smooth colour interpolation for letters as they approach their threshold.
- Reset semantics that restore **all** settings to constants while leaving
  evolution state untouched.

---

## Tech constraints

- Vanilla JS — no framework, no bundler, no build step.
- Pure ES modules (`type="module"` in HTML). All imports use relative paths.
- Static site; requires HTTP server for `fetch()` (e.g. GitHub Pages, `npx serve`).
- Target: modern evergreen browsers (CSS `@property`, `backdrop-filter`, etc.).

---

## File map

```
index.html                    ← HTML shell + all CSS links + module entry point
src/
  js/
    main.js                   ← Entry point. Instantiates controllers, wires them.
    constants.js              ← Single source of truth for all numeric/flag defaults.
    gradient.js               ← GradientController.
    modal.js                  ← ModalController (settings pop‑up).
    settings.js               ← SettingsController (UI ↔ controllers, storage).
    evolution.js              ← EvolutionController (physics/loop/spawner).
    entity.js                 ← Entity class (one floating icon).
    logoController.js        ← LogoController (floating word logic).
    logoLetter.js            ← LogoLetter class (per‑letter behaviour).
    iconLoader.js             ← SVG fetching and caching.
  utils/
    colorUtils.js             ← colour math utilities.
  styles/
    main.css
    gradient.css
    modal.css
    icons.css
    logo.css
  data/
    icons.json                ← Configuration for icons, types, spawn rules.
  icons/
    *.svg                     ← Raw SVG files (34 total).
```

---

## Architecture

### Controller pattern

```
main.js
  ├── GradientController
  ├── ModalController
  ├── SettingsController
  └── EvolutionController
          ├── LogoController
          │      └── LogoLetter[]
          └── Entity[]
```

### Data flow

```
UI change → settings.js → controller method → CSS/physics update → save
```

SettingsController is the only module that writes to localStorage; it serialises
all mutable configuration (including logos’ hit counts) and restores them on
boot, preserving the exact state across reloads. The reset button clears this
storage and reverts UI controls to `constants.js` defaults.

---

## Key patterns

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
MOVE_SPEED:              5    // slider default; multiplier = sliderValue / MOVE_SPEED
BASE_SPEED:             0.8   // px/frame at multiplier 1.0
MAX_SPEED_FACTOR:        2.5  // max speed = BASE_SPEED × MAX_SPEED_FACTOR
APPEAR_DURATION:       600    // ms, scale 0→1 CSS transition
DRIFT_CHANCE:           0.02  // probability per frame of a velocity kick
DRIFT_MAGNITUDE:        0.25  // max |Δv| per kick
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

Only `dna-bold-duotone` spawns by default; the spawn logic is the next target for extension.

---

## Settings modal controls

In addition to the original colour/speed toggles, the modal now offers:

- real‑time readout column for every slider value (gradient speed, movement
  speed, spawn rate, virus kill %, bug rarity %, bug count, and bump range).
- toggles for showing per‑letter **hit counts** and **detach thresholds** on the
  floating logo word.
- sliders to adjust the **min/max bump threshold** used when picking random
  detach numbers.

All settings persist to localStorage, including zeros and hits, and reload
exact values on page refresh. The reset button restores every setting to the
hardcoded constant defaults.

---

## Known gaps / next steps

1. **Spawn variety** – pick from full icon registry.
2. **icons.json completeness** – register remaining 25 icons.
3. **Entity interactions** – currently only entity‑letter collisions are handled.
4. **Main content area** – still an empty `<main>` for future content.
5. **Entity cap/persistence improvements** – add limits or export/import features.

---

## Deployment notes

The app is fully static; GitHub Pages (or any static file host) works fine.
No server‑side code is required. Make sure to serve via HTTP so `fetch` can
load `icons.json` and SVG files.

*Updated 2026‑02‑21 to reflect the current state after adding settings persistence,
hit‑count/debug toggles, threshold controls, colour interpolation, and continued
work on logo/evolution mechanics.*
