// Landmark structures. Each one is built inside a single chunk from the
// blocks its Minecraft counterpart uses: a stepped sandstone desert pyramid
// with a TNT treasure room, a mossy jungle temple, a stilted swamp witch hut,
// a snow igloo with a basement, a ruined nether portal, and a pillager
// outpost. Placement is biome-filtered and uses the 26.3 structure-set
// spacing grids, so each type keeps its distance from the others.
import { blockIds } from './blocks.js'
import { BIOMES, hash } from './noise.js'
import { STAIR, NORTH, SOUTH, EAST, WEST, FACING_UP, BED_HEAD } from './engine.js'
import { findSite, clearAbove, STAIR_VARIANTS, FACING_NAMES } from './structures.js'

// Local helpers. All coordinates are chunk-local; y is absolute.
function put(chunk, ox, oz, x, y, z, block) {
	chunk.setBlock(ox + x, y, oz + z, block)
}
function fill(chunk, ox, oz, x0, y0, z0, x1, y1, z1, block) {
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			for (let z = z0; z <= z1; z++) put(chunk, ox, oz, x, y, z, block)
		}
	}
}
function hollow(chunk, ox, oz, x0, y0, z0, x1, y1, z1, block) {
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			for (let z = z0; z <= z1; z++) {
				if (x === x0 || x === x1 || z === z0 || z === z1) put(chunk, ox, oz, x, y, z, block)
			}
		}
	}
}
// Stairs carry their direction in the variant bits, exactly like the village
// blueprints do.
function stair(base, facing, top) {
	let i = FACING_NAMES.indexOf(facing)
	return base | STAIR | ((STAIR_VARIANTS[i] + (top ? 1 : 0)) << 13)
}
// Level the strip the building stands on: the top layer becomes the biome's
// surface block and the two beneath it get its subsoil.
function levelGround(chunk, site, width, depth, biome) {
	let sub = (biome.layers && biome.layers[0] && biome.layers[0][0]) || blockIds.dirt
	for (let x = 0; x < width; x++) {
		for (let z = 0; z < depth; z++) {
			for (let y = site.floorY; y > site.floorY - 3; y--) {
				if (!chunk.getBlock(site.ox + x, y, site.oz + z)) {
					let block = y === site.floorY ? biome.surface
						: y === site.floorY - 1 ? sub : blockIds.stone
					put(chunk, site.ox, site.oz, x, y, z, block)
				}
			}
		}
	}
}

// --- Desert pyramid -------------------------------------------------------
// 13x13 stepped pyramid: sandstone body, an orange terracotta band, cut and
// chiseled sandstone trim, and the vanilla hidden room with four chests and a
// TNT trap under a stone pressure plate.
function buildDesertPyramid(chunk, site) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	let SAND = blockIds.sandStone, CUT = blockIds.cutSandstone
	let CHIS = blockIds.chiseledSandstone, ORANGE = blockIds.orangeTerracotta
	let SMOOTH = blockIds.smoothSandstone
	for (let x = 0; x < 13; x++) {
		for (let z = 0; z < 13; z++) put(chunk, ox, oz, x, fy, z, SAND)
	}
	for (let level = 0; level < 6; level++) {
		let r = 6 - level
		let y = fy + 1 + level
		for (let x = 6 - r; x <= 6 + r; x++) {
			for (let z = 6 - r; z <= 6 + r; z++) {
				let edge = x === 6 - r || x === 6 + r || z === 6 - r || z === 6 + r
				if (!edge && level < 5) continue
				let corner = (x === 6 - r || x === 6 + r) && (z === 6 - r || z === 6 + r)
				let block = level === 1 ? ORANGE : level === 3 ? CUT : corner ? CHIS : SAND
				put(chunk, ox, oz, x, y, z, block)
			}
		}
	}
	put(chunk, ox, oz, 6, fy + 7, 6, CHIS)

	// Treasure room: 9x9 inside, three blocks tall, with a smooth floor.
	for (let x = 1; x <= 11; x++) {
		for (let z = 1; z <= 11; z++) {
			put(chunk, ox, oz, x, fy - 6, z, SMOOTH)
			put(chunk, ox, oz, x, fy - 2, z, SAND)
		}
	}
	for (let y = fy - 5; y <= fy - 3; y++) {
		for (let x = 1; x <= 11; x++) {
			for (let z = 1; z <= 11; z++) {
				let edge = x === 1 || x === 11 || z === 1 || z === 11
				if (edge) put(chunk, ox, oz, x, y, z, (x === 1 || x === 11) && (z === 1 || z === 11) ? CHIS : SAND)
			}
		}
	}
	// Chiseled pillars and the four loot chests in the corners.
	for (let p of [ [3, 3], [9, 3], [3, 9], [9, 9] ]) {
		put(chunk, ox, oz, p[0], fy - 5, p[1], blockIds.chest)
		put(chunk, ox, oz, p[0], fy - 4, p[1], 0)
	}
	for (let p of [ [5, 5], [7, 5], [5, 7], [7, 7] ]) {
		put(chunk, ox, oz, p[0], fy - 5, p[1], CHIS)
		put(chunk, ox, oz, p[0], fy - 4, p[1], CHIS)
	}
	put(chunk, ox, oz, 3, fy - 5, 2, blockIds.torch)
	put(chunk, ox, oz, 9, fy - 5, 2, blockIds.torch)

	// TNT under a pressure plate, hidden beneath the room floor.
	for (let x = 5; x <= 7; x++) {
		for (let z = 5; z <= 7; z++) put(chunk, ox, oz, x, fy - 7, z, blockIds.tnt)
	}
	put(chunk, ox, oz, 6, fy - 6, 6, blockIds.stonePressurePlate)

	// Entrance and staircase from the north face down into the room.
	put(chunk, ox, oz, 6, fy, 0, SAND)
	for (let z = 0; z <= 7; z++) {
		for (let y = fy - 6; y <= fy + 2; y++) put(chunk, ox, oz, 6, y, z, 0)
	}
	for (let i = 0; i <= 6; i++) {
		let z = 1 + i
		let top = fy - i
		for (let y = fy - 7; y < top; y++) {
			put(chunk, ox, oz, 6, y, z, y === top - 1 ? SMOOTH : SAND)
		}
	}
	put(chunk, ox, oz, 6, fy - 6, 7, SMOOTH)
	// Doorway and the hole through the room ceiling.
	put(chunk, ox, oz, 6, fy, 0, SAND)
	put(chunk, ox, oz, 6, fy - 2, 7, 0)
	put(chunk, ox, oz, 6, fy - 3, 7, 0)
}

// --- Jungle temple --------------------------------------------------------
// Mossy cobblestone shell with chiseled stone brick corners, stone brick
// stairs, cobwebs, inward-facing dispensers and a chest in the inner sanctum.
function buildJungleTemple(chunk, site, biome, rng) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	let MOSSY = blockIds.mossyCobblestone, COBBLE = blockIds.cobblestone
	let BRICK = blockIds.stoneBricks, CHIS = blockIds.chiseledStoneBricks
	let SLAB = blockIds.stoneBrickSlab
	for (let x = 0; x < 13; x++) {
		for (let z = 0; z < 13; z++) put(chunk, ox, oz, x, fy, z, BRICK)
	}
	for (let x = 0; x < 13; x++) {
		for (let z = 0; z < 13; z++) {
			let edge = x === 0 || x === 12 || z === 0 || z === 12
			if (!edge) continue
			for (let y = fy + 1; y <= fy + 3; y++) {
				let corner = (x === 0 || x === 12) && (z === 0 || z === 12)
				put(chunk, ox, oz, x, y, z, corner ? CHIS : (rng() < 0.45 ? MOSSY : COBBLE))
			}
		}
	}
	// Decorative stone brick stair cornice around the top of the shell.
	for (let x = 1; x < 12; x++) {
		put(chunk, ox, oz, x, fy + 4, 0, stair(BRICK, 'south', false))
		put(chunk, ox, oz, x, fy + 4, 12, stair(BRICK, 'north', false))
	}
	for (let z = 1; z < 12; z++) {
		put(chunk, ox, oz, 0, fy + 4, z, stair(BRICK, 'east', false))
		put(chunk, ox, oz, 12, fy + 4, z, stair(BRICK, 'west', false))
	}
	// Doorway on the north face.
	for (let y = fy + 1; y <= fy + 2; y++) put(chunk, ox, oz, 6, y, 0, 0)
	put(chunk, ox, oz, 6, fy + 3, 0, stair(BRICK, 'south', false))

	// Inner sanctum: 5x5 mossy room with a chiseled pedestal and a chest.
	hollow(chunk, ox, oz, 4, fy + 1, 4, 8, fy + 3, 8, MOSSY)
	for (let x = 4; x <= 8; x++) {
		for (let z = 4; z <= 8; z++) put(chunk, ox, oz, x, fy + 1, z, BRICK)
	}
	put(chunk, ox, oz, 6, fy + 2, 6, CHIS)
	put(chunk, ox, oz, 6, fy + 3, 6, blockIds.chest)
	put(chunk, ox, oz, 5, fy + 2, 5, blockIds.cobweb)
	put(chunk, ox, oz, 7, fy + 2, 7, blockIds.cobweb)
	put(chunk, ox, oz, 6, fy + 3, 4, 0)
	// Dispensers aimed into the sanctum, as the vanilla trap does.
	put(chunk, ox, oz, 5, fy + 3, 4, blockIds.dispenser | SOUTH)
	put(chunk, ox, oz, 7, fy + 3, 8, blockIds.dispenser | NORTH)
	put(chunk, ox, oz, 4, fy + 3, 5, blockIds.dispenser | EAST)
	put(chunk, ox, oz, 8, fy + 3, 7, blockIds.dispenser | WEST)

	// Upper storey with a jungle plank roof.
	hollow(chunk, ox, oz, 3, fy + 4, 3, 9, fy + 6, 9, (rng() < 0.5 ? MOSSY : BRICK))
	for (let x = 3; x <= 9; x++) {
		for (let z = 3; z <= 9; z++) put(chunk, ox, oz, x, fy + 7, z, blockIds.junglePlanks)
	}
	for (let x = 2; x <= 10; x++) {
		put(chunk, ox, oz, x, fy + 7, 2, stair(blockIds.jungleStairs, 'south', false))
		put(chunk, ox, oz, x, fy + 7, 10, stair(blockIds.jungleStairs, 'north', false))
	}
	for (let z = 2; z <= 10; z++) {
		put(chunk, ox, oz, 2, fy + 7, z, stair(blockIds.jungleStairs, 'east', false))
		put(chunk, ox, oz, 10, fy + 7, z, stair(blockIds.jungleStairs, 'west', false))
	}
	put(chunk, ox, oz, 6, fy + 8, 6, SLAB)

	// Treasure pit below the sanctum.
	fill(chunk, ox, oz, 4, fy - 3, 4, 8, fy - 3, 8, BRICK)
	hollow(chunk, ox, oz, 4, fy - 2, 4, 8, fy - 1, 8, MOSSY)
	put(chunk, ox, oz, 5, fy - 2, 5, blockIds.chest)
	put(chunk, ox, oz, 7, fy - 2, 7, blockIds.chest)
	put(chunk, ox, oz, 6, fy - 2, 6, blockIds.goldBlock)
	put(chunk, ox, oz, 6, fy - 1, 6, 0)
	// Shaft from the sanctum floor down to the pit.
	for (let y = fy - 2; y < fy + 1; y++) put(chunk, ox, oz, 6, y, 6, 0)
}

// --- Witch hut ------------------------------------------------------------
// Spruce stilt hut on a swamp: log legs, plank floor and walls, fence porch,
// spruce stair roof, cauldron and crafting table inside.
function buildWitchHut(chunk, site, biome) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	let LOG = blockIds.spruceLog, PLANK = blockIds.sprucePlanks
	let FENCE = blockIds.oakFence | FENCE_MASK
	for (let x = 0; x < 7; x++) {
		for (let z = 0; z < 7; z++) put(chunk, ox, oz, x, fy + 2, z, PLANK)
	}
	for (let p of [ [1, 1], [5, 1], [1, 5], [5, 5], [3, 1], [3, 5] ]) {
		for (let y = fy - 2; y <= fy + 2; y++) put(chunk, ox, oz, p[0], y, p[1], LOG)
	}
	for (let x = 1; x <= 5; x++) {
		for (let z = 1; z <= 5; z++) {
			let edge = x === 1 || x === 5 || z === 1 || z === 5
			if (!edge) continue
			for (let y = fy + 3; y <= fy + 5; y++) {
				let corner = (x === 1 || x === 5) && (z === 1 || z === 5)
				put(chunk, ox, oz, x, y, z, corner ? LOG : PLANK)
			}
		}
	}
	// Doorway and porch railing.
	for (let y = fy + 3; y <= fy + 4; y++) put(chunk, ox, oz, 3, y, 1, 0)
	for (let x = 0; x <= 6; x++) {
		for (let z = 0; z <= 6; z++) {
			let edge = x === 0 || x === 6 || z === 0 || z === 6
			if (!edge) continue
			if (x === 3 && z === 0) continue
			put(chunk, ox, oz, x, fy + 3, z, FENCE)
		}
	}
	// Spruce roof: stair ring, then two shrinking plank caps.
	for (let x = 1; x <= 5; x++) {
		put(chunk, ox, oz, x, fy + 6, 1, stair(blockIds.spruceStairs, 'south', false))
		put(chunk, ox, oz, x, fy + 6, 5, stair(blockIds.spruceStairs, 'north', false))
	}
	for (let z = 2; z <= 4; z++) {
		put(chunk, ox, oz, 1, fy + 6, z, stair(blockIds.spruceStairs, 'east', false))
		put(chunk, ox, oz, 5, fy + 6, z, stair(blockIds.spruceStairs, 'west', false))
	}
	fill(chunk, ox, oz, 2, fy + 6, 2, 4, fy + 6, 4, PLANK)
	fill(chunk, ox, oz, 3, fy + 7, 3, 3, fy + 7, 3, PLANK)
	put(chunk, ox, oz, 3, fy + 8, 3, blockIds.oakFence | FENCE_MASK)
	// Interior furnishings.
	put(chunk, ox, oz, 2, fy + 3, 2, blockIds.cauldron)
	put(chunk, ox, oz, 4, fy + 3, 2, blockIds.craftingTable)
	put(chunk, ox, oz, 2, fy + 3, 4, blockIds.brewingStand)
	put(chunk, ox, oz, 4, fy + 3, 3, blockIds.hayBlock)
	put(chunk, ox, oz, 5, fy + 3, 4, blockIds.lantern)
	// Swamp floor patches around the stilts.
	for (let x = -1; x <= 7; x++) {
		for (let z = -1; z <= 7; z++) {
			if (rng01(ox + x, oz + z) < 0.5) {
				put(chunk, ox, oz, x, fy, z, blockIds.mossCarpet)
			}
		}
	}
}
const FENCE_MASK = 0x7800
function rng01(x, z) {
	let n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
	return n - Math.floor(n)
}

// --- Igloo ----------------------------------------------------------------
// Snow block shell with white carpet, furnace, crafting table and a bed, plus
// the vanilla basement: stone brick room, iron bar cell, brewing stand and
// cauldron.
function buildIgloo(chunk, site) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	// blockIds.snow is the legacy 2px snow-layer model; the igloo needs the
	// solid snow block. Keep snowLayer for the thin terrain cover only.
	let SNOW = blockIds.snowBlock, BRICK = blockIds.stoneBricks, COBBLE = blockIds.cobblestone
	for (let x = 0; x < 7; x++) {
		for (let z = 0; z < 9; z++) put(chunk, ox, oz, x, fy, z, SNOW)
	}
	for (let x = 0; x < 7; x++) {
		for (let z = 0; z < 9; z++) {
			let edge = x === 0 || x === 6 || z === 0 || z === 8
			if (!edge) continue
			for (let y = fy + 1; y <= fy + 3; y++) put(chunk, ox, oz, x, y, z, SNOW)
		}
	}
	for (let x = 0; x < 7; x++) {
		for (let z = 0; z < 9; z++) put(chunk, ox, oz, x, fy + 4, z, SNOW)
	}
	fill(chunk, ox, oz, 1, fy + 5, 2, 5, fy + 5, 6, SNOW)
	fill(chunk, ox, oz, 2, fy + 6, 3, 4, fy + 6, 5, SNOW)
	for (let y = fy + 1; y <= fy + 2; y++) put(chunk, ox, oz, 3, y, 0, 0)
	// Interior: carpet, furnace, crafting table, bed, lantern.
	for (let x = 1; x <= 5; x++) {
		for (let z = 1; z <= 7; z++) put(chunk, ox, oz, x, fy, z, blockIds.whiteCarpet)
	}
	put(chunk, ox, oz, 1, fy + 1, 1, blockIds.furnace)
	put(chunk, ox, oz, 2, fy + 1, 1, blockIds.craftingTable)
	put(chunk, ox, oz, 4, fy + 1, 6, blockIds.whiteBed | NORTH)
	put(chunk, ox, oz, 4, fy + 1, 7, blockIds.whiteBed | BED_HEAD | NORTH)
	put(chunk, ox, oz, 5, fy + 1, 4, blockIds.lantern)
	// Basement under the back half, reached by a snow staircase.
	for (let x = 1; x <= 5; x++) {
		for (let z = 3; z <= 7; z++) {
			put(chunk, ox, oz, x, fy - 4, z, COBBLE)
			put(chunk, ox, oz, x, fy - 1, z, BRICK)
		}
	}
	hollow(chunk, ox, oz, 1, fy - 4, 3, 5, fy - 1, 7, BRICK)
	fill(chunk, ox, oz, 1, fy - 4, 3, 5, fy - 4, 7, COBBLE)
	put(chunk, ox, oz, 4, fy - 3, 4, blockIds.ironBars | FENCE_MASK)
	put(chunk, ox, oz, 4, fy - 3, 5, blockIds.ironBars | FENCE_MASK)
	put(chunk, ox, oz, 4, fy - 2, 4, blockIds.ironBars | FENCE_MASK)
	put(chunk, ox, oz, 4, fy - 2, 5, blockIds.ironBars | FENCE_MASK)
	put(chunk, ox, oz, 2, fy - 3, 6, blockIds.brewingStand)
	put(chunk, ox, oz, 1, fy - 3, 6, blockIds.cauldron)
	put(chunk, ox, oz, 2, fy - 3, 4, blockIds.chest)
	put(chunk, ox, oz, 5, fy - 3, 6, blockIds.lantern)
	// Stair shaft from the igloo floor down into the basement, one block
	// lower per step so it can be walked without a ladder.
	for (let z = 4; z <= 7; z++) {
		for (let y = fy - 4; y <= fy + 1; y++) put(chunk, ox, oz, 3, y, z, 0)
	}
	for (let i = 0; i <= 3; i++) {
		let z = 4 + i
		let top = fy - i
		for (let y = fy - 4; y < top; y++) put(chunk, ox, oz, 3, y, z, i === 3 ? BRICK : SNOW)
	}
}

// --- Ruined portal --------------------------------------------------------
// Broken obsidian frame with crying obsidian, netherrack ground, stone brick
// rubble, a gold block and a chest.
function buildRuinedPortal(chunk, site, biome, rng) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	for (let x = 0; x < 5; x++) {
		for (let z = 0; z < 5; z++) put(chunk, ox, oz, x, fy, z, blockIds.netherrack)
	}
	let frame = [
		[1, fy + 1, 1], [1, fy + 2, 1], [1, fy + 3, 1], [1, fy + 4, 1],
		[4, fy + 1, 1], [4, fy + 2, 1], [4, fy + 3, 1], [4, fy + 4, 1],
		[1, fy + 5, 1], [2, fy + 5, 1], [3, fy + 5, 1], [4, fy + 5, 1],
	]
	for (let f of frame) {
		let block = rng() < 0.3 ? blockIds.cryingObsidian : blockIds.obsidian
		if (rng() < 0.18) block = 0
		put(chunk, ox, oz, f[0], f[1], f[2], block)
	}
	put(chunk, ox, oz, 1, fy + 1, 1, blockIds.cryingObsidian)
	put(chunk, ox, oz, 2, fy + 1, 1, blockIds.obsidian)
	put(chunk, ox, oz, 3, fy + 1, 1, blockIds.obsidian)
	put(chunk, ox, oz, 0, fy, 0, blockIds.magmaBlock)
	put(chunk, ox, oz, 4, fy, 4, blockIds.goldBlock)
	put(chunk, ox, oz, 0, fy, 4, blockIds.chest)
	put(chunk, ox, oz, 4, fy, 0, stair(blockIds.stoneBrickStairs, 'south', false))
	put(chunk, ox, oz, 0, fy + 1, 2, stair(blockIds.stoneBrickStairs, 'east', false))
	put(chunk, ox, oz, 2, fy + 1, 4, blockIds.stoneBrickSlab)
	put(chunk, ox, oz, 3, fy + 1, 0, blockIds.cobblestone)
	put(chunk, ox, oz, 2, fy + 1, 2, blockIds.stoneBricks)
	put(chunk, ox, oz, 2, fy + 2, 2, blockIds.cryingObsidian)
}

// --- Pillager outpost -----------------------------------------------------
// Cobblestone plinth, dark oak log frame, plank lookout with fence railing, a
// stair roof, an outside staircase, a chest, hay bales and a fenced pen.
function buildPillagerOutpost(chunk, site) {
	let ox = site.ox, oz = site.oz, fy = site.floorY
	let LOG = blockIds.darkOakLog, PLANK = blockIds.darkOakPlanks
	let FENCE = blockIds.darkOakFence | FENCE_MASK, COBBLE = blockIds.cobblestone
	for (let x = 0; x < 9; x++) {
		for (let z = 0; z < 9; z++) put(chunk, ox, oz, x, fy, z, COBBLE)
	}
	for (let p of [ [1, 1], [7, 1], [1, 7], [7, 7] ]) {
		for (let y = fy + 1; y <= fy + 7; y++) put(chunk, ox, oz, p[0], y, p[1], LOG)
	}
	fill(chunk, ox, oz, 1, fy + 4, 1, 7, fy + 4, 7, PLANK)
	for (let y = fy + 5; y <= fy + 6; y++) {
		for (let x = 1; x <= 7; x++) {
			for (let z = 1; z <= 7; z++) {
				let edge = x === 1 || x === 7 || z === 1 || z === 7
				if (edge) put(chunk, ox, oz, x, y, z, PLANK)
			}
		}
	}
	for (let x = 1; x <= 7; x++) {
		for (let z = 1; z <= 7; z++) {
			let edge = x === 1 || x === 7 || z === 1 || z === 7
			if (edge) put(chunk, ox, oz, x, fy + 7, z, FENCE)
		}
	}
	// Roof and a dark oak stair climb up the outside.
	for (let x = 1; x <= 7; x++) {
		put(chunk, ox, oz, x, fy + 8, 1, stair(blockIds.darkOakStairs, 'south', false))
		put(chunk, ox, oz, x, fy + 8, 7, stair(blockIds.darkOakStairs, 'north', false))
	}
	for (let z = 2; z <= 6; z++) {
		put(chunk, ox, oz, 1, fy + 8, z, stair(blockIds.darkOakStairs, 'east', false))
		put(chunk, ox, oz, 7, fy + 8, z, stair(blockIds.darkOakStairs, 'west', false))
	}
	fill(chunk, ox, oz, 2, fy + 8, 2, 6, fy + 8, 6, PLANK)
	fill(chunk, ox, oz, 3, fy + 9, 3, 5, fy + 9, 5, PLANK)
	for (let i = 0; i < 4; i++) {
		put(chunk, ox, oz, 8, fy + 1 + i, 7 - i, stair(blockIds.cobblestoneStairs, 'west', false))
	}
	// Doorway from the outside staircase into the lookout.
	put(chunk, ox, oz, 7, fy + 5, 4, 0)
	put(chunk, ox, oz, 7, fy + 6, 4, 0)
	// Lookout interior.
	put(chunk, ox, oz, 2, fy + 5, 2, blockIds.chest)
	put(chunk, ox, oz, 6, fy + 5, 6, blockIds.barrel | FACING_UP)
	put(chunk, ox, oz, 4, fy + 5, 4, blockIds.craftingTable)
	put(chunk, ox, oz, 3, fy + 5, 6, blockIds.lantern)
	// Camp below: hay bales, a fenced pen and a campfire.
	fill(chunk, ox, oz, 0, fy + 1, 0, 0, fy + 1, 1, blockIds.hayBlock)
	put(chunk, ox, oz, 0, fy + 1, 2, blockIds.campfire)
	put(chunk, ox, oz, 8, fy + 1, 0, blockIds.hayBlock)
	for (let x = 0; x <= 4; x++) {
		put(chunk, ox, oz, x, fy + 1, 8, FENCE)
	}
	for (let z = 5; z <= 8; z++) {
		put(chunk, ox, oz, 0, fy + 1, z, FENCE)
	}
	put(chunk, ox, oz, 2, fy + 1, 6, blockIds.hayBlock)
}

// Landmark structure sets. spacing/separation/salt follow the 26.3
// random_spread structure sets, so each type gets at most one candidate chunk
// per grid cell instead of rolling independently on every chunk. The igloo
// grid is widened beyond the vanilla spacing to keep snowy repeats rare.
const LANDMARKS = [
	{ name: 'desert_pyramid', biomes: [ 'desert' ], chance: 0.6, spacing: 32, separation: 8, salt: 14357617, width: 13, depth: 13, height: 14, maxSlope: 3, build: buildDesertPyramid },
	{ name: 'jungle_temple', biomes: [ 'jungle' ], chance: 0.6, spacing: 32, separation: 8, salt: 14357619, width: 13, depth: 13, height: 14, maxSlope: 4, build: buildJungleTemple },
	{ name: 'witch_hut', biomes: [ 'swamp' ], chance: 0.55, spacing: 32, separation: 8, salt: 14357620, width: 7, depth: 7, height: 12, maxSlope: 3, build: buildWitchHut },
	// Igloo candidates are deliberately rarer than the other landmarks. With
	// a 32-chunk grid, several cells can put an igloo on the same snowy
	// horizon; 64/16 keeps candidate chunks at least 17 chunks (272 blocks)
	// apart, so repeated igloos cannot cluster within 100 blocks.
	{ name: 'igloo', biomes: [ 'snowy_plains', 'snowy_taiga' ], chance: 0.55, spacing: 64, separation: 16, salt: 14357618, width: 7, depth: 9, height: 12, maxSlope: 3, build: buildIgloo },
	{ name: 'ruined_portal', biomes: [ 'plains', 'forest', 'birch_forest', 'dark_forest', 'cherry_grove', 'flower_forest', 'meadow', 'taiga', 'savanna', 'jungle', 'swamp', 'desert', 'badlands' ], chance: 0.35, spacing: 40, separation: 15, salt: 34222645, width: 5, depth: 5, height: 8, maxSlope: 2, build: buildRuinedPortal },
	{ name: 'pillager_outpost', biomes: [ 'plains', 'savanna', 'taiga', 'desert' ], chance: 0.45, spacing: 32, separation: 8, salt: 165745296, width: 9, depth: 9, height: 14, maxSlope: 3, build: buildPillagerOutpost },
]

// A deterministic value in [0, 1) derived from the world seed and a cell.
function hash01(x, z) {
	return Math.abs(hash(x, z)) % 1
}

// 26.3 random_spread: each spacing x spacing cell chooses one chunk, keeping
// it at least separation chunks away from the cell edges. The separate salt
// keeps unrelated structure sets from sharing candidate chunks.
function isStructureCandidate(chunk, spec) {
	let cx = chunk.x >> 4
	let cz = chunk.z >> 4
	let cellX = Math.floor(cx / spec.spacing)
	let cellZ = Math.floor(cz / spec.spacing)
	let range = spec.spacing - spec.separation
	let salt = spec.salt
	let ox = cellX * spec.spacing + spec.separation + Math.floor(hash01(cellX * 1013 + salt, cellZ * 1013 - salt) * range)
	let oz = cellZ * spec.spacing + spec.separation + Math.floor(hash01(cellX * 1013 - salt, cellZ * 1013 + salt) * range)
	return cx === ox && cz === oz
}

// Place at most one landmark on a candidate chunk. The biome check runs at
// the candidate itself, so a portal cell in a non-portal biome stays empty.
export function placeLandmarkStructure(chunk, rng) {
	let biome = BIOMES[chunk.biomes[8 * 16 + 8]] || BIOMES[0]
	let options = LANDMARKS.filter(entry => entry.biomes.indexOf(biome.name) !== -1 && isStructureCandidate(chunk, entry))
	if (!options.length) return false
	let pick = options[(rng() * options.length) | 0]
	if (rng() > pick.chance) return false
	let site = findSite(chunk, pick, rng)
	if (!site) return false
	clearAbove(chunk, site.ox, site.oz, site.floorY, pick)
	levelGround(chunk, site, pick.width, pick.depth, biome)
	pick.build(chunk, site, biome, rng)
	return true
}
