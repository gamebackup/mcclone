// Dappled Forest feature placement.  All coordinates are chunk-local for
// writes inside the chunk; leaves that cross a border go through
// world.spawnBlock so neighbouring chunks receive them when they exist.
import { blockIds } from './blocks.js'
import { BIOMES, hash } from './noise.js'

// These mirror the facing bits in engine.js.  Importing engine here would
// create a cycle (engine -> chunk -> FeaturePlacer -> engine) and leave the
// facing constants in their temporal dead zone during module evaluation.
const NORTH = 0
const SOUTH = 0x4000
const EAST = 0x8000
const WEST = 0xC000

const POPLAR_LEAVES = [ 'redPoplarLeaves', 'orangePoplarLeaves', 'yellowPoplarLeaves' ]
const SHELF_FACING = [
	[ 1, 0, WEST ],
	[ -1, 0, EAST ],
	[ 0, 1, NORTH ],
	[ 0, -1, SOUTH ],
]

function blockAt(chunk, x, y, z, world) {
	if (x >= 0 && x < 16 && z >= 0 && z < 16) return chunk.getBlock(x, y, z)
	if (world && world.getWorldBlock) return world.getWorldBlock(chunk.x + x, y, chunk.z + z)
	return 0
}

function put(chunk, x, y, z, block, world, onlyEmpty) {
	if (x >= 0 && x < 16 && z >= 0 && z < 16) {
		if (!onlyEmpty || !chunk.getBlock(x, y, z)) chunk.setBlock(x, y, z, block)
		return
	}
	if (!world || !world.spawnBlock) return
	let wx = chunk.x + x
	let wz = chunk.z + z
	if (onlyEmpty && world.getWorldBlock && world.getWorldBlock(wx, y, wz)) return
	world.spawnBlock(wx, y, wz, block)
}

export class FeaturePlacer {
	constructor() {
		this.treeCount = 0
		this.fallenCount = 0
		this.shelfCount = 0
	}

	populate(chunk, rng, world, allowTrees) {
		let center = BIOMES[chunk.biomes[8 * 16 + 8]]
		if (!center || center.name !== 'dappled_forest') return false
		this.decorateFloor(chunk, rng, world)
		if (allowTrees !== false) {
			this.placePoplarTrees(chunk, rng, world)
			this.placeFallenLogs(chunk, rng, world)
		}
		return true
	}

	biomeAt(chunk, x, z) {
		return BIOMES[chunk.biomes[z * 16 + x]]
	}

	decorateFloor(chunk, rng, world) {
		for (let x = 0; x < 16; x++) {
			for (let z = 0; z < 16; z++) {
				let biome = this.biomeAt(chunk, x, z)
				if (!biome || biome.name !== 'dappled_forest') continue
				let ground = chunk.tops[z * 16 + x]
				if (chunk.getBlock(x, ground, z) !== blockIds.grass) continue
				if (chunk.getBlock(x, ground + 1, z)) continue
				let roll = rng()
				if (roll < 0.34) {
					// Leaf litter is a thin floor layer, not a replacement for
					// the grass below it.
					chunk.setBlock(x, ground + 1, z, blockIds.leafLitter)
				} else if (roll < 0.405) {
					chunk.setBlock(x, ground + 1, z, blockIds.redShrub)
				}
			}
		}
	}

	placePoplarTrees(chunk, rng, world) {
		for (let x = 2; x < 14; x++) {
			for (let z = 2; z < 14; z++) {
				let biome = this.biomeAt(chunk, x, z)
				if (!biome || biome.name !== 'dappled_forest') continue
				let ground = chunk.tops[z * 16 + x]
				if (chunk.getBlock(x, ground, z) !== blockIds.grass) continue
				if (chunk.getBlock(x, ground + 1, z)) continue
				if (rng() >= 0.032) continue
				this.poplarTree(chunk, x, ground, z, rng, world)
			}
		}
	}

	poplarTree(chunk, x, ground, z, rng, world) {
		let height = 6 + Math.floor(rng() * 4)
		let top = ground + height
		if (top + 2 >= 256) return
		let leaf = blockIds[POPLAR_LEAVES[Math.floor(rng() * POPLAR_LEAVES.length)]]
		if (!leaf) leaf = blockIds.orangePoplarLeaves
		this.treeCount++

		for (let y = ground + 1; y <= top; y++) put(chunk, x, y, z, blockIds.poplarLog, world, false)

		// Poplars have a narrow, upright crown.  The upper two layers overlap
		// the trunk, so placing only into empty cells preserves the wood.
		let layers = [
			[ -2, 2, 0.75 ],
			[ -1, 3, 0.85 ],
			[ 0, 3, 0.75 ],
			[ 1, 2, 0.55 ],
			[ 2, 1, 0.25 ],
		]
		for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
			let dy = layers[layerIndex][0]
			let radius = layers[layerIndex][1]
			let chance = layers[layerIndex][2]
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dz = -radius; dz <= radius; dz++) {
					if (!dx && !dz && dy <= 0) continue
					let distance = Math.abs(dx) + Math.abs(dz)
					if (distance > radius + 1) continue
					if (dx && dz && distance > radius) continue
					if (rng() > chance && distance > 1) continue
					put(chunk, x + dx, top + dy, z + dz, leaf, world, true)
				}
			}
		}
		put(chunk, x, top + 1, z, leaf, world, true)
		put(chunk, x + 1, top + 1, z, leaf, world, true)
		put(chunk, x - 1, top + 1, z, leaf, world, true)
		put(chunk, x, top + 1, z + 1, leaf, world, true)
		put(chunk, x, top + 1, z - 1, leaf, world, true)

		// Shelf mushrooms on the bark faces of the standing tree.  They grow
		// from a few random heights, mostly on the lower half of the trunk.
		for (let y = ground + 2; y < top - 1; y++) {
			if (rng() > 0.22) continue
			let side = SHELF_FACING[Math.floor(rng() * SHELF_FACING.length)]
			let sx = x + side[0], sz = z + side[1]
			if (!blockAt(chunk, sx, y, sz, world)) {
				let large = rng() < 0.24
				let block = large ? blockIds.largeShelfMushroom : blockIds.shelfMushroom
				if (block === undefined) block = blockIds.shelfMushroom
				put(chunk, sx, y, sz, block | side[2], world, false)
				this.shelfCount++
			}
		}
	}

	placeFallenLogs(chunk, rng, world) {
		// One or two horizontal poplar logs per Dappled Forest chunk.  This is
		// intentionally much more common than ordinary forest deadwood.
		let attempts = rng() < 0.55 ? 2 : 1
		for (let attempt = 0; attempt < attempts; attempt++) {
			let x = 2 + Math.floor(rng() * 12)
			let z = 2 + Math.floor(rng() * 12)
			let ground = chunk.tops[z * 16 + x]
			if (chunk.getBlock(x, ground, z) !== blockIds.grass) continue
			let axis = rng() < 0.5 ? 0 : 1
			let length = 3 + Math.floor(rng() * 4)
			let dir = rng() < 0.5 ? -1 : 1
			let made = 0
			for (let i = 0; i < length; i++) {
				let lx = x + (axis ? 0 : dir * i)
				let lz = z + (axis ? dir * i : 0)
				if (lx < 1 || lx > 14 || lz < 1 || lz > 14) break
				let localGround = chunk.tops[lz * 16 + lx]
				if (Math.abs(localGround - ground) > 1) break
				if (chunk.getBlock(lx, localGround, lz) !== blockIds.grass) break
				let y = localGround + 1
				if (chunk.getBlock(lx, y, lz)) break
				chunk.setBlock(lx, y, lz, blockIds.poplarLog)
				made++
				this.attachFallenShelf(chunk, lx, y, lz, axis, rng, world)
			}
			if (made > 1) this.fallenCount++
		}
	}

	attachFallenShelf(chunk, x, y, z, axis, rng, world) {
		if (rng() > 0.45) return
		// Pick a side perpendicular to the log, then put a shelf in the empty
		// cell adjacent to that bark face.
		let sides = axis
			? [ [ 1, 0, WEST ], [ -1, 0, EAST ] ]
			: [ [ 0, 1, NORTH ], [ 0, -1, SOUTH ] ]
		let side = sides[Math.floor(rng() * sides.length)]
		let sx = x + side[0], sz = z + side[1]
		if (!blockAt(chunk, sx, y, sz, world)) {
			let large = rng() < 0.28
			let block = large ? blockIds.largeShelfMushroom : blockIds.shelfMushroom
			if (block === undefined) block = blockIds.shelfMushroom
			chunk.setBlock(sx, y, sz, block | side[2])
			this.shelfCount++
		}
	}
}

// A stable hash is useful to callers that want to derive a decoration seed
// without touching the global Marsaglia stream.
export function poplarSeed(x, z) {
	return hash(x * 7919, z * 104729)
}
