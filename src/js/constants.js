/**
 * constants.js
 * Single source of truth for all application defaults and tuneable values.
 * Import from here — never hardcode magic numbers elsewhere.
 */

export const DEFAULTS = {

  // ── Gradient background ────────────────────────────────────
  /** Base colour the gradient is derived from */
  GRADIENT_COLOR:     '#4d22b3',
  /** Flow animation speed, slider 1–10 */
  GRADIENT_SPEED:      2,
  /** Clockwise rotation off by default */
  GRADIENT_ROTATION:   true,

  // ── Icon evolution ─────────────────────────────────────────
  /** Min ms before the first / next icon spawns */
  SPAWN_DELAY_MIN:     3_000,
  /** Max ms before the first / next icon spawns */
  SPAWN_DELAY_MAX:    20_000,

  /** Final rendered icon size in px */
  ICON_SIZE:              24,
  /** Half of ICON_SIZE — used for edge/collision math */
  ICON_HALF:              12,

  /** Movement speed slider default (1–10) */
  MOVE_SPEED:              5,
  /** Base px-per-frame at MOVE_SPEED */
  BASE_SPEED:             0.8,
  /** Hard cap: max speed = BASE_SPEED × this factor */
  MAX_SPEED_FACTOR:        2.5,

  /** ms for dot → full-icon grow animation */
  APPEAR_DURATION:       600,

  /** Probability per frame of a random velocity "kick" (chaotic drift) */
  DRIFT_CHANCE:           0.02,
  /** Max |Δv| applied on each drift kick */
  DRIFT_MAGNITUDE:        0.25,

};
