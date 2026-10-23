# Performance on a TV

A webOS TV browser is a current Chromium (webOS TV 26 ships Chromium 132), but it runs on a TV chip with little memory. Measured on an LG 65NU700BPUA (webOS TV 26, about 1 GB RAM), a typical non-OLED set: code that's smooth on a laptop can stall for seconds there. The rules below come from fixing a launcher app that flickered.

Check every change on the TV: `npm run deploy`, then `npm run shot` and `npm run eval`. A desktop browser hides all of the problems below.

## Rendering

- **No CSS `filter: blur()` or `backdrop-filter` on large areas.** A full-screen blurred background dropped the launcher to visible stutters. To get a blurred fill, draw the image into a small canvas (for example 192×108) with `ctx.filter = "blur(6px)"` and stretch the canvas with CSS. Blur in the canvas, not with CSS on the stretched result, or it looks blocky.
- **Glassmorphism doesn't work for the same reason.** Use solid or gradient cards.
- **Animate only `transform` and `opacity`.** Add `will-change: transform, opacity` to layers that animate constantly (slides, crossfades), and only to those: each one costs GPU memory.
- **Decode images before showing them.** `await img.decode()` before starting a crossfade; otherwise the decode happens mid-animation and the fade jumps.
- **Don't restart an animation in the middle of a transition.** Tie a long animation (Ken Burns zoom) to its own class, added when the slide starts and removed after it's hidden, not to the `.show` class that drives the fade. Otherwise the zoom snaps back while the slide is still fading out.
- **Rebuild only what changed.** When live data arrives, compare it with what's on screen (a JSON string of the row is enough) and leave unchanged DOM alone. Rebuilding every row on each update caused the worst stalls (2.6 s down to 0.45 s after fixing).

## Memory (about 1 GB, shared with the TV's own UI)

- **Downscale images to 1920 px before they reach the TV.** Large photos cost memory to decode, and the screen is 1920×1080 anyway (web apps never render at 4K).
- **Release what's off screen.** Set `img.src = ""` on hidden slides and drop big arrays when a screen closes. The TV kills apps that use too much memory without telling you.
- **Run one animation loop at a time.** Stop timers and `requestAnimationFrame` loops for screens that aren't visible.

## Loading

- **Packaged apps load from `file://`.** ES modules (`<script type="module">`, `import`) don't load there. Use classic `<script>` tags with globals (like `app/js/tv.js`), or a bundler that outputs a classic script into `app/`.
- **Keep the first screen light.** Show a usable screen first, then fetch data and fill it in.

## Measuring

- `npm run inspect` opens DevTools for the app on the TV. The Performance panel works.
- For a quick check without DevTools, use `npm run eval` to time something in the page, for example frames rendered over 3 seconds:
  ```bash
  npm run eval -- 'new Promise(r => { let n = 0; const t = performance.now(); (function f() { n++; performance.now() - t < 3000 ? requestAnimationFrame(f) : r((n / 3).toFixed(1) + " fps"); })(); })'
  ```
