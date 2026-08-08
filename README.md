# Terraforge

Creative world-building globe (PWA). Draw continents, regions, and cities in the browser.

## Quick start

```bash
npm install
npm run dev
```

See [HANDOVER.md](file:///d:/Documents/Development/mapgamething/HANDOVER.md) for full project architecture and developer handover guide.
See also `PROJECT_PLAN.md`, `AGENT_RULES.md`, and `CHECKLIST.md`.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview production build
- `npm test` — run unit tests via vitest

## Walk mode controller controls

Standard-mapped Xbox, PlayStation, Switch Pro, and compatible web gamepads are
supported. Use the left stick to move, right stick to look, A/Cross to jump,
L3 to toggle sprint, right trigger to break, and left trigger to use, interact, or
place. LB/RB or D-pad left/right changes hotbar slots. D-pad up toggles creative
flight; B/Circle descends while flying.

## License & Assets

No Google Earth imagery. Stylized globe only (`EllipsoidTerrainProvider`). User-generated content stays local unless exported.
