# VoxelForge Roadmap

**Status:** Prototype (week 1) — globe view, walk mode, worldgen, NPCs, and audio all functional but unhardened.
**North star:** A stable, performant voxel engine on a real-scale globe. Placeholder assets stay until the engine is solid; nothing ships publicly until they're replaced.
**Last updated:** 2026-08-07

---

## Phase 0 — Foundation & Hygiene

*Goal: a clean repo with safety nets, so every later phase is cheaper.*

- [ ] **Tighten `.gitignore` and purge committed artifacts**
  - Ignore and remove: `*.tsbuildinfo`, `agentoutput.txt`, `Trajectory ID *.txt`, `.kilo/`, `patches/`
  - `git rm --cached` the existing offenders; history rewrite optional (private repo, low value)
- [ ] **Consolidate the 14 markdown docs into `docs/`**
  - Keep: `README.md` (rewrite, Phase 5), `ROADMAP.md` (this file), `PERFORMANCE.md`, `docs/DATA_MODEL.md`, `docs/LUANTI_INTEGRATION.md`
  - Merge: `HANDOVER.md` + `docs/AGENT_HANDOVER.md` → `docs/AGENT_HANDOVER.md`
  - Archive: `NEW_VOXELFORGE_IMPLEMENTATION_PLAN.md`, `implementation_plan.md`, `PROJECT_PLAN.md`, `CHECKLIST.md`, `AGENT_RULES.md` → `docs/archive/` (one plan should be canonical — this roadmap)
  - Delete: `patches/` (diffs already applied in commit `9a63d4c`)
- [ ] **Add CI** (`.github/workflows/ci.yml`): install → `tsc` typecheck → `vitest run` on every push to `dev` and every PR. The 20+ existing test files should never go unrun.
- [ ] **Add ESLint + Prettier**, run once across the repo, commit the result in isolation
- [ ] **Branch discipline:** feature branches off `dev`, merged by PR (even solo); `main` reserved for milestone merges; tag releases from `main`
- [ ] **Decide license intent now:** repo stays private / all-rights-reserved while placeholder assets are present; pick the OSI license before any public flip (Phase 5)

## Phase 1 — Engine Stabilization

*Goal: eliminate known bugs and resolve the architectural forks before building higher.*

### Known bugs (fix first, add regression tests)

- [ ] **`soundEngine.playRelicDiscovered()` uses undefined `now`** — every other method sets `const now = ctx.currentTime`; this one doesn't, so the ReferenceError is swallowed by the empty `catch {}` and the fanfare silently never plays. Fix, and replace empty catches with warn-once logging so failures stay visible
- [ ] **`FirstPersonBuilder.placeBlueprint()` chunk-wrap bug** — `(startLx + dx) % CHUNK_SIZE` returns negative indices for negative `dx` (JS modulo), and offsets wrap inside the *same* chunk instead of crossing into neighbors. Blueprints near chunk edges corrupt or wrap. Implement proper floor-division into neighbor chunk coordinates; add boundary tests
- [ ] **`placeBlueprint()` skips `voxelWorkerSync.queueEdit()`** — blueprint blocks never bake to 3D tiles, unlike single-block placement. Unify both paths through one edit pipeline

### Architecture decisions (record each as an ADR in `docs/adr/`)

- [ ] **ADR-1: Walk-mode engine owner** — noa-engine vs. the custom voxel pipeline (`VoxelChunk`/`VoxelMesher`/`VoxelRenderer`/`VoxelWorkerSync` + `LuantiMapgen`). Three overlapping systems will keep generating integration bugs. Evaluate on: build pain (the git-dep override + CJS compat workarounds), old-iPad performance, and control. Pick one owner; delete or quarantine the rest
- [ ] **ADR-2: Viewer lifecycle** — replace `CesiumViewer.ts` module-level mutable singletons with an explicit state machine. Imagery-provider installation gets exactly one owner (the `GlobeView` effect). No more "Bug N fix" race patches
- [ ] **ADR-3: Audio strategy** — procedural Web Audio synth (`soundEngine.ts`) vs. sample playback (the placeholder `.ogg` library). Keep one engine interface so assets can swap in Phase 3 without touching call sites

### Refactors

- [ ] **Single voxel render path** — chunk mesher only; remove the per-block Cesium entity added in `placeCurrentStructure()` (keep the highlight-preview entity). This is the direct fix for the FPS block-flicker problem and scales past a few hundred placed blocks
- [ ] **Break up the god files** (>40KB each), extracting modules by responsibility with tests as the safety net:
  - `src/walk/WalkScene.ts` (51KB)
  - `src/globe/townStructures.ts` (49KB)
  - `src/globe/CesiumViewer.ts` (48KB)
  - `src/globe/entitySync.ts` (44KB)
  - `src/walk/PersistentWalkNpcManager.ts` (40KB)
  - `src/planet/terrain/PlanetTerrainSampler.ts` (40KB)

## Phase 2 — Performance & Mobile

*Goal: hit explicit budgets on target hardware, including the old iPad.*

- [ ] **Set budgets in `PERFORMANCE.md`** — e.g., 60 FPS desktop / 30 FPS old iPad, cap on live entities and draw calls, max main-thread frame time during tile bake
- [ ] **Bundle diet** — remove the duplicated `precision_*_rings.json` from `src/geo/` (single copy in `public/data/`), fetch + lazy-load instead of bundling ~2.2MB of GeoJSON; measure bundle before/after
- [ ] **All meshing/baking through `WorkerPool`** — no synchronous main-thread meshing
- [ ] **Regression harness** — scripted fly-through + walk session that records FPS; run on the old iPad at every milestone (closes out the `old-ipad-crash-fixes` plan)
- [ ] **Cache audit** — verify LRU bounds on `biomeTexture` and imagery caches under a long session

## Phase 3 — Asset Replacement (pre-distribution gate)

*Goal: every byte in the repo is safe to ship. Hard blocker for making the repo public or distributing builds.*

- [ ] **Replace placeholder block textures** with CC0 or original art (e.g., Kenney voxel packs) — keep identical filenames so no code changes are needed
- [ ] **Replace placeholder sfx** per the ADR-3 decision; if samples win, source CC0 audio and keep the synth engine as fallback
- [ ] **Remove hotlinked Unsplash heraldry URLs** in `realmGenerator.ts` — generate flags locally or ship them as bundled assets
- [ ] **Rename trademarked city names** (`Winterfell`) in `CITY_NAMES`
- [ ] **Write provenance into `docs/ASSETS.md`** — source + license for every asset
- [ ] **Final sweep:** no Mojang-derived filenames or bytes remain anywhere, including git history if the repo will go public

## Phase 4 — Worldgen & Gameplay Depth

*Goal: reproducible, living worlds.*

- [ ] **Seeded RNG everywhere** — `realmGenerator.ts` currently uses bare `Math.random()`; store the world seed in `world.properties` so realms are reproducible and shareable
- [ ] **Quest system** beyond the `questManager.ts` skeleton
- [ ] **NPC/mob persistence polish** — build on `PersistentWalkNpcManager` / `PersistentWalkMobManager`
- [ ] **Save/export hardening** — round-trip tests for `exportImport.ts`, schema versioning + migrations for IndexedDB saves
- [ ] **Out of scope until the engine is solid:** multiplayer, account systems, cloud saves

## Phase 5 — Release Readiness

- [ ] **E2E smoke tests** (Playwright): load globe → switch worlds → enter walk mode → place/break a block → save/reload
- [ ] **README rewrite** — screenshots, controls, setup (`.env` / Cesium ion token), scripts, roadmap link
- [ ] **Deployment config** — static host (Vercel/Netlify/Pages) with env-based tokens
- [ ] **Merge `dev` → `main`, tag `v0.1.0`,** create the first GitHub Release
- [ ] **License + public flip** — only after Phase 3 is fully verified

---

## Quick Wins (start here)

| Task | File | Effort |
|---|---|---|
| Fix undefined `now` in `playRelicDiscovered()` | `src/audio/soundEngine.ts` | ~5 min |
| Fix blueprint chunk-wrap + negative modulo | `src/drawing/FirstPersonBuilder.ts` | ~1 hr + tests |
| Route blueprints through `voxelWorkerSync.queueEdit()` | `src/drawing/FirstPersonBuilder.ts` | ~30 min |
| Remove per-block entity from block placement | `src/drawing/FirstPersonBuilder.ts` | ~1 hr |
| `.gitignore` + purge agent artifacts | repo root | ~30 min |
| CI workflow (typecheck + tests) | `.github/workflows/ci.yml` | ~1 hr |
| Delete `patches/`, archive stale plans | repo root | ~15 min |

## Working Agreements

- Conventional Commits, small and scoped — no more 4,700-line mega-commits mixing assets, features, and docs
- CI green is required to merge, even solo
- Agent session output (`agentoutput.txt`, trajectory logs, `.kilo/plans/`) never gets committed; plans live in `docs/plans/` and are deleted when done
- Every architectural fork gets an ADR *before* the code, not a "Bug N fix" comment after
