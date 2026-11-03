// Abandoned Camps: a rare one-chunk structure with a biome-matched timber
// palette, storage loot and single-use straw beds.  Keeping the whole camp
// inside one chunk avoids writing into neighbours that have not generated yet.
import { blockIds } from './blocks.js'
import { BIOMES, hash } from './noise.js'
import { itemIds } from './items.js'

// Fixed state bits from engine.js.  Local copies avoid a module cycle while
// the chunk generator imports this module during engine initialization.
const EAST = 0x8000
const FACING_UP = 0x2000
const BED_HEAD = 0x800

const SUPPORTED_BIOMES = new Set([ 'plains', 'forest', 'birch_forest', 'taiga', 'dappled_forest' ])

const PALETTES = {
	plains: { planks: 'oakPlanks', log: 'oakLog', fence: 'oakFence' },
	forest: { planks: 'oakPlanks', log: 'oakLog', fence: 'oakFence' },
	birch_forest: { planks: 'birchPlanks', log: 'birchLog', fence: 'birchFence' },
	taiga: { planks: 'sprucePlanks', log: 'spruceLog', fence: 'spruceFence' },
	dappled_forest: { planks: 'poplarPlanks', log: 'poplarLog', fence: 'poplarFence' },
}

function hash01(x, z) {
	return Math.abs(hash(x, z)) % 1
}

function blockId(name) {
	return blockIds[name] === undefined ? 0 : blockIds[name]
}

export class StructureSpawner {
	constructor(options) {
		options = options || {}
		this.spacing = options.spacing || 9
		this.separation = options.separation || 2
		this.salt = options.salt || 7913471
		this.chance = options.chance === undefined ? 0.62 : options.chance
	}

	// 26.3-style random spread: every cell chooses one candidate chunk.
	candidate(cx, cz) {
		let cellX = Math.floor(cx / this.spacing)
		let cellZ = Math.floor(cz / this.spacing)
		let range = this.spacing - this.separation
		let salt = this.salt
		let ox = cellX * this.spacing + this.separation +
			Math.floor(hash01(cellX * 1013 + salt, cellZ * 1013 - salt) * range)
		let oz = cellZ * this.spacing + this.separation +
			Math.floor(hash01(cellX * 1013 - salt, cellZ * 1013 + salt) * range)
		return { x: ox, z: oz, cellX: cellX, cellZ: cellZ }
	}

	populate(chunk, rng, world) {
		let cx = chunk.x >> 4
		let cz = chunk.z >> 4
		let candidate = this.candidate(cx, cz)
		if (candidate.x !== cx || candidate.z !== cz) return false
		if (rng() > this.chance) return false

		let biome = BIOMES[chunk.biomes[8 * 16 + 8]]
		if (!biome || !SUPPORTED_BIOMES.has(biome.name)) return false
		let palette = PALETTES[biome.name]
		if (!palette) return false
		let planks = blockId(palette.planks)
		let log = blockId(palette.log)
		let fence = blockId(palette.fence) || blockId('oakFence')

		// Keep a 9x9 footprint away from the chunk edges.  The candidate
		// position is stable per cell, while the small offset makes camps feel
		// less grid-like.
		let ox = 3 + Math.floor(rng() * 5)
		let oz = 3 + Math.floor(rng() * 5)
		let ground = chunk.tops[(oz + 4) * 16 + ox + 4]
		for (let x = 0; x < 9; x += 2) {
			for (let z = 0; z < 9; z += 2) {
				let h = chunk.tops[(oz + z) * 16 + ox + x]
				if (Math.abs(h - ground) > 2) return false
			}
		}

		this.prepareGround(chunk, ox, oz, ground, biome)
		this.buildCamp(chunk, ox, oz, ground, planks, log, fence, rng)
		this.fillStorage(chunk, ox, oz, ground, biome, rng, world)
		return true
	}

	prepareGround(chunk, ox, oz, ground, biome) {
		let subsoil = biome.layers && biome.layers[0] ? biome.layers[0][0] : blockIds.dirt
		for (let x = 0; x < 9; x++) {
			for (let z = 0; z < 9; z++) {
				for (let y = ground; y > ground - 3; y--) {
					if (!chunk.getBlock(ox + x, y, oz + z)) {
						chunk.setBlock(ox + x, y, oz + z, y === ground ? biome.surface : y === ground - 1 ? subsoil : blockIds.stone)
					}
				}
				for (let y = ground + 1; y <= ground + 6; y++) {
					chunk.setBlock(ox + x, y, oz + z, blockIds.air)
				}
			}
		}
	}

	buildCamp(chunk, ox, oz, ground, planks, log, fence, rng) {
		let y = ground + 1
		// A trampled central clearing with a small fire pit.
		for (let x = 2; x <= 6; x++) {
			for (let z = 2; z <= 6; z++) {
				if ((x === 2 || x === 6) && (z === 2 || z === 6)) continue
				if (x === 4 && z === 4) chunk.setBlock(ox + x, y, oz + z, blockId('campfire'))
				else if (rng() < 0.22) chunk.setBlock(ox + x, y, oz + z, blockId('cobblestone'))
			}
		}
		chunk.setBlock(ox + 4, y, oz + 3, log)
		chunk.setBlock(ox + 4, y, oz + 5, log)

		// Lean-to: four log uprights, a plank roof and two straw beds.  The
		// open side faces the fire pit.
		let sx = 5, sz = 1, ex = 8, ez = 5
		for (let px = sx; px <= ex; px += ex - sx) {
			for (let pz = sz; pz <= ez; pz += ez - sz) {
				for (let py = 0; py < 3; py++) chunk.setBlock(ox + px, y + py, oz + pz, log)
			}
		}
		for (let px = sx - 1; px <= ex + 1; px++) {
			for (let pz = sz - 1; pz <= ez + 1; pz++) {
				let edge = px === sx - 1 || px === ex + 1 || pz === sz - 1 || pz === ez + 1
				if (!edge && rng() < 0.5) continue
				chunk.setBlock(ox + px, y + 3, oz + pz, planks)
			}
		}
		// Beds sit lengthwise along the back of the shelter.
		chunk.setBlock(ox + 6, y, oz + 3, blockIds.strawBed)
		chunk.setBlock(ox + 6, y, oz + 4, blockIds.strawBed | BED_HEAD)
		chunk.setBlock(ox + 7, y, oz + 3, blockIds.strawBed)
		chunk.setBlock(ox + 7, y, oz + 4, blockIds.strawBed | BED_HEAD)

		// A small fence rail and a fallen log bench around the fire.
		chunk.setBlock(ox + 1, y, oz + 2, fence)
		chunk.setBlock(ox + 2, y, oz + 2, fence)
		chunk.setBlock(ox + 1, y, oz + 2, fence)
		chunk.setBlock(ox + 1, y + 1, oz + 2, fence)
		chunk.setBlock(ox + 2, y + 1, oz + 2, fence)
		chunk.setBlock(ox + 2, y, oz + 5, log)
		chunk.setBlock(ox + 3, y, oz + 5, log)
		// Chests and a barrel on the open side.
		chunk.setBlock(ox + 1, y, oz + 6, blockIds.chest | EAST)
		chunk.setBlock(ox + 1, y, oz + 7, blockIds.barrel | FACING_UP)
		chunk.setBlock(ox + 6, y, oz + 1, blockIds.barrel | FACING_UP)

		// A couple of expedition crates outside the tent.
		chunk.setBlock(ox + 7, y, oz + 6, planks)
		chunk.setBlock(ox + 7, y, oz + 7, planks)
	}

	fillStorage(chunk, ox, oz, ground, biome, rng, world) {
		let positions = [
			[ ox + 1, ground + 1, oz + 6 ],
			[ ox + 1, ground + 1, oz + 7 ],
			[ ox + 6, ground + 1, oz + 1 ],
		]
		for (let i = 0; i < positions.length; i++) {
			let pos = positions[i]
			let state = chunk.getBlock(pos[0], pos[1], pos[2]) & 0x7ff
			if (state !== blockIds.chest && state !== blockIds.barrel) continue
			if (!world || !world.getChest) continue
			let slots = world.getChest(pos[0], pos[1], pos[2])
			this.putLoot(slots, biome.name, rng)
		}
	}

	putLoot(slots, biomeName, rng) {
		let mapName = biomeName === 'birch_forest' ? 'birchExplorerMap'
			: biomeName === 'taiga' ? 'taigaExplorerMap'
			: biomeName === 'dappled_forest' ? 'dappledExplorerMap'
			: 'plainsExplorerMap'
		let pool = [
			{ id: itemIds.bread, count: 2 + Math.floor(rng() * 4) },
			{ id: blockIds.torch, count: 3 + Math.floor(rng() * 5) },
			{ id: itemIds.arrow, count: 4 + Math.floor(rng() * 9) },
			{ id: itemIds.ironIngot, count: 1 + Math.floor(rng() * 2) },
			{ id: itemIds.string, count: 1 + Math.floor(rng() * 3) },
			{ id: itemIds.leather, count: 1 + Math.floor(rng() * 2) },
			{ id: itemIds.cookedBeef, count: 1 + Math.floor(rng() * 2) },
			{ id: itemIds.goldNugget, count: 2 + Math.floor(rng() * 4) },
			{ id: itemIds.emerald, count: 1 },
			{ id: blockIds.strawBed, count: 1 },
			{ id: itemIds[mapName] || itemIds.map, count: 1 },
		].filter(entry => entry.id !== undefined)
		let rolls = 3 + Math.floor(rng() * 4)
		let used = new Set()
		for (let roll = 0; roll < rolls; roll++) {
			let entry = pool[Math.floor(rng() * pool.length)]
			if (!entry) continue
			let slot = Math.floor(rng() * 27)
			while (used.has(slot) && used.size < 27) slot = (slot + 1) % 27
			if (used.size >= 27) break
			used.add(slot)
			slots[slot] = { id: entry.id, count: Math.max(1, entry.count | 0) }
		}
	}
}

export { SUPPORTED_BIOMES, PALETTES }
