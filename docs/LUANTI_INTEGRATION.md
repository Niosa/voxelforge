# Luanti integration strategy

VoxelForge uses Luanti as a design and algorithm reference for its browser-based
walk mode. Luanti itself is a native C++ engine and is not embedded in the NOA
runtime.

## License boundary

- Luanti engine source is licensed under LGPL-2.1-or-later.
- Luanti textures, sounds, fonts, and bundled third-party components can use
  different licenses. Their individual notices must be checked before import.
- The initial node-group and active-node implementation in VoxelForge is an
  original TypeScript implementation based on documented behavior; it does not
  copy Luanti source or assets.
- Any future file that copies or adapts Luanti implementation code must retain
  its copyright and license notice, be listed in `docs/ASSETS.md`, and have its
  corresponding modified source made available under LGPL-2.1-or-later.

Reference source audited locally from
`D:/Documents/Development/voxelplanet-dev/external-resources/luanti-master`.

## Compatibility map

| Luanti system | VoxelForge approach | Priority |
| --- | --- | --- |
| Registered nodes, groups, drops, tool capabilities | TypeScript data registry above NOA | Now |
| Falling nodes, active block modifiers, node timers | Budgeted per-chunk active-node queue | Now |
| V7-style terrain fields, intersecting caves, clustered ores | Deterministic planet-space compiler stages | Implemented |
| Biomes, decorations, schematics, dungeons | Deterministic planet-space compiler stages | Next |
| Item stacks, inventories, crafting, wear | Persistent world/player data and React UI | Next |
| Liquid sources and flowing levels | Bounded active-node simulation with persistent levels | Next |
| Health, breath, damage, hunger, item entities | Walk gameplay components | Later |
| Lua mod API | Sandboxed, declarative TypeScript/JSON content API | Later |
| Irrlicht renderer, native networking, databases | Not portable; retain NOA/Babylon/browser storage | Excluded |

The key rule is deterministic planet coordinates: natural generation, active
node changes, and player edits must all serialize into the same world model so
walk mode and globe mode can eventually render the same compiled result.

## Gameplay parity scope

Luanti exposes roughly thirty major reusable engine systems: node and item
registration, groups, drops, tools, wear, inventories, crafting, metadata,
containers, node timers, ABMs/LBMs, falling nodes, liquids, lighting, entities,
player physics, health/damage/breath, HUDs, forms, sounds, particles, biomes,
ores, decorations, schematics, caves, dungeons, persistence, chat, privileges,
protection, networking, and a mod API.

Minecraft parity is larger than Luanti parity. Luanti is an engine, so Minecraft's
specific content and balancing—mobs, redstone-like circuits, hunger, experience,
enchanting, dimensions, farming progression, villages, raids, bosses, recipes,
and survival progression—must come from a game/content layer. VoxelForge can use
Luanti's engine patterns for nearly all of them, but should implement that content
as deterministic TypeScript systems that share the planet-space world model.
