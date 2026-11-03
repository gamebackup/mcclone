# Project notes

Browser Minecraft clone. Static ES modules, no build step and no npm dependencies;
serve the folder over HTTP and open `index.html`. Keep block ids/names append-only so
existing IndexedDB saves keep working. `src/game.js.bak` is an intentional backup — do
not delete or edit it.

## Minecraft 26.3 reference assets

Use this GitHub Repository  as the source of truth for Minecraft 26.3 textures,
block models, blockstates and language names instead of inventing geometry or names:

- Repo: https://github.com/InventivetalentDev/minecraft-assets/tree/26.3
- Branch: `26.3`
- Raw URL pattern:
  `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/26.3/assets/minecraft/<path>`

Verified paths (200 from the raw URL):

- `assets/minecraft/textures/block/water_still.png`
- `assets/minecraft/textures/block/lava_still.png`
- `assets/minecraft/blockstates/oak_stairs.json`
- `assets/minecraft/blockstates/water.json`
- `assets/minecraft/models/block/oak_stairs.json`
- `assets/minecraft/models/block/stairs.json`
- `assets/minecraft/models/block/inner_stairs.json`
- `assets/minecraft/models/block/outer_stairs.json`
- `assets/minecraft/lang/en_us.json`

Conventions:

- The pack uses snake_case (`oak_planks`, `water_still`); this project's texture files
  are camelCase (`oakPlanks.png`). Save a downloaded texture under the name the project
  already uses, and keep block registry names/ids unchanged.
- Prefer the real 26.3 model/blockstate (for example `stairs.json`, `inner_stairs.json`,
  `outer_stairs.json`) and the real `en_us.json` display names when adding or fixing
  blocks, items and UI labels.
- Fetch only the files needed for the change being made; do not bulk-import the pack
  unless asked.
- Example:
  `curl -L -o textures/oakPlanks.png https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/26.3/assets/minecraft/textures/block/oak_planks.png`
