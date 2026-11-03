// Village structures, driven by layouts extracted from Minecraft's 1.14+
// plains village structure set (small/medium houses, tool smith, meeting point,
// lamp). The blueprints are already rotated so their doors face north and are
// kept inside one 16x16 chunk.
//
// Layer characters are material roles, not block ids, so the same layout can
// use the oak, spruce, acacia, sandstone, or terracotta palette of its biome.
import { blockData, blockIds } from './blocks.js'
import { BIOMES } from './noise.js'
import {
	NORTH, EAST, SOUTH, WEST, STAIR, SLAB, DOOR_UPPER, DOOR_HINGE, FACING_UP,
	TORCH_HANGING, BED_HEAD, BASE_MASK, STATE_MASK
} from './engine.js'
import { VILLAGE_BLUEPRINTS } from './villageBlueprints.js'

// Fence connections live in state bits 11-14 (m << 11 for masks 1..15).
const FENCE_ALL = 0x7800
// FACING_NAMES order is north, east, south, west. Engine stair variants are
// [base(+south), north, east, west] x [bottom, top]; Minecraft south is +z.
const STAIR_VARIANTS = [ 2, 4, 0, 6 ]
const FACING_NAMES = [ 'north', 'east', 'south', 'west' ]

function housePalette(planks, log, foundation, trim, extra) {
	return Object.assign({
		foundation: foundation,
		floor: planks,
		wall: planks,
		frame: log,
		roof: planks,
		trim: trim,
		window: blockIds.glass,
		door: blockIds.oakDoor,
		ground: blockIds.grass,
		subsoil: blockIds.dirt,
		path: blockIds.coarseDirt,
		fence: blockIds.oakFence,
		bed: blockIds.whiteBed,
		bell: blockIds.goldBlock,
		table: blockIds.chest,
	}, extra || {})
}

const BIOME_PALETTES = {
	plains: housePalette(blockIds.oakPlanks, blockIds.oakLog, blockIds.cobblestone, blockIds.cobblestone),
	forest: housePalette(blockIds.oakPlanks, blockIds.oakLog, blockIds.cobblestone, blockIds.cobblestone),
	birch_forest: housePalette(blockIds.birchPlanks, blockIds.birchLog, blockIds.cobblestone, blockIds.cobblestone, {
		fence: blockIds.birchFence,
	}),
	dark_forest: housePalette(blockIds.darkOakPlanks, blockIds.darkOakLog, blockIds.cobblestone, blockIds.cobblestone, {
		fence: blockIds.darkOakFence,
	}),
	cherry_grove: housePalette(blockIds.cherryPlanks, blockIds.cherryLog, blockIds.cobblestone, blockIds.cobblestone, {
		fence: blockIds.cherryFence,
	}),
	flower_forest: housePalette(blockIds.oakPlanks, blockIds.oakLog, blockIds.cobblestone, blockIds.cobblestone),
	meadow: housePalette(blockIds.oakPlanks, blockIds.oakLog, blockIds.cobblestone, blockIds.cobblestone),
	taiga: housePalette(blockIds.sprucePlanks, blockIds.spruceLog, blockIds.cobblestone, blockIds.cobblestone, {
		fence: blockIds.spruceFence,
	}),
	snowy_taiga: housePalette(blockIds.sprucePlanks, blockIds.spruceLog, blockIds.cobblestone, blockIds.snowBlock, {
		fence: blockIds.spruceFence,
		ground: blockIds.snowBlock,
		path: blockIds.gravel,
	}),
	snowy_plains: housePalette(blockIds.sprucePlanks, blockIds.spruceLog, blockIds.cobblestone, blockIds.snowBlock, {
		ground: blockIds.snowBlock,
		path: blockIds.gravel,
	}),
	savanna: housePalette(blockIds.acaciaPlanks, blockIds.acaciaLog, blockIds.cobblestone, blockIds.terracotta, {
		fence: blockIds.acaciaFence,
		path: blockIds.coarseDirt,
	}),
	jungle: housePalette(blockIds.junglePlanks, blockIds.jungleLog, blockIds.cobblestone, blockIds.cobblestone, {
		fence: blockIds.jungleFence,
	}),
	swamp: housePalette(blockIds.oakPlanks, blockIds.oakLog, blockIds.mossyCobble, blockIds.mossyCobble, {
		path: blockIds.mossBlock,
	}),
	desert: {
		foundation: blockIds.sandStone,
		floor: blockIds.smoothSandStone,
		wall: blockIds.sandStone,
		frame: blockIds.smoothSandStone,
		roof: blockIds.sandStone,
		trim: blockIds.chiseledSandStone,
		window: blockIds.glass,
		door: blockIds.oakDoor,
		ground: blockIds.sand,
		subsoil: blockIds.sandStone,
		path: blockIds.smoothSandStone,
		fence: blockIds.oakFence,
		bed: blockIds.whiteBed,
		bell: blockIds.goldBlock,
		table: blockIds.chest,
	},
	badlands: {
		foundation: blockIds.redSandStone,
		floor: blockIds.redSandStone,
		wall: blockIds.terracotta,
		frame: blockIds.redSandStone,
		roof: blockIds.redSandStone,
		trim: blockIds.orangeTerracotta,
		window: blockIds.glass,
		door: blockIds.oakDoor,
		ground: blockIds.redSand,
		subsoil: blockIds.redSandStone,
		path: blockIds.redSandStone,
		fence: blockIds.oakFence,
		bed: blockIds.whiteBed,
		bell: blockIds.goldBlock,
		table: blockIds.chest,
	},
	stony_peaks: {
		foundation: blockIds.cobblestone,
		floor: blockIds.stoneBricks,
		wall: blockIds.stoneBricks,
		frame: blockIds.cobblestone,
		roof: blockIds.stoneBricks,
		trim: blockIds.cobblestone,
		window: blockIds.glass,
		door: blockIds.ironDoor,
		ground: blockIds.stone,
		subsoil: blockIds.cobblestone,
		path: blockIds.gravel,
		fence: blockIds.oakFence,
		bed: blockIds.whiteBed,
		bell: blockIds.goldBlock,
		table: blockIds.chest,
	},
}

function paletteFor(biome) {
	return (biome && BIOME_PALETTES[biome.name]) || BIOME_PALETTES.plains
}

// Workstations every 1.14+ village house is furnished with. Merged into every
// biome palette so a house is not just planks, a bed and a torch.
const VILLAGE_WORKSTATIONS = {
	workbench: blockIds.craftingTable,
	furnace: blockIds.furnace,
	chest: blockIds.chest,
	barrel: blockIds.barrel,
	composter: blockIds.composter,
	cartography: blockIds.cartographyTable,
	smithing: blockIds.smithingTable,
	stonecutter: blockIds.stonecutter,
	grindstone: blockIds.grindstone,
	loom: blockIds.loom,
	lectern: blockIds.lectern,
	cauldron: blockIds.cauldron,
	lantern: blockIds.lantern,
	hay: blockIds.hayBlock,
	bookshelf: blockIds.bookshelf,
}
for (let name in BIOME_PALETTES) Object.assign(BIOME_PALETTES[name], VILLAGE_WORKSTATIONS)

function isSolid(block) {
	if (!block) return false
	let data = blockData[block & STATE_MASK]
	return !!data && !data.cross && !data.torch && !data.fence && !data.door && !data.trap && !data.liquid
}

function bedWallChar(ch) {
	return ch === '#' || ch === 'L' || ch === 'P' || ch === 'G'
}

// Cache the stair direction metadata so the hot placement loop does not scan
// the metadata array for every cell.
for (let spec of VILLAGE_BLUEPRINTS) {
	spec.stairMap = new Map()
	for (let entry of spec.stairs) {
		spec.stairMap.set(entry[0] + ',' + entry[1] + ',' + entry[2], entry)
	}
}

// Pair the two-cell household beds at runtime. structures.js and engine.js
// import each other, so the facing constants are not initialized while this
// module is first evaluated; doing this lazily avoids that TDZ trap. The head
// goes against the wall at the outer end of the pair, and both cells receive
// the same facing.
function prepareBedMap(spec) {
	spec.bedMap = new Map()
	let usedBeds = new Set()
	for (let y = 0; y < spec.height; y++) {
		let layer = spec.layers[y]
		for (let z = 0; z < spec.depth; z++) {
			for (let x = 0; x < spec.width; x++) {
				if (layer[z][x] !== 'b') continue
				let key = x + ',' + y + ',' + z
				if (usedBeds.has(key)) continue
				let neighbor = null
				for (let dir of [ [1, 0], [-1, 0], [0, 1], [0, -1] ]) {
					let nx = x + dir[0], nz = z + dir[1]
					if (nx < 0 || nx >= spec.width || nz < 0 || nz >= spec.depth) continue
					if (layer[nz][nx] === 'b') {
						neighbor = [ nx, nz ]
						break
					}
				}
				if (!neighbor) continue
				usedBeds.add(key)
				usedBeds.add(neighbor[0] + ',' + y + ',' + neighbor[1])
				let cell = [ x, z ]
				let walled = (a, b) => {
					let ox = a[0] + (a[0] - b[0])
					let oz = a[1] + (a[1] - b[1])
					if (ox < 0 || ox >= spec.width || oz < 0 || oz >= spec.depth) return false
					return bedWallChar(layer[oz][ox])
				}
				let head = cell
				if (walled(neighbor, cell) && !walled(cell, neighbor)) {
					head = neighbor
				} else if (walled(cell, neighbor) && walled(neighbor, cell)) {
					if (neighbor[1] > z || (neighbor[1] === z && neighbor[0] > x)) head = neighbor
				} else if (!walled(cell, neighbor) && !walled(neighbor, cell)) {
					if (neighbor[1] > z || (neighbor[1] === z && neighbor[0] > x)) head = neighbor
				}
				let foot = head === cell ? neighbor : cell
				let dx = head[0] - foot[0]
				let dz = head[1] - foot[1]
				let facing = dx > 0 ? EAST : dx < 0 ? WEST : (dz > 0 ? NORTH : SOUTH)
				spec.bedMap.set(head[0] + ',' + y + ',' + head[1], BED_HEAD | facing)
				spec.bedMap.set(foot[0] + ',' + y + ',' + foot[1], facing)
			}
		}
	}
}

function weightedStructure(rng) {
	let total = 0
	for (let spec of VILLAGE_BLUEPRINTS) total += spec.weight
	let pick = rng() * total
	for (let spec of VILLAGE_BLUEPRINTS) {
		pick -= spec.weight
		if (pick < 0) return spec
	}
	return VILLAGE_BLUEPRINTS[0]
}

// Pick the flattest site that fits the footprint, leaving at least one block
// between the building and the chunk border.
export function findSite(chunk, spec, rng) {
	let maxX = 15 - spec.width
	let maxZ = 15 - spec.depth
	if (maxX < 1 || maxZ < 1) return null
	let best = null
	for (let ox = 1; ox <= maxX; ox++) {
		for (let oz = 1; oz <= maxZ; oz++) {
			let minG = 255, maxG = 0
			let usable = true
			for (let x = 0; x < spec.width && usable; x++) {
				for (let z = 0; z < spec.depth; z++) {
					let g = chunk.tops[(oz + z) * 16 + (ox + x)]
					let block = chunk.getBlock(ox + x, g, oz + z)
					let data = blockData[block & STATE_MASK]
					if (!block || (data && data.liquid)) {
						usable = false
						break
					}
					if (g < minG) minG = g
					if (g > maxG) maxG = g
				}
			}
			if (!usable) continue
			let slope = maxG - minG
			if (slope > spec.maxSlope || maxG < 3) continue
			let score = slope * 10 + rng() * 0.75
			if (!best || score < best.score) {
				best = { ox: ox, oz: oz, floorY: maxG, score: score }
			}
		}
	}
	return best
}

export function clearAbove(chunk, ox, oz, floorY, spec) {
	let top = floorY + spec.height + 1
	for (let x = ox - 1; x <= ox + spec.width; x++) {
		for (let z = oz - 1; z <= oz + spec.depth; z++) {
			for (let y = floorY + 1; y <= top; y++) {
				chunk.setBlock(x, y, z, 0)
			}
		}
	}
}

function placeFoundation(chunk, ox, oz, floorY, spec, pal) {
	for (let x = 0; x < spec.width; x++) {
		for (let z = 0; z < spec.depth; z++) {
			if (spec.layers[0][z][x] === '.') continue
			let g = chunk.tops[(oz + z) * 16 + (ox + x)]
			for (let y = g; y < floorY; y++) {
				chunk.setBlock(ox + x, y, oz + z, pal.foundation)
			}
		}
	}
}

function buildBlueprint(chunk, spec, site, pal, rng) {
	if (!spec.bedMap) prepareBedMap(spec)
	let ox = site.ox, oz = site.oz, floorY = site.floorY
	clearAbove(chunk, ox, oz, floorY, spec)
	placeFoundation(chunk, ox, oz, floorY, spec, pal)

	for (let y = 0; y < spec.height; y++) {
		let layer = spec.layers[y]
		for (let z = 0; z < spec.depth; z++) {
			let row = layer[z]
			for (let x = 0; x < spec.width; x++) {
				let ch = row[x]
				if (ch === '.' || ch === 'D' || ch === 't') continue
				let block = 0
				switch (ch) {
					case '#': block = pal.foundation; break
					case 'P': block = pal.wall; break
					case 'L': block = pal.frame; break
					case 'G': block = pal.window; break
					case 'g': block = pal.ground; break
					case 'd': block = pal.subsoil; break
					case 'p': block = pal.path; break
					case 'w': block = blockIds.water; break
					case 'F': block = blockIds.farmland; break
					case 'c': block = blockIds.wheat; break
					case 'v': block = blockIds.carrots; break
					case 'o': block = blockIds.potatoes; break
					case 'B': block = blockIds.bookshelf; break
					case 'f': block = pal.fence | FENCE_ALL; chunk.hasFence = true; break
					case 'b': {
						let bedState = spec.bedMap.get(x + ',' + y + ',' + z)
						if (bedState !== undefined) block = pal.bed | bedState
						break
					}
					case 'q': block = pal.wall | SLAB; break
					case 'n': block = pal.bell; break
					case 'm': block = pal.table; break
					case 'S': {
						let meta = spec.stairMap.get(x + ',' + y + ',' + z)
						if (!meta) break
						let facing = FACING_NAMES.indexOf(meta[3])
						let variant = STAIR_VARIANTS[facing] + (meta[4] ? 1 : 0)
						block = (meta[5] ? pal.foundation : pal.roof) | STAIR | (variant << 13)
						break
					}
					default: break
				}
				if (block) chunk.setBlock(ox + x, floorY + y, oz + z, block)
			}
		}
	}

	let doorFacings = [ NORTH, EAST, SOUTH, WEST ]
	for (let door of spec.doors) {
		let facing = FACING_NAMES.indexOf(door[3])
		let state = pal.door | doorFacings[facing]
		if (door[4]) state |= DOOR_UPPER
		if (door[5]) state |= DOOR_HINGE
		chunk.setBlock(ox + door[0], floorY + door[1], oz + door[2], state)
	}

	// The lamp is a post with four wall torches, but this engine only models
	// standing/hanging torches. Put a single lit torch on top of the post.
	if (spec.kind === 'lamp') {
		chunk.setBlock(ox + 1, floorY + 3, oz + 1, blockIds.torch)
		return
	}

	for (let torch of spec.torches) {
		let x = ox + torch[0], y = floorY + torch[1], z = oz + torch[2]
		if (chunk.getBlock(x, y, z)) continue
		if (isSolid(chunk.getBlock(x, y + 1, z))) {
			chunk.setBlock(x, y, z, blockIds.torch | TORCH_HANGING)
			continue
		}
		// Wall torches have no wall state in this engine; lower them onto the
		// nearest floor below so interiors still get their light.
		let ty = y
		while (ty > floorY + 1 && !chunk.getBlock(x, ty - 1, z)) ty--
		if (!chunk.getBlock(x, ty, z) && isSolid(chunk.getBlock(x, ty - 1, z))) {
			chunk.setBlock(x, ty, z, blockIds.torch)
		}
	}
	furnishHouse(chunk, spec, site, pal, rng)
}

// Furnish a house with the workstations its vanilla counterpart has. Only
// empty floor cells away from the doorway are used, so beds, stairs and the
// door keep working; furniture is spaced out so it never forms a wall.
const HOUSE_WORKSTATIONS = [
	'workbench', 'furnace', 'chest', 'barrel', 'composter', 'cartography',
	'smithing', 'stonecutter', 'grindstone', 'loom', 'lectern', 'cauldron',
]
function furnishHouse(chunk, spec, site, pal, rng) {
	if (spec.kind !== 'house') return
	let ox = site.ox, oz = site.oz, floorY = site.floorY
	let want = 4 + (rng() * 3 | 0)
	let placed = 0
	let used = new Set()
	let taken = new Set()
	let nearDoor = (x, z) => spec.doors.some(d => Math.abs(d[0] - x) + Math.abs(d[2] - z) <= 2)
	let free = (x, z) => {
		if (chunk.getBlock(ox + x, floorY + 1, oz + z)) return false
		if (!chunk.getBlock(ox + x, floorY, oz + z)) return false
		return !nearDoor(x, z)
	}
	for (let x = 1; x < spec.width - 1 && placed < want; x++) {
		for (let z = 1; z < spec.depth - 1 && placed < want; z++) {
			if (!free(x, z)) continue
			if (taken.has((x + 1) + ',' + z) || taken.has((x - 1) + ',' + z) ||
				taken.has(x + ',' + (z + 1)) || taken.has(x + ',' + (z - 1))) continue
			let role = HOUSE_WORKSTATIONS[(rng() * HOUSE_WORKSTATIONS.length) | 0]
			if (!pal[role]) continue
			// Keep the first four stations distinct, then allow a second barrel
			// or chest the way larger vanilla houses have them.
			if (used.has(role) && placed < 4) continue
			used.add(role)
			taken.add(x + ',' + z)
			let block = pal[role]
			if (role === 'barrel') block |= FACING_UP
			chunk.setBlock(ox + x, floorY + 1, oz + z, block)
			placed++
		}
	}
	// One lantern lights the interior, like the torches in vanilla houses.
	for (let x = 2; x < spec.width - 2; x++) {
		for (let z = 2; z < spec.depth - 2; z++) {
			if (!free(x, z) || taken.has(x + ',' + z)) continue
			chunk.setBlock(ox + x, floorY + 1, oz + z, pal.lantern)
			return
		}
	}
}

// Build one village building inside `chunk` (local 0..15 coordinates).
// Returns true when a suitable site was found and the building was placed.
export function placeVillageStructure(chunk, rng) {
	let spec = weightedStructure(rng)
	let site = findSite(chunk, spec, rng)
	if (!site) return false
	let biome = BIOMES[chunk.biomes[site.oz * 16 + site.ox]] || BIOMES[0]
	buildBlueprint(chunk, spec, site, paletteFor(biome), rng)
	return true
}

export { STAIR_VARIANTS, FACING_NAMES }
