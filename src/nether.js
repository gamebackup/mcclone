import { blockData, blockIds } from './blocks.js'
import { noise } from './noise.js'

// Nether chunks live far away from the normal world so both dimensions can
// share one chunk store and one save string. The coordinate offset only needs
// to be well outside ordinary walking distance.
const NETHER_ORIGIN = 1000000
const NETHER_MIN = NETHER_ORIGIN - 100000
const PORTAL_MAX_SIZE = 21

const NETHER_SKY = {
	fogColor: [ 0.20, 0.035, 0.025 ],
	 sun: [ 0.30, 0.16, 0.13 ],
	brightness: 0.55,
}

function clamp(value, min, max) {
	return value < min ? min : value > max ? max : value
}

function isNetherChunkPosition(x, z) {
	return x >= NETHER_MIN && z >= NETHER_MIN
}

function netherFloorHeight(x, z) {
	let broad = noise(x * 0.031, z * 0.031) - 0.5
	let detail = noise(x * 0.009 + 41.7, z * 0.009 - 73.2) - 0.5
	return clamp(Math.round(38 + broad * 9 + detail * 5), 32, 47)
}

function netherCeilingHeight(x, z) {
	let n = noise(x * 0.026 + 111.3, z * 0.026 - 57.1)
	return clamp(Math.round(84 + (n - 0.5) * 14), 76, 94)
}

function blockNameAt(world, x, y, z) {
	let data = blockData[world.getBlock(x, y, z)]
	return data ? data.name : ""
}

// Flood fill the air inside one vertical plane. The frame is only accepted
// when the connected air forms a full rectangle and every surrounding cell is
// obsidian. That rejects cave openings and broken or decorative frames.
function detectPortalFrame(world, startX, startY, startZ, axis) {
	let fixed = axis === "x" ? startZ : startX
	let seen = new Set()
	let cells = []
	let queue = [ [ startX, startY, startZ ] ]
	let u0 = axis === "x" ? startX : startZ
	let u1 = u0
	let y0 = startY
	let y1 = startY

	while (queue.length) {
		let cell = queue.pop()
		let x = cell[0], y = cell[1], z = cell[2]
		if (axis === "x" ? z !== fixed : x !== fixed) return null
		if (Math.abs(x - startX) > PORTAL_MAX_SIZE + 1 || Math.abs(y - startY) > PORTAL_MAX_SIZE + 1 || Math.abs(z - startZ) > PORTAL_MAX_SIZE + 1) return null
		let key = x + "," + y + "," + z
		if (seen.has(key)) continue
		seen.add(key)
		// Stop at the obsidian frame. A missing frame piece lets the fill
		// escape into the surrounding air, which the rectangle/border checks
		// below reject.
		if (world.getBlock(x, y, z) !== blockIds.air) continue
		cells.push(cell)
		if (cells.length > PORTAL_MAX_SIZE * PORTAL_MAX_SIZE) return null
		let u = axis === "x" ? x : z
		if (u < u0) u0 = u
		if (u > u1) u1 = u
		if (y < y0) y0 = y
		if (y > y1) y1 = y
		if (axis === "x") {
			queue.push([ x + 1, y, z ], [ x - 1, y, z ])
		} else {
			queue.push([ x, y, z + 1 ], [ x, y, z - 1 ])
		}
		queue.push([ x, y + 1, z ], [ x, y - 1, z ])
	}

	let width = u1 - u0 + 1
	let height = y1 - y0 + 1
	if (width < 2 || height < 3 || width > PORTAL_MAX_SIZE || height > PORTAL_MAX_SIZE) return null
	if (cells.length !== width * height) return null

	for (let u = u0 - 1; u <= u1 + 1; u++) {
		for (let y = y0 - 1; y <= y1 + 1; y++) {
			if (u >= u0 && u <= u1 && y >= y0 && y <= y1) continue
			let x = axis === "x" ? u : fixed
			let z = axis === "x" ? fixed : u
			if (blockNameAt(world, x, y, z) !== "obsidian") return null
		}
	}

	return { axis: axis, fixed: fixed, u0: u0, u1: u1, y0: y0, y1: y1 }
}

// Light the first valid frame touching the clicked obsidian. The frame is
// always filled in full, so portals larger than the classic 2x3 also work.
function igniteNetherPortal(world, x, y, z) {
	let candidates = []
	for (let dx = -2; dx <= 2; dx++) {
		for (let dy = -2; dy <= 2; dy++) {
			for (let dz = -2; dz <= 2; dz++) {
				let bx = x + dx, by = y + dy, bz = z + dz
				if (world.getBlock(bx, by, bz) === blockIds.air) candidates.push([ bx, by, bz ])
			}
		}
	}
	for (let cell of candidates) {
		for (let axis of [ "x", "z" ]) {
			let frame = detectPortalFrame(world, cell[0], cell[1], cell[2], axis)
			if (!frame) continue
			for (let u = frame.u0; u <= frame.u1; u++) {
				for (let py = frame.y0; py <= frame.y1; py++) {
					let px = frame.axis === "x" ? u : frame.fixed
					let pz = frame.axis === "x" ? frame.fixed : u
					world.setBlock(px, py, pz, blockIds.netherPortal, false)
				}
			}
			return frame
		}
	}
	return null
}

// Test the player's body footprint, not a single rounded coordinate. A player
// can stand between the two blocks of a portal and still be inside it.
function netherPortalAt(world, px, py, pz) {
	let x0 = Math.floor(px - 0.31)
	let x1 = Math.floor(px + 0.31)
	let z0 = Math.floor(pz - 0.31)
	let z1 = Math.floor(pz + 0.31)
	let y0 = Math.floor(py - 1.62)
	let y1 = Math.floor(py + 0.02)
	for (let x = x0; x <= x1; x++) {
		for (let z = z0; z <= z1; z++) {
			for (let y = y0; y <= y1; y++) {
				let data = blockData[world.getBlock(x, y, z)]
				if (data && data.portal) return true
			}
		}
	}
	return false
}

function passableAt(world, x, y, z) {
	let state = world.getBlock(x, y, z)
	if (!state) return true
	let data = blockData[state]
	return !!data && !data.portal && (data.liquid || data.cross || (data.transparent && !data.collisionShape))
}

function floorAt(world, x, y, z) {
	let data = blockData[world.getBlock(x, y, z)]
	return !!data && !data.liquid && !data.transparent && !data.portal
}

// Find a safe spot beside the portal the player just stepped into. This is
// stored in the link so returning to the overworld does not immediately put
// the player back inside the source portal.
function portalExitNear(world, px, py, pz) {
	let bx = Math.round(px)
	let bz = Math.round(pz)
	let by = Math.floor(py - 1.62)
	let dirs = [ [ 0, 1 ], [ 0, -1 ], [ 1, 0 ], [ -1, 0 ] ]
	for (let dir of dirs) {
		let x = bx + dir[0]
		let z = bz + dir[1]
		if (passableAt(world, x, by, z) && floorAt(world, x, by - 1, z)) {
			return { x: x + 0.5, y: py, z: z + 0.5 }
		}
	}
	return { x: px, y: py, z: pz }
}

export {
	NETHER_ORIGIN, NETHER_SKY,
	isNetherChunkPosition, netherFloorHeight, netherCeilingHeight,
	igniteNetherPortal, netherPortalAt, portalExitNear
}
