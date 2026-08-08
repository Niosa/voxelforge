# ADR-3: Audio Strategy

- Status: Proposed
- Date: 2026-08-07

## Context

Two audio approaches coexist:

1. **Procedural synth** — `src/audio/soundEngine.ts`: Web Audio oscillators/noise, zero assets, retro character
2. **Sample library** — `resources/sfx/`: placeholder `.ogg` files (to be replaced with CC0/original audio in Phase 3)

## Decision (proposed)

Keep **one engine interface** (the `soundEngine` facade) with two backends:

- Synth backend for UI feedback and prototyping
- Sample backend for ambient/mob/step audio once licensed assets land (Phase 3)

Call sites only ever talk to the facade, so Phase 3 asset swaps touch no game code.

## Consequences

- `resources/sfx/` stays out of the bundle until the sample backend ships; placeholders are replaced per the Phase 3 gate before any public distribution.
