/**
 * main.js
 * Application entry point.
 *
 * Responsibilities:
 *  - Instantiate all controllers
 *  - Wire the settings button to the modal
 *  - Kick off the gradient and evolution system
 *
 * Keep this file thin — business logic lives in the controllers.
 */

import { GradientController }  from './gradient.js';
import { ModalController }     from './modal.js';
import { SettingsController }  from './settings.js';
import { EvolutionController } from './evolution.js';
import { GuideController }     from './guide.js';
import { DEFAULTS }            from './constants.js';

// ── Initialise controllers ─────────────────────────────────
const gradient  = new GradientController();
const modal     = new ModalController();
const evolution = new EvolutionController();
const guide     = new GuideController();

// SettingsController bridges UI → gradient + evolution
// eslint-disable-next-line no-unused-vars
const settings  = new SettingsController(gradient, evolution);

// ── Wire up settings button ────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', (e) => {
  modal.open(/** @type {HTMLElement} */ (e.currentTarget));
});

// ── Wire up evolution guide ────────────────────────────────
guide.init(evolution);

// ── Boot gradient ──────────────────────────────────────────
gradient.init(DEFAULTS.GRADIENT_COLOR);

// Apply saved settings after gradient has set its defaults
settings.loadSaved();

// ── Boot evolution (async — loads icons.json + warms SVG cache) ──
evolution.init(document.getElementById('evolutionContainer'));
