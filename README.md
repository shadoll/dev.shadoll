# devpage

A tiny personal developer page with an animated gradient background and floating icons.

## Features

- Vanilla JavaScript ES modules
- Randomly spawning SVG icons with physics
- Logo word that responds to hits and detaches letters
- Settings modal with persistent controls (gradient, speed, spawn, logo options)
- Fully static; serves via any HTTP server (e.g. `python3 -m http.server`).

## Development

1. Clone the repo.
2. Run a simple HTTP server in the project root:
   ```sh
   cd devpage
   python3 -m http.server 8080
   ```
3. Open `http://localhost:8080` in a modern browser.

## Deployment

The site is static and can be hosted on GitHub Pages or any static file host.

## License

MIT
