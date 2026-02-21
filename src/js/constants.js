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

  // ── Collisions ─────────────────────────────────────────────
  /** Distance between centres (px) at which two entities collide (= ICON_SIZE) */
  COLLISION_DIAMETER:     24,

  // ── Hit colour shift ───────────────────────────────────────
  /** Minimum hue-rotate degrees added to an entity's filter on each collision */
  HIT_HUE_MIN:            60,
  /** Additional random range on top of HIT_HUE_MIN */
  HIT_HUE_RANGE:          60,

  // ── Bug / infection ────────────────────────────────────────
  /** Fallback probability for a rare-bug spawn when icons.json rareChance is absent */
  BUG_SPAWN_CHANCE:        0.08,
  /** Max number of bug entities alive simultaneously */
  BUG_MAX_COUNT:           2,

  // ── Virus kill ─────────────────────────────────────────────
  /** Probability that a virus contact kills the target (else it survives unaffected) */
  VIRUS_KILL_CHANCE:       0.9,
  /** CSS colour applied to a dying entity immediately on contact */
  KILL_FADE_COLOR:         '#ffaaaa',
  /** Delay (ms) before the grayscale-dead visual phase begins */
  KILL_FADE_MS:            400,
  /** Total ms from kill trigger to entity removal */
  KILL_DEATH_DURATION:     3_000,

};
