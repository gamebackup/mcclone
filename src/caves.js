// Cave generation.
//
// Minecraft's caves are not blobs: most of them are long tunnels cut by the
// intersection of two 3D noise isosurfaces ("spaghetti" caves), with wider
// low-frequency "cheese" caverns and the occasional open ravine. This module
// samples each field on a coarse lattice and interpolates it per block, which
// keeps a 16x16x16 section cheap enough to carve while generating chunks.
//
// The cavern field below uses the 26.3 worldgen noise definitions rather than
// an arbitrary threshold:
//   data/minecraft/worldgen/noise/cave_cheese.json
//   data/minecraft/worldgen/noise/cave_layer.json
//   data/minecraft/worldgen/density_function/overworld/final_density.json
// The final_density expression adds 0.27 to cave_cheese, adds four times the
// square of cave_layer, and then uses a threshold near zero. Sampling those
// terms directly is what keeps caverns from becoming one enormous pocket.

import { caveNoise } from './state.js'
import { blockData, blockIds } from './blocks.js'

const BASE_MASK = 0x7ff

// Spaghetti tunnels: two fields, carved where both are close to their middle
// value. Their intersection is a one-dimensional curve, so the result is a
// network of tubes rather than isolated pockets.
const TUNNEL_STEP = 2
const TUNNEL_GRID = 9 // 0, 2, ... 16
const TUNNEL_BAND = 0.018
const TUNNEL_ROOF = 8

// Cheese caverns. These values are copied from 26.3's noise/cave_cheese.json
// and noise/cave_layer.json. The noise is sampled every four blocks and
// interpolated; the high-frequency octaves are intentionally left to the
// texture of the resulting walls rather than making the lattice finer.
const CAVERN_STEP = 4
const CAVERN_GRID = 5 // 0, 4, ... 16
const CAVERN_THRESHOLD = 0.0
const CAVERN_ROOF = 16
const CAVE_CHEESE = {
	baseAmplitude: 0.8361300524356068,
	baseOctave: -8,
	amplitudeModifiers: [ 0.5, 1.0, 2.0, 1.0, 2.0, 1.0, 0.0, 2.0, 0.0 ],
}
const CAVE_LAYER = {
	baseAmplitude: 0.955388882960065,
	baseOctave: -8,
	amplitudeModifiers: [ 1.0 ],
}
// Distinct coordinate offsets keep the two noise fields from lining up.
const CAVE_CHEESE_OFFSET = 311.7
const CAVE_LAYER_OFFSET = -151.3

const LAVA_LEVEL = 7

// Canyons are a separate, wider tunnel system. The old implementation swept
// a 2D contour from the surface all the way down to y=8, which is a vertical
// curtain rather than a canyon and produced enormous flat-walled holes. This
// samples a second pair of 3D fields instead, using the 26.3 canyon carver's
// Y range (canyon.json: 10..67). The fields are stretched vertically so the
// intersection forms a tall, winding canyon instead of an isolated sphere.
const CANYON_STEP = 4
const CANYON_GRID = 5 // 0, 4, ... 16
const CANYON_BAND = 0.012
const CANYON_MIN_Y = 10
const CANYON_MAX_Y = 67
const CANYON_ROOF = 8

const tunnelA = new Float32Array(TUNNEL_GRID * TUNNEL_GRID * TUNNEL_GRID)
const tunnelB = new Float32Array(TUNNEL_GRID * TUNNEL_GRID * TUNNEL_GRID)
const canyonA = new Float32Array(CANYON_GRID * CANYON_GRID * CANYON_GRID)
const canyonB = new Float32Array(CANYON_GRID * CANYON_GRID * CANYON_GRID)
const cavern = new Float32Array(CAVERN_GRID * CAVERN_GRID * CAVERN_GRID)
const caveRegion = new Float32Array(256)

// Deepslate variants of the ores that can be exposed by a cave.
const DEEP_ORE = {}
for (let name of [ "coalOre", "copperOre", "diamondOre", "emeraldOre", "goldOre", "ironOre", "lapisOre", "redstoneOre" ]) {
	let deep = "deepslate" + name[0].toUpperCase() + name.slice(1)
	if (blockIds[name] !== undefined && blockIds[deep] !== undefined) {
		DEEP_ORE[blockIds[name]] = blockIds[deep]
	}
}

function smooth(t) {
	return t * t * (3 - 2 * t)
}

function clamp(value, min, max) {
	return value < min ? min : value > max ? max : value
}

// Sample a NormalNoise definition from 26.3. Octaves double in frequency and
// use the listed relative amplitudes; the result is normalized so the
// amplitude modifiers tune the shape rather than only the overall volume.
function octaveCaveNoise(x, y, z, spec, offset) {
	let frequency = Math.pow(2, spec.baseOctave)
	let sum = 0
	let norm = 0
	for (let i = 0; i < spec.amplitudeModifiers.length; i++) {
		let amplitude = spec.amplitudeModifiers[i]
		if (amplitude !== 0) {
			let value = (caveNoise(x * frequency + offset, y * frequency + offset * 0.37, z * frequency - offset) - 0.5) * 2
			sum += value * amplitude
			norm += Math.abs(amplitude)
		}
		frequency *= 2
	}
	return norm ? sum / norm * spec.baseAmplitude : 0
}

// This is the cavern part of overworld/final_density: four times the square of
// cave_layer, plus cave_cheese shifted by 0.27. Lower values are carved.
function cavernAt(x, y, z) {
	let cheese = octaveCaveNoise(x, y * 0.6666666666666666, z, CAVE_CHEESE, CAVE_CHEESE_OFFSET)
	let layer = octaveCaveNoise(x, y * 8, z, CAVE_LAYER, CAVE_LAYER_OFFSET)
	return 4 * layer * layer + clamp(cheese + 0.27, -1, 1)
}

// Trilinear lookup into a square lattice of `size` points per axis. x, y and z
// are in lattice units, so the caller divides block coordinates by the step.
function trilinear(grid, size, x, y, z) {
	let x0 = x | 0, y0 = y | 0, z0 = z | 0
	if (x0 > size - 2) x0 = size - 2
	if (y0 > size - 2) y0 = size - 2
	if (z0 > size - 2) z0 = size - 2
	let fx = smooth(x - x0)
	let fy = smooth(y - y0)
	let fz = smooth(z - z0)
	let i000 = (x0 * size + y0) * size + z0
	let i001 = i000 + 1
	let i010 = i000 + size
	let i011 = i010 + 1
	let i100 = i000 + size * size
	let i101 = i100 + 1
	let i110 = i100 + size
	let i111 = i110 + 1
	let a = grid[i000] + (grid[i001] - grid[i000]) * fz
	let b = grid[i010] + (grid[i011] - grid[i010]) * fz
	let c = grid[i100] + (grid[i101] - grid[i100]) * fz
	let d = grid[i110] + (grid[i111] - grid[i110]) * fz
	let bottom = a + (b - a) * fy
	let top = c + (d - c) * fy
	return bottom + (top - bottom) * fx
}

function hash3(x, y, z) {
	let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

// Pick an ore that makes sense for the depth. The host block decides whether
// the deepslate sprite is used.
function oreAt(y, roll, host) {
	let ore
	if (y < 12) {
		ore = roll < 0.3 ? blockIds.diamondOre : roll < 0.7 ? blockIds.redstoneOre : blockIds.lapisOre
	} else if (y < 28) {
		ore = roll < 0.35 ? blockIds.goldOre : roll < 0.7 ? blockIds.redstoneOre : blockIds.lapisOre
	} else if (y < 52) {
		ore = roll < 0.45 ? blockIds.ironOre : blockIds.copperOre
	} else {
		ore = roll < 0.6 ? blockIds.coalOre : blockIds.copperOre
	}
	return host === blockIds.deepslate && DEEP_ORE[ore] ? DEEP_ORE[ore] : ore
}

// The ore pass in chunk.js places single ores after carving. Give it the same
// deepslate substitution so deep ores do not keep the stone sprite.
export function oreForHost(host, ore) {
	return host === blockIds.deepslate && DEEP_ORE[ore] ? DEEP_ORE[ore] : ore
}

function decorate(section) {
	let blocks = section.blocks
	let ox = section.x, oy = section.y, oz = section.z
	// Leave the first and last layer alone so decorations never need blocks
	// from a neighbouring section.
	for (let ly = 1; ly < 15; ly++) {
		let wy = oy + ly
		if (wy <= LAVA_LEVEL) continue
		for (let lx = 0; lx < 16; lx++) {
			let wx = ox + lx
			for (let lz = 0; lz < 16; lz++) {
				let idx = lx * 256 + ly * 16 + lz
				if (blocks[idx] !== 0) continue
				let wz = oz + lz
				let floor = blocks[idx - 16]
				let ceiling = blocks[idx + 16]
				let floorStone = floor === blockIds.stone || floor === blockIds.deepslate
				let ceilStone = ceiling === blockIds.stone || ceiling === blockIds.deepslate
				let region = caveRegion[lz * 16 + lx]
				let h = hash3(wx, wy, wz)

				if (floorStone) {
					if (hash3(wx + 31, wy - 17, wz + 53) < 0.025) {
						blocks[idx - 16] = oreAt(wy, hash3(wx - 7, wy + 11, wz + 3), floor)
					} else if (wy < 20 && region > 0.60) {
						// Deep dark patches: sculk covers the floors of the
						// deepest caves.
						if (h < 0.4) blocks[idx - 16] = blockIds.sculk
					} else if (region > 0.58) {
						// Lush caves: moss grows across the exposed stone.
						if (h < 0.45) blocks[idx - 16] = blockIds.mossBlock
					} else if (region < 0.42) {
						// Dripstone caves: bare dripstone replaces the floor.
						if (h < 0.35) blocks[idx - 16] = blockIds.dripstoneBlock
					}
				}
				if (ceilStone && region < 0.42 && hash3(wx + 5, wy + 29, wz - 13) < 0.3) {
					blocks[idx + 16] = blockIds.dripstoneBlock
				}
			}
		}
	}
}

export function carveSection(section) {
	if (typeof caveNoise !== "function") return
	let blocks = section.blocks
	let ox = section.x, oy = section.y, oz = section.z
	let tops = section.chunk.tops

	// A section entirely above the surface cannot contain a cave entrance.
	let maxTop = 0
	for (let i = 0; i < 256; i++) {
		if (tops[i] > maxTop) maxTop = tops[i]
	}
	if (oy > maxTop) return

	// Sample both tunnel fields on the 2-block lattice.
	for (let iy = 0; iy < TUNNEL_GRID; iy++) {
		let wy = oy + iy * TUNNEL_STEP
		for (let ix = 0; ix < TUNNEL_GRID; ix++) {
			let wx = ox + ix * TUNNEL_STEP
			for (let iz = 0; iz < TUNNEL_GRID; iz++) {
				let wz = oz + iz * TUNNEL_STEP
				let i = (ix * TUNNEL_GRID + iy) * TUNNEL_GRID + iz
				tunnelA[i] = caveNoise(wx * 0.018 + 137.31, wy * 0.018 - 62.77, wz * 0.018 + 91.13)
				tunnelB[i] = caveNoise(wx * 0.018 - 241.57, wy * 0.018 + 114.93, wz * 0.018 - 57.41)
			}
		}
	}

	// Canyons use a lower, vertically stretched frequency so their two noise
	// contours meet along a tall winding curve instead of a flat surface.
	for (let iy = 0; iy < CANYON_GRID; iy++) {
		let wy = oy + iy * CANYON_STEP
		for (let ix = 0; ix < CANYON_GRID; ix++) {
			let wx = ox + ix * CANYON_STEP
			for (let iz = 0; iz < CANYON_GRID; iz++) {
				let wz = oz + iz * CANYON_STEP
				let i = (ix * CANYON_GRID + iy) * CANYON_GRID + iz
				canyonA[i] = caveNoise(wx * 0.008 + 101.7, wy * 0.0045 + 17.3, wz * 0.008 - 59.1)
				canyonB[i] = caveNoise(wx * 0.008 - 301.9, wy * 0.0045 - 89.7, wz * 0.008 + 151.3)
			}
		}
	}

	// The cavern field is lower frequency, so a 4-block lattice is enough.
	for (let iy = 0; iy < CAVERN_GRID; iy++) {
		let wy = oy + iy * CAVERN_STEP
		for (let ix = 0; ix < CAVERN_GRID; ix++) {
			let wx = ox + ix * CAVERN_STEP
			for (let iz = 0; iz < CAVERN_GRID; iz++) {
				let wz = oz + iz * CAVERN_STEP
				let i = (ix * CAVERN_GRID + iy) * CAVERN_GRID + iz
				cavern[i] = cavernAt(wx, wy, wz)
			}
		}
	}

	// The cave-biome region only varies by column.
	for (let lx = 0; lx < 16; lx++) {
		let wx = ox + lx
		for (let lz = 0; lz < 16; lz++) {
			let wz = oz + lz
			caveRegion[lz * 16 + lx] = caveNoise(wx * 0.0024 + 71.7, 17.3, wz * 0.0024 - 149.1)
		}
	}

	for (let ly = 0; ly < 16; ly++) {
		let wy = oy + ly
		if (wy <= 1) continue
		for (let lx = 0; lx < 16; lx++) {
			let wx = ox + lx
			for (let lz = 0; lz < 16; lz++) {
				let wz = oz + lz
				let idx = lx * 256 + ly * 16 + lz
				let state = blocks[idx]
				if (!state) continue
				let base = state & BASE_MASK
				if (base === blockIds.bedrock) continue
				let data = blockData[base]
				if (!data || data.liquid) continue

				let ground = tops[lz * 16 + lx]
				let carved = false

				// Canyons keep a real roof as well. They may still open through a
				// narrow tunnel, but the canyon itself cannot remove the top few
				// blocks of a field.
				if (!carved && wy < ground - CANYON_ROOF && wy >= CANYON_MIN_Y && wy <= CANYON_MAX_Y) {
					let a = trilinear(canyonA, CANYON_GRID, lx / CANYON_STEP, ly / CANYON_STEP, lz / CANYON_STEP)
					if (Math.abs(a - 0.5) < CANYON_BAND) {
						let b = trilinear(canyonB, CANYON_GRID, lx / CANYON_STEP, ly / CANYON_STEP, lz / CANYON_STEP)
						if (Math.abs(b - 0.5) < CANYON_BAND) carved = true
					}
				}

				// Tunnels keep a roof as well. Otherwise a narrow entrance can
				// connect a large cavern to the surface only a few blocks below a
				// field, which is exactly the shallow-void failure case.
				if (!carved && wy < ground - TUNNEL_ROOF) {
					let a = trilinear(tunnelA, TUNNEL_GRID, lx / TUNNEL_STEP, ly / TUNNEL_STEP, lz / TUNNEL_STEP)
					if (Math.abs(a - 0.5) < TUNNEL_BAND) {
						let b = trilinear(tunnelB, TUNNEL_GRID, lx / TUNNEL_STEP, ly / TUNNEL_STEP, lz / TUNNEL_STEP)
						if (Math.abs(b - 0.5) < TUNNEL_BAND) carved = true
					}
				}

				// Large caverns need a much thicker roof than a tunnel. A 16-block
				// minimum is deliberately stricter than a one-block tunnel entrance:
				// it prevents a cavern from opening directly under a field.
				if (!carved && wy < ground - CAVERN_ROOF) {
					let c = trilinear(cavern, CAVERN_GRID, lx / CAVERN_STEP, ly / CAVERN_STEP, lz / CAVERN_STEP)
					let threshold = CAVERN_THRESHOLD
					let roof = ground - wy
					if (roof < 32) threshold += (32 - roof) * 0.006
					if (c < threshold) carved = true
				}

				if (carved) blocks[idx] = wy <= LAVA_LEVEL ? blockIds.lava : 0
			}
		}
	}

	decorate(section)
}
