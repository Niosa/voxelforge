# Demo Log

## Walk-mode citizens

1. Enter walk mode over a generated city or town and confirm the **Citizens loaded** counter is non-zero.
2. Watch citizens follow roads, pause at destinations, separate naturally in crowds, and resume their occupation-specific routines.
3. Change the time of day and observe farmers, guards, merchants, innkeepers, artisans, and laborers choose different destinations.
4. Aim at a citizen and right-click, press **E**, tap interact, or use the controller trigger to begin a conversation.
5. Ask about work, the town, or whether they need help; rapport and NPC memories persist when returning to the globe.

## Phase 0 — Bootstrap
1. Run `npm run dev` to launch the dev server.
2. Observe dark UI chrome overlaid on top of a 3D ocean-shaded globe (`#0c4a6e` base color).
3. Click **Load demo** button in top bar → sample continent "Aetherra" and city "Lumenport" populate into the Zustand store and sync to Cesium entities.
# Recent walk-mode performance check

- Enter walk mode in a dense city or town and move through a populated street.
- Compare grounded walking and creative flight; crowd updates should no longer cause periodic hitches.
- Watch nearby citizens separate naturally, follow schedules, and detour around a newly placed block.
- Return to the globe and re-enter the site to confirm block and NPC persistence.
- Fly above a flower field, then land; flowers and grass should remain anchored with no intersecting black cards.
- Slowly move the controller right stick, then make a full turn to verify precise low-speed and smooth full-speed looking.
- Fly vertically above doors, torches, grass, and flowers; every custom block should remain anchored to the terrain.
- Press I, select several materials from the creative inventory, and place them without resource limits.
- On a controller, press Y to open inventory, navigate with the D-pad or left stick, choose the active hotbar slot, then press A on a block to assign it; B closes inventory.
- Open and close several doors and confirm their orientation, collision, and distinct opening/closing sounds stay synchronized.
- Visit newly generated city parcels and confirm each building has a coherent roof material and diagonal roads do not pass through decorative trees.
- Check shaded faces on citizens, doors, and buildings; they should remain readable rather than falling nearly black.
- Visit several biomes to find deer, rabbits, horses, foxes, and goats standing and moving on the surface.
