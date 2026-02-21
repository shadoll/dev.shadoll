/**
 * modal.js
 * Controls the settings modal — open, close, and all dismissal paths.
 * Keeps focus management and accessibility in sync with visibility state.
 */

export class ModalController {
  /** @type {HTMLElement} */  #overlay;
  /** @type {boolean} */      #isOpen = false;
  /** @type {HTMLElement|null} */ #triggerEl = null;

  constructor() {
    this.#overlay = document.getElementById('modalOverlay');
    this.#bindEvents();
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Open the modal.
   * Remembers which element triggered it so focus can be restored on close.
   *
   * @param {HTMLElement} [trigger]  the element that opened the modal
   */
  open(trigger) {
    if (this.#isOpen) return;

    this.#triggerEl = trigger ?? document.activeElement;
    this.#isOpen    = true;

    this.#overlay.classList.add('modal-visible');
    this.#overlay.setAttribute('aria-hidden', 'false');

    // Move focus into the modal after the CSS transition starts
    requestAnimationFrame(() => {
      const firstFocusable = this.#overlay.querySelector(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    });
  }

  /** Close the modal and restore focus to the trigger element. */
  close() {
    if (!this.#isOpen) return;

    this.#isOpen = false;
    this.#overlay.classList.remove('modal-visible');
    this.#overlay.setAttribute('aria-hidden', 'true');

    this.#triggerEl?.focus();
    this.#triggerEl = null;
  }

  get isOpen() { return this.#isOpen; }

  // ── Private ────────────────────────────────────────────────

  #bindEvents() {
    // Close button
    document.getElementById('modalClose')
      .addEventListener('click', () => this.close());

    // Click outside panel → close
    this.#overlay.addEventListener('click', (e) => {
      if (e.target === this.#overlay) this.close();
    });

    // Escape key → close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }
}
