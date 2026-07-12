# eeg-ui → Vue migration plan

## Goal
Move the frontend from one 2,680-line `app.js` + 985-line `index.html` (vanilla JS, `innerHTML` string templates, manual `getElementById` wiring) to **Vite + Vue 3 (SPA)** with per-view components, reactive state, and scoped styles — without a big-bang rewrite and without touching the working backend.

## Target architecture
- **Vite + Vue 3 + `vue-router`** as an SPA under `web/` (this folder), built to static assets.
- **Express API stays exactly as-is** (`api/server.js`). In dev, Vite proxies `/api` → `http://localhost:3000`. In prod, the built SPA is served as the static frontend and calls the same `/api`.
- **No SSR / Nuxt** — the core (Web Bluetooth, live canvas, epoch loop) is browser-only, so server rendering adds friction with zero benefit.
- Matches the house stack (scripture-website, literature-hub-web are Vue/Nuxt).

```
web/
  index.html            # Vite entry (was the 985-line monolith)
  vite.config.js        # /api proxy, build output
  src/
    main.js             # app bootstrap + router
    App.vue             # shell: sidebar + <router-view>
    router/index.js     # routes = the old showView() names
    lib/
      api.js            # fetch wrapper (was app.js api())
      instruments.js    # pure SVG builders (P3 draw* fns)
    composables/
      useDriver.js      # Muse/BrainBit DRIVERS → reactive state
      useAuth.js        # session state
    views/
      Monitor.vue  Cohort.vue  Client.vue
      Analyze.vue  Replay.vue  Prescribe.vue  Home.vue
    components/         # shared bits (StatTile, MetricStrip, ...)
```

## Mapping — old → new
| Vanilla today | Vue |
|---|---|
| `showView(name)` + `VIEWS` map | `vue-router` routes, lazy-loaded |
| `<section data-view="x">` | `views/X.vue` template (lifts almost verbatim) |
| `onShowX()` render fn | component `setup()` + `onMounted` |
| mutable module vars (`replayIndex`, `activeDriver`) | `ref()` / `reactive()` |
| `applyReading()` poking element IDs | reactive state → template bindings |
| `DRIVERS` layer + `connectBluetooth()` | `useDriver()` composable (logic unchanged) |
| 54 `innerHTML` templates | `v-for` / `v-if` (auto-escaped — no hand `escHtml`) |
| global `style.css` (1,080 lines) | per-component `<style scoped>` + a small tokens.css |

## What is NOT rewritten (ported as-is)
- **The Web Bluetooth driver logic** (Muse handshake, BrainBit bit-unpacking, `pushSamples`) — moved verbatim into `useDriver.js`, only the *sink* changes from DOM writes to reactive refs.
- **The `/analyze` contract** and **all Express endpoints** — untouched.
- **P3 SVG instrument math** — extracted to `lib/instruments.js` as pure functions (already pure), imported by `Analyze.vue`.

## Incremental order (app keeps running throughout)
The legacy static app stays live; new Vue app is built alongside and views cut over one at a time.
1. **Scaffold** shell + router + `api.js`. ✅ (this PoC)
2. **`useDriver()`** composable — the riskiest/most valuable piece. ✅ (this PoC)
3. **Analyze** view — self-contained, read-only, no device needed → safest first real port. ✅ (this PoC)
4. **Replay** — reuses analytics/epochs; port the transport as component state.
5. **Cohort / Client / Home** — CRUD over `/api/clients`; straightforward list/detail components.
6. **Monitor** — last, because it's the most stateful (live canvas + driver + session); by now `useDriver` is proven.
7. **Prescribe** — wizard as a stepper component.
8. Delete the legacy `app.js`/`index.html`/`style.css` once every view is cut over; point Vercel at the `web/` build.

## Risks & rollback
- **Web Bluetooth is browser-only** → keep everything client-side; never move driver logic to a server route. Vite dev over `localhost` is a secure context, so BLE works.
- **Big surface** → mitigated by incremental cutover; each view PR is independently revertable, and the legacy app remains the fallback until the last view lands.
- **Canvas waveform** (Monitor) is imperative → keep it imperative inside a component `ref` + `onMounted`; don't try to make it "reactive".
- **Auth/session cookies** → same-origin in prod; in dev the Vite proxy forwards cookies to Express.

## Definition of done (this PoC)
- `web/` builds with `npm run build` and runs with `npm run dev`.
- `useDriver()` exposes reactive `connected / deviceName / battery / latestReading` and can connect a Muse/BrainBit (same handshake as legacy).
- `Analyze.vue` renders the 6 SVG instruments against a real session via the `/api` proxy.
