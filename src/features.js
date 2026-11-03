import { blockData, BLOCK_COUNT, blockIds } from './blocks.js'
import {
	win, world, p, gl, tex, textureMap, textureCoords, texCoordsBuffers, hitBox, holding, gameMode,
	place, maxHeight, blockFill, blockMode, program3D, sideEdgeBuffers, dropEdgeBuffers,
	glCache, fluidsReady
} from './state.js'
import {
	CUBE, SLAB, STAIR, FLIP, NORTH, SOUTH, EAST, WEST, ROTATION, BASE_MASK, STATE_MASK,
	DOOR_UPPER, DOOR_OPEN, DOOR_HINGE, DOOR_FACING, TRAPDOOR_BOTTOM, TRAPDOOR_OPEN, TRAPDOOR_FACING,
	TORCH_HANGING, FLUID_FALLING, BED_HEAD, LIGHT_MAX, LIGHT_LIFT, uniformMatrix, Block, Sides, vertexAttribPointer, shapes
} from './engine.js'
import { idStack, idTexture, itemDef, itemIds, isItem } from './items.js'
import { heldStack, consumeHeld, addItem } from './ui.js'

	// Dropped item entities ("Q" drops one item from the held stack)
	let drops = []
	let dropLastFrame = 0
	let dropStats = { draws: 0 }
	const DROP_MERGE = 0.75
	const DROP_DESPAWN = 300000
	// Minecraft picks items up from roughly one block around the player's
	// body, not from a sphere centered on the camera. Keep the check on the
	// body so an item resting on the ground is collectable while standing.
	const DROP_PICKUP_RADIUS = 1
	const DROP_PICKUP_HALF_HEIGHT = 1
	const DROP_BODY_CENTER = 0.9
	function spawnDrop(id, count) {
		if (!id || count <= 0) return
		let e = {
			id: id,
			count: count,
			x: p.x - Math.sin(p.ry) * 0.5,
			y: p.y + 0.3,
			z: p.z + Math.cos(p.ry) * 0.5,
			vx: p.direction.x * 0.3,
			vy: 0.35,
			vz: p.direction.z * 0.3,
			onGround: false,
			age: 0,
			spin: Math.random() * 6.28318
		}
		for (let i = 0; i < drops.length; i++) {
			let d = drops[i]
			if (d.id !== id || !d.onGround) continue
			let dx = d.x - e.x, dy = d.y - e.y, dz = d.z - e.z
			if (dx * dx + dy * dy + dz * dz < DROP_MERGE * DROP_MERGE) {
				let add = Math.min(idStack(id) - d.count, e.count)
				d.count += add
				e.count -= add
				if (e.count <= 0) return
			}
		}
		drops.push(e)
	}
	function dropHeld() {
		let st = heldStack()
		if (!st || st.count <= 0) return
		let id = st.id
		consumeHeld(1)
		spawnDrop(id, 1)
	}
	function isDropSolid(x, y, z) {
		let b = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
		if (!b) return false
		let block = blockData[b & BASE_MASK]
		if (!block || block.liquid) return false
		return !!block.collisionShape || block.transparent !== true
	}
	function updateDrops() {
		if (!drops.length) return
		let now = win.performance.now()
		let elapsed = dropLastFrame ? now - dropLastFrame : 33
		let dt = elapsed / 33
		if (dt < 0) dt = 0
		dt = dt > 2 ? 2 : dt
		dropLastFrame = now
		for (let i = drops.length - 1; i >= 0; i--) {
			let e = drops[i]
			e.age += elapsed
			if (e.onGround) {
				if (!isDropSolid(e.x, e.y - 0.02, e.z)) {
					e.onGround = false
					e.vy = 0
				}
			} else {
				e.vy -= 0.045 * dt
				if (e.vy < -1) e.vy = -1
				e.x += e.vx * dt
				e.y += e.vy * dt
				e.z += e.vz * dt
				let drag = Math.pow(0.82, dt)
				e.vx *= drag
				e.vz *= drag
				if (e.vy <= 0 && isDropSolid(e.x, e.y - 0.02, e.z)) {
					e.y = Math.floor(e.y - 0.02) + 1.02
					e.vy = 0
					e.vx = 0
					e.vz = 0
					e.onGround = true
				}
			}
			if (e.age > 600) {
				let dx = p.x - e.x, dz = p.z - e.z
				let feet = p.y - p.bottomH
				let dy = e.y - (feet + DROP_BODY_CENTER)
				if (dx * dx + dz * dz <= DROP_PICKUP_RADIUS * DROP_PICKUP_RADIUS &&
					Math.abs(dy) <= DROP_PICKUP_HALF_HEIGHT) {
					let leftover = addItem(e.id, e.count)
					if (!leftover) {
						drops.splice(i, 1)
						continue
					}
					e.count = leftover
				}
			}
			if (e.age > DROP_DESPAWN) {
				drops.splice(i, 1)
			}
		}
	}
	function dropTextures(id) {
		if (isItem(id)) {
			let tex = idTexture(id)
			return tex ? [tex] : []
		}
		let data = blockData[id & BASE_MASK]
		if (!data || !data.textures) return []
		return typeof data.textures === "string" ? [data.textures] : data.textures
	}
	// Item drops use a flat, camera-facing sprite. Drawing a 2D item texture
	// over all six faces of a cube turns transparent sprites into a blocky
	// shape and makes the texture hard to recognise. Blocks keep the cube
	// renderer below, since their textures are meant to wrap a block.
	let dropSpriteBuffer = null
	function drawDropSprite(x, y, z, texture, size) {
		if (!blockFill) return
		let u = texCoordsBuffers[textureMap[texture]]
		if (!u) return
		let dx = p.direction.x, dy = p.direction.y, dz = p.direction.z
		let rightX = dz, rightZ = -dx
		let rightLength = Math.hypot(rightX, rightZ)
		if (rightLength < 0.00001) {
			rightX = 1
			rightZ = 0
			rightLength = 1
		}
		rightX /= rightLength
		rightZ /= rightLength
		let upX = dy * rightZ
		let upY = dz * rightX - dx * rightZ
		let upZ = -dy * rightX
		let half = size === undefined ? 0.22 : size
		let positions = new Float32Array([
			-rightX * half + upX * half, upY * half, -rightZ * half + upZ * half,
			rightX * half + upX * half, upY * half, rightZ * half + upZ * half,
			rightX * half - upX * half, -upY * half, rightZ * half - upZ * half,
			-rightX * half - upX * half, -upY * half, -rightZ * half - upZ * half
		])
		if (!dropSpriteBuffer) dropSpriteBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, dropSpriteBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
		gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 0, 0)
		vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
		let cull = gl.isEnabled(gl.CULL_FACE)
		if (cull) gl.disable(gl.CULL_FACE)
		let shadow = glCache.aShadow
		let shadowWasEnabled = shadow !== undefined && shadow !== -1 && gl.getVertexAttrib(shadow, gl.VERTEX_ATTRIB_ARRAY_ENABLED)
		if (shadow !== undefined && shadow !== -1) {
			gl.disableVertexAttribArray(shadow)
			gl.vertexAttrib1f(shadow, 1)
		}
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
		p.transformation.translate(-x, -y, -z)
		if (shadowWasEnabled) gl.enableVertexAttribArray(shadow)
		if (cull) gl.enable(gl.CULL_FACE)
		dropStats.draws++
	}
	function drawDropCube(x, y, z, textures) {
		if (!blockFill || !dropEdgeBuffers) return
		let texs = Array.isArray(textures) ? textures : [textures]
		let fallback = texs.find(tex => tex && texCoordsBuffers[textureMap[tex]])
		if (!fallback) return
		dropStats.draws++
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		let index = 0
		for (let side in Block) {
			let tex = texs[index] || fallback
			let u = texCoordsBuffers[textureMap[tex]]
			if (!u) {
				tex = fallback
				u = texCoordsBuffers[textureMap[tex]]
			}
			index++
			if (!u) continue
			vertexAttribPointer("aVertex", program3D, "aVertex", 3, dropEdgeBuffers[Sides[side]])
			vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
			gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0)
		}
		p.transformation.translate(-x, -y, -z)
	}
	function renderDrops() {
		if (!drops.length || !dropEdgeBuffers) return
		// Drops are drawn after chunk rendering, so make the atlas binding
		// explicit rather than relying on whichever texture was last bound.
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, tex)
		for (let i = 0; i < drops.length; i++) {
			let e = drops[i]
			let y = e.y + 0.15 + Math.sin(e.age / 250) * 0.04
			if (isItem(e.id)) {
				drawDropSprite(e.x, y, e.z, idTexture(e.id))
			} else {
				let textures = dropTextures(e.id)
				if (textures.length) drawDropCube(e.x, y, e.z, textures)
			}
		}
	}
	// TNT: an ignited TNT block becomes a short-lived lit entity that falls,
	// blinks, and then explodes, destroying nearby blocks and knocking the player.
	let tnts = []
	let tntLastFrame = 0
	const TNT_FUSE = 3500
	const TNT_RADIUS = 4
	function isTntBlock(block) {
		return (block & BASE_MASK) === blockIds.tnt
	}
	function primeTnt(x, y, z, fuseMs) {
		if (!isTntBlock(world.getBlock(x, y, z))) {
			return false
		}
		world.setBlock(x, y, z, 0)
		tnts.push({
			x: x, y: y, z: z,
			vx: 0, vy: 0.2, vz: 0,
			fuse: fuseMs === undefined ? TNT_FUSE : fuseMs,
			onGround: false
		})
		return true
	}
	function drawTntCube(x, y, z, flash) {
		if (!blockFill || !sideEdgeBuffers) return
		// Primed TNT keeps the block's normal top/bottom/side textures. The
		// old renderer used tntTop for every face during the flash, which made
		// the fuse pattern cover the sides and looked like a broken texture.
		let textures = flash
			? [ "whiteConcrete" ]
			: [ "tntTop", "tntBottom", "tntSides", "tntSides", "tntSides", "tntSides" ]
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		let i = 0
		for (let side in Block) {
			let tex = textures[i] || textures[0]
			let u = texCoordsBuffers[textureMap[tex]]
			i++
			if (!u) continue
			vertexAttribPointer("aVertex", program3D, "aVertex", 3, sideEdgeBuffers[Sides[side]])
			vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
			gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0)
		}
		p.transformation.translate(-x, -y, -z)
	}
	function renderTnts() {
		if (!tnts.length || !blockFill || !sideEdgeBuffers) return
		for (let i = 0; i < tnts.length; i++) {
			let e = tnts[i]
			// White flashes alternate on the same five-tick cadence as primed
			// TNT; the block texture itself stays intact between flashes.
			let flash = e.fuse < 1200 && (Math.floor(e.fuse / 250) & 1)
			drawTntCube(e.x, e.y, e.z, flash)
		}
	}
	function updateTnts() {
		if (!tnts.length) return
		let now = win.performance.now()
		let dt = (now - (tntLastFrame || now - 33)) / 33
		if (dt < 0) dt = 0
		dt = dt > 2 ? 2 : dt
		let dtMs = tntLastFrame ? now - tntLastFrame : 0
		tntLastFrame = now
		for (let i = tnts.length - 1; i >= 0; i--) {
			let e = tnts[i]
			e.fuse -= dtMs
			if (e.onGround) {
				if (!isDropSolid(e.x + 0.5, e.y - 0.02, e.z + 0.5)) {
					e.onGround = false
					e.vy = 0
				}
			} else {
				e.vy -= 0.045 * dt
				if (e.vy < -1) e.vy = -1
				e.x += e.vx * dt
				e.y += e.vy * dt
				e.z += e.vz * dt
				let drag = Math.pow(0.82, dt)
				e.vx *= drag
				e.vz *= drag
				if (e.vy <= 0 && isDropSolid(e.x + 0.5, e.y - 0.02, e.z + 0.5)) {
					e.y = Math.floor(e.y - 0.02) + 1
					e.vy = 0
					e.vx = 0
					e.vz = 0
					e.onGround = true
				}
			}
			if (e.fuse <= 0) {
				tnts.splice(i, 1)
				explodeTnt(e.x + 0.5, e.y + 0.5, e.z + 0.5)
			}
		}
	}
	function explodeTnt(x, y, z) {
		let r = TNT_RADIUS
		let r2 = r * r
		let cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z)
		let chained = []
		for (let dx = -r; dx <= r; dx++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dz = -r; dz <= r; dz++) {
					let d2 = dx * dx + dy * dy + dz * dz
					if (d2 > r2) continue
					let bx = cx + dx, by = cy + dy, bz = cz + dz
					if (by <= 1 || by >= maxHeight) continue
					let b = world.getBlock(bx, by, bz)
					if (!b) continue
					let base = b & BASE_MASK
					if (base === blockIds.bedrock || base === blockIds.obsidian) continue
					// Blast resistance falls off with distance; outer blocks may survive.
					let dist = Math.sqrt(d2)
					if (dist > r * 0.7 && Math.random() < (dist / r) * 0.7) continue
					if (base === blockIds.tnt) {
						// Chain reactions: light neighbouring TNT with a short fuse.
						chained.push([ bx, by, bz ])
						continue
					}
					world.setBlock(bx, by, bz, 0)
				}
			}
		}
		for (let i = 0; i < chained.length; i++) {
			primeTnt(chained[i][0], chained[i][1], chained[i][2], 300 + Math.random() * 700)
		}
		// Knock the player away from the blast.
		let pdx = p.x - x, pdy = (p.y + 0.9) - y, pdz = p.z - z
		let pd = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
		let reach = r + 3
		if (pd < reach) {
			if (pd < 0.0001) { pdx = 0; pdy = 1; pdz = 0; pd = 1 }
			let f = 1 - pd / reach
			p.velocity.x += pdx / pd * f * 0.9
			p.velocity.y += pdy / pd * f * 0.7 + 0.15
			p.velocity.z += pdz / pd * f * 0.9
			if (win.hurt) win.hurt(Math.max(1, Math.round(14 * f)), "explosion")
		}
	}

	// Falling blocks: sand, gravel, concrete powder, anvils and similar gravity
	// blocks become short-lived entities when they lose their support. They fall
	// under the same simple gravity as TNT and turn back into blocks on landing.
	let fallingBlocks = []
	let fallingLastFrame = 0
	function fallingData(block) {
		return blockData[block] || blockData[block & BASE_MASK] || null
	}
	function isGravityBlock(block) {
		let data = fallingData(block)
		return !!(data && data.gravity)
	}
	function isFallingSolid(block) {
		if (!block) return false
		let data = fallingData(block)
		if (!data || data.liquid) return false
		let shape = data.collisionShape || data.shape
		return !!shape && !shape.noCollide
	}
	function isFallingSolidAt(x, y, z) {
		return isFallingSolid(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)))
	}
	function startFallingBlock(x, y, z) {
		let state = world.getBlock(x, y, z)
		if (!isGravityBlock(state)) return false
		// Clear the cell first so the falling entity is the only thing there.
		world.setBlock(x, y, z, 0)
		fallingBlocks.push({ x: x, y: y, z: z, state: state, vy: 0 })
		return true
	}
	// Called after every block edit: a newly placed gravity block may be
	// floating, and the block above a removed support may now need to fall.
	function checkFallingAt(x, y, z) {
		if (y <= 0 || y >= maxHeight) return false
		let state = world.getBlock(x, y, z)
		if (!isGravityBlock(state)) return false
		if (isFallingSolid(world.getBlock(x, y - 1, z))) return false
		return startFallingBlock(x, y, z)
	}
	function drawFallingCube(x, y, z, state) {
		if (!blockFill || !sideEdgeBuffers) return
		let data = fallingData(state)
		if (!data || !data.textures) return
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		let i = 0
		for (let side in Block) {
			let tex = data.textures[i] || data.textures[0]
			let u = texCoordsBuffers[textureMap[tex]]
			if (u) {
				vertexAttribPointer("aVertex", program3D, "aVertex", 3, sideEdgeBuffers[Sides[side]])
				vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
				gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0)
			}
			i++
		}
		p.transformation.translate(-x, -y, -z)
	}
	// Falling blocks with a bespoke model (currently anvils) need their real
	// geometry while airborne too. The buffers are built lazily per shape and
	// texture set; the atlas tile offset is folded into the UVs.
	let fallingShapeCache = new WeakMap()
	function fallingShapeMesh(shape, textures) {
		let byTexture = fallingShapeCache.get(shape)
		if (!byTexture) {
			byTexture = new Map()
			fallingShapeCache.set(shape, byTexture)
		}
		let key = textures.join("|")
		if (byTexture.has(key)) return byTexture.get(key)
		let groups = []
		let order = [0, 1, 2, 0, 2, 3]
		for (let g = 0; g < 6; g++) {
			let faces = shape.verts[g] || []
			let faceTexs = shape.texVerts[g] || []
			// Group 0 is the bottom geometry and uses the bottom texture;
			// group 1 is the top and uses the top texture. Sides match up.
			let texIndex = g === 0 ? 1 : g === 1 ? 0 : g
			let positions = []
			let uvs = []
			for (let q = 0; q < faces.length; q++) {
				let verts = faces[q]
				let faceTex = faceTexs[q]
				if (!faceTex) continue
				let textureSlot = shape.faceTextureSlots && shape.faceTextureSlots[g]
				if (Array.isArray(textureSlot)) textureSlot = textureSlot[q]
				let tile = textureCoords[textureMap[textures[textureSlot === undefined ? texIndex : textureSlot] || textures[0]]]
				if (!tile) continue
				for (let n = 0; n < 6; n++) {
					let vi = order[n]
					positions.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2])
					uvs.push(faceTex[vi * 2] + tile[0], faceTex[vi * 2 + 1] + tile[1])
				}
			}
			if (!positions.length) {
				groups.push(null)
				continue
			}
			let positionBuffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)
			let textureBuffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW)
			groups.push({ positionBuffer: positionBuffer, textureBuffer: textureBuffer, count: positions.length / 3 })
		}
		byTexture.set(key, groups)
		return groups
	}
	function drawFallingShape(x, y, z, data) {
		if (!blockFill) return
		let mesh = fallingShapeMesh(data.shape, data.textures)
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		for (let g = 0; g < 6; g++) {
			let group = mesh[g]
			if (!group) continue
			vertexAttribPointer("aVertex", program3D, "aVertex", 3, group.positionBuffer)
			vertexAttribPointer("aTexture", program3D, "aTexture", 2, group.textureBuffer)
			gl.drawArrays(gl.TRIANGLES, 0, group.count)
		}
		p.transformation.translate(-x, -y, -z)
	}
	function renderFallingBlocks() {
		if (!fallingBlocks.length) return
		for (let i = 0; i < fallingBlocks.length; i++) {
			let e = fallingBlocks[i]
			let data = fallingData(e.state)
			if (data && data.shape && data.shape !== shapes.cube) {
				drawFallingShape(e.x, e.y, e.z, data)
			} else {
				drawFallingCube(e.x, e.y, e.z, e.state)
			}
		}
	}
	function updateFallingBlocks() {
		if (!fallingBlocks.length) return
		let now = win.performance.now()
		let dt = (now - (fallingLastFrame || now - 33)) / 33
		if (dt < 0) dt = 0
		dt = dt > 2 ? 2 : dt
		fallingLastFrame = now
		for (let i = fallingBlocks.length - 1; i >= 0; i--) {
			let e = fallingBlocks[i]
			e.vy -= 0.045 * dt
			if (e.vy < -1) e.vy = -1
			e.y += e.vy * dt
			if (isFallingSolidAt(e.x, e.y - 0.02, e.z)) {
				let landY = Math.floor(e.y - 0.02) + 1
				if (landY > 0 && landY < maxHeight) {
					world.setBlock(e.x, landY, e.z, e.state)
				}
				fallingBlocks.splice(i, 1)
			} else if (e.y < 0) {
				fallingBlocks.splice(i, 1)
			}
		}
	}
	// ---------------------------------------------------------------------
	// Projectiles and temporary effect entities.
	// ---------------------------------------------------------------------
	let arrows = []
	let arrowLastFrame = 0
	function spawnArrow(x, y, z, vx, vy, vz, options) {
		options = options || {}
		arrows.push({
			x: x, y: y, z: z, vx: vx, vy: vy, vz: vz,
			kind: options.kind || itemIds.arrow,
			effects: options.effects || [], spectral: !!options.spectral,
			age: 0, stuck: false
		})
	}
	function updateArrows() {
		if (!arrows.length) return
		let now = win.performance.now()
		let elapsed = arrowLastFrame ? now - arrowLastFrame : 33
		let dt = Math.max(0, Math.min(2, elapsed / 33))
		arrowLastFrame = now
		for (let i = arrows.length - 1; i >= 0; i--) {
			let e = arrows[i]
			e.age += elapsed
			if (!e.stuck) {
				e.vy -= 0.02 * dt
				e.x += e.vx * dt
				e.y += e.vy * dt
				e.z += e.vz * dt
				if (e.y < 0 || isDropSolid(e.x, e.y, e.z)) {
					e.stuck = true
					e.vx = e.vy = e.vz = 0
				}
			}
			if (e.age > 300) {
				let dx = p.x - e.x, dz = p.z - e.z
				let feet = p.y - p.bottomH
				let dy = e.y - (feet + DROP_BODY_CENTER)
				if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(dy) < 1.4) {
					let left = addItem(e.kind, 1)
					if (!left) { arrows.splice(i, 1); continue }
				}
			}
			if (e.age > 60000) arrows.splice(i, 1)
		}
	}
	function renderArrows() {
		if (!arrows.length) return
		for (let e of arrows) drawDropSprite(e.x, e.y, e.z, idTexture(e.kind))
	}

	let potionClouds = []
	let potionLastFrame = 0
	function spawnPotionCloud(x, y, z, effects, lingering) {
		potionClouds.push({
			x: x, y: y, z: z, effects: effects || [], lingering: !!lingering,
			age: 0, lastApply: -1000, life: lingering ? 12000 : 500
		})
	}
	function updatePotionClouds() {
		if (!potionClouds.length) return
		let now = win.performance.now()
		let elapsed = potionLastFrame ? now - potionLastFrame : 33
		potionLastFrame = now
		for (let i = potionClouds.length - 1; i >= 0; i--) {
			let e = potionClouds[i]
			e.age += elapsed
			let dx = p.x - e.x, dz = p.z - e.z, dy = (p.y - 0.9) - e.y
			if (dx * dx + dz * dz < 9 && Math.abs(dy) < 4 && e.age - e.lastApply > 500) {
				e.lastApply = e.age
				if (win.applyEffect) for (let effect of e.effects) win.applyEffect(effect.effect, effect.duration, effect.amplifier)
			}
			if (e.age > e.life || (!e.lingering && e.lastApply >= 0)) potionClouds.splice(i, 1)
		}
	}
	function renderPotionClouds() {
		for (let e of potionClouds) drawDropSprite(e.x, e.y, e.z, idTexture(itemIds.potion))
	}

	let fireworks = []
	let fireworkLastFrame = 0
	function spawnFirework(x, y, z, vx, vy, vz) {
		fireworks.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, age: 0 })
	}
	function updateFireworks() {
		if (!fireworks.length) return
		let now = win.performance.now()
		let elapsed = fireworkLastFrame ? now - fireworkLastFrame : 33
		let dt = Math.max(0, Math.min(2, elapsed / 33))
		fireworkLastFrame = now
		for (let i = fireworks.length - 1; i >= 0; i--) {
			let e = fireworks[i]
			e.age += elapsed
			e.vy -= 0.008 * dt
			e.x += e.vx * dt
			e.y += e.vy * dt
			e.z += e.vz * dt
			if (e.age > 1200) fireworks.splice(i, 1)
		}
	}
	function renderFireworks() {
		for (let e of fireworks) drawDropSprite(e.x, e.y, e.z, idTexture(itemIds.fireworkRocket))
	}

	// Fishing bobbers. The bobber is a small billboard entity; it waits for a
	// bite while floating in water and is reeled in by the next right-click.
	let fishingBobbers = []
	let fishingLastFrame = 0
	function castFishingBobber() {
		let dir = p.direction
		fishingBobbers.push({
			x: p.x + dir.x * 1.15, y: p.y + 0.35, z: p.z + dir.z * 1.15,
			vx: dir.x * 0.28, vy: dir.y * 0.28 + 0.12, vz: dir.z * 0.28,
			age: 0, bite: false, biteTimer: 0, inWater: false
		})
		return true
	}
	function updateFishingBobbers() {
		if (!fishingBobbers.length) return
		let now = win.performance.now()
		let elapsed = fishingLastFrame ? now - fishingLastFrame : 33
		let dt = Math.max(0, Math.min(2, elapsed / 33))
		fishingLastFrame = now
		for (let i = fishingBobbers.length - 1; i >= 0; i--) {
			let e = fishingBobbers[i]
			e.age += elapsed
			if (!e.inWater) {
				e.vy -= 0.02 * dt
				e.x += e.vx * dt
				e.y += e.vy * dt
				e.z += e.vz * dt
				if (fluidAt(e.x, e.y, e.z) === "water") {
					e.inWater = true
					e.vy = 0
					e.vx = 0
					e.vz = 0
				}
			} else {
				e.biteTimer += elapsed
				if (!e.bite && e.biteTimer > 2500 + Math.random() * 2500) e.bite = true
			}
			if (e.age > 30000 || e.y < 0) fishingBobbers.splice(i, 1)
		}
	}
	function reelFishingBobber() {
		let e = fishingBobbers.pop()
		if (!e) return false
		if (e.bite) {
			let loot = [itemIds.rawFish, itemIds.salmon, itemIds.clownfish, itemIds.pufferfish, itemIds.leather, itemIds.bowl, itemIds.stick]
			let id = loot[Math.random() * loot.length | 0]
			if (id) addItem(id, 1)
		}
		return true
	}
	function renderFishingBobbers() {
		for (let e of fishingBobbers) drawDropSprite(e.x, e.y, e.z, idTexture(itemIds.fishingRod))
	}

	// Boats and minecarts. They are placed as lightweight entities and follow
	// the player while boarded; the block-world movement remains authoritative.
	let vehicles = []
	let vehicleLastFrame = 0
	function spawnVehicle(kind, itemId) {
		let e = { kind: kind, itemId: itemId, x: p.x, y: p.y - p.bottomH + 0.02, z: p.z, vy: 0, onGround: false }
		vehicles.push(e)
		p.ridingVehicle = e
		p.elytraGliding = false
		return e
	}
	function dismountVehicle() {
		p.ridingVehicle = null
	}
	function updateVehicles() {
		if (!vehicles.length) return
		let now = win.performance.now()
		let elapsed = vehicleLastFrame ? now - vehicleLastFrame : 33
		let dt = Math.max(0, Math.min(2, elapsed / 33))
		vehicleLastFrame = now
		for (let i = vehicles.length - 1; i >= 0; i--) {
			let e = vehicles[i]
			if (p.ridingVehicle === e) {
				e.x = p.x
				e.y = p.y - p.bottomH + 0.02
				e.z = p.z
				e.vy = 0
				continue
			}
			e.vy -= 0.045 * dt
			if (e.vy < -0.8) e.vy = -0.8
			e.y += e.vy * dt
			if (isDropSolid(e.x, e.y - 0.02, e.z)) {
				e.y = Math.floor(e.y - 0.02) + 1.02
				e.vy = 0
				e.onGround = true
			}
			if (e.y < 0) vehicles.splice(i, 1)
		}
	}
	function renderVehicles() {
		for (let e of vehicles) drawDropSprite(e.x, e.y + 0.2, e.z, idTexture(e.itemId))
	}

	// End crystals are short-lived explosive decorations. The fuse gives the
	// player a chance to move away, and the blast uses the same block/entity
	// damage path as TNT.
	let endCrystals = []
	let endCrystalLastFrame = 0
	function spawnEndCrystal(x, y, z) {
		endCrystals.push({ x: x, y: y, z: z, fuse: 1800 })
		return true
	}
	function updateEndCrystals() {
		if (!endCrystals.length) return
		let now = win.performance.now()
		let elapsed = endCrystalLastFrame ? now - endCrystalLastFrame : 33
		endCrystalLastFrame = now
		for (let i = endCrystals.length - 1; i >= 0; i--) {
			let e = endCrystals[i]
			e.fuse -= elapsed
			if (e.fuse <= 0) {
				endCrystals.splice(i, 1)
				explodeTnt(e.x, e.y, e.z)
			}
		}
	}
	function renderEndCrystals() {
		for (let e of endCrystals) drawDropSprite(e.x, e.y, e.z, idTexture(itemIds.endCrystal))
	}

	let decorations = []
	function spawnDecoration(kind, itemId, x, y, z) {
		decorations.push({ kind: kind, itemId: itemId, x: x, y: y, z: z })
		return true
	}
	function renderDecorations() {
		for (let e of decorations) drawDropSprite(e.x, e.y + 0.4, e.z, idTexture(e.itemId))
	}

	// The campfire model carries logs only. Draw the matching animated flame
	// over nearby campfire and soul campfire blocks, including campfires in
	// chunks loaded from an older save. A small spatial cache avoids scanning
	// the world every frame.
	let campfireCache = []
	let campfireCacheAt = 0
	let campfireFireBuffer = null
	const CAMPFIRE_SCAN_RADIUS = 8
	function updateCampfireCache(now) {
		if (now - campfireCacheAt < 220) return
		campfireCacheAt = now
		campfireCache.length = 0
		let px = Math.floor(p.x)
		let py = Math.floor(p.y)
		let pz = Math.floor(p.z)
		for (let x = px - CAMPFIRE_SCAN_RADIUS; x <= px + CAMPFIRE_SCAN_RADIUS; x++) {
			for (let z = pz - CAMPFIRE_SCAN_RADIUS; z <= pz + CAMPFIRE_SCAN_RADIUS; z++) {
				for (let y = py - 4; y <= py + 5; y++) {
					let state = world.getBlock(x, y, z)
					let base = state & BASE_MASK
					if (base === blockIds.campfire) {
						// The generated campfire shape has the logs but not the two
						// crossed fire planes from template_campfire. The vanilla
						// planes run from y=1 to y=17, centred at y=9 (0.0625 in
						// block-local coordinates).
						campfireCache.push({ x: x + 0.5, y: y + 0.0625, z: z + 0.5, texture: "campfireFire" })
					} else if (base === blockIds.soulCampfire) {
						campfireCache.push({ x: x + 0.5, y: y + 0.0625, z: z + 0.5, texture: "soulCampfireFire" })
					}
				}
			}
		}
	}
	function drawCampfireFire(x, y, z, texture) {
		let u = texCoordsBuffers[textureMap[texture]]
		if (!u) return
		// The 26.3 model uses two vertical planes, each 14.4 pixels wide and
		// rotated 45 degrees around the block centre. Recreating that cross
		// keeps the flame attached to the logs instead of drawing a floating
		// camera-facing card.
		let diagonal = 0.45 * Math.SQRT1_2
		let positions = new Float32Array([
			-diagonal, -0.5, -diagonal,
			 diagonal, -0.5,  diagonal,
			 diagonal,  0.5,  diagonal,
			-diagonal,  0.5, -diagonal,
			-diagonal, -0.5,  diagonal,
			 diagonal, -0.5, -diagonal,
			 diagonal,  0.5, -diagonal,
			-diagonal,  0.5,  diagonal
		])
		if (!campfireFireBuffer) campfireFireBuffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, campfireFireBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
		gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 0, 0)
		vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
		let cull = gl.isEnabled(gl.CULL_FACE)
		if (cull) gl.disable(gl.CULL_FACE)
		let shadow = glCache.aShadow
		let shadowWasEnabled = shadow !== undefined && shadow !== -1 && gl.getVertexAttrib(shadow, gl.VERTEX_ATTRIB_ARRAY_ENABLED)
		if (shadow !== undefined && shadow !== -1) {
			gl.disableVertexAttribArray(shadow)
			gl.vertexAttrib1f(shadow, 1)
		}
		p.transformation.translate(x, y, z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
		gl.drawArrays(gl.TRIANGLE_FAN, 4, 4)
		p.transformation.translate(-x, -y, -z)
		if (shadowWasEnabled) gl.enableVertexAttribArray(shadow)
		if (cull) gl.enable(gl.CULL_FACE)
	}
	function renderCampfires() {
		if (!blockFill) return
		updateCampfireCache(win.performance.now())
		if (!campfireCache.length) return
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, tex)
		for (let flame of campfireCache) {
			drawCampfireFire(flame.x, flame.y, flame.z, flame.texture)
		}
	}

	// Lightweight poplar leaf particles.  There is no general particle engine in
	// this clone, so each nearby poplar leaf block can occasionally seed a
	// camera-facing leaf sprite.  The texture is taken from the leaf block that
	// spawned it, which keeps red, orange and yellow canopies independent.
	const POPLAR_LEAF_NAMES = [ 'redPoplarLeaves', 'orangePoplarLeaves', 'yellowPoplarLeaves' ]
	let poplarLeafParticles = []
	let poplarLeafLastFrame = 0
	let poplarLeafCooldown = 0
	function updatePoplarLeafParticles() {
		let now = win.performance.now()
		let elapsed = poplarLeafLastFrame ? now - poplarLeafLastFrame : 33
		if (elapsed > 100) elapsed = 100
		poplarLeafLastFrame = now
		poplarLeafCooldown -= elapsed
		if (poplarLeafCooldown <= 0) {
			poplarLeafCooldown = 180 + Math.random() * 420
			for (let tries = 0; tries < 7; tries++) {
				let x = Math.floor(p.x + (Math.random() * 18 - 9))
				let z = Math.floor(p.z + (Math.random() * 18 - 9))
				let y = Math.floor(p.y + (Math.random() * 10 - 5))
				let data = blockData[world.getBlock(x, y, z) & BASE_MASK]
				if (!data || POPLAR_LEAF_NAMES.indexOf(data.name) === -1) continue
				poplarLeafParticles.push({
					x: x + 0.15 + Math.random() * 0.7,
					y: y + 0.15 + Math.random() * 0.7,
					z: z + 0.15 + Math.random() * 0.7,
					vx: (Math.random() - 0.5) * 0.008,
					vz: (Math.random() - 0.5) * 0.008,
					age: 0,
					life: 2200 + Math.random() * 1800,
					texture: data.name,
				})
				break
			}
		}
		let dt = elapsed / 33
		for (let i = poplarLeafParticles.length - 1; i >= 0; i--) {
			let e = poplarLeafParticles[i]
			e.age += elapsed
			e.x += e.vx * dt
			e.y -= 0.012 * dt
			e.z += e.vz * dt
			if (e.age > e.life || e.y < 0) poplarLeafParticles.splice(i, 1)
		}
	}
	function renderPoplarLeaves() {
		updatePoplarLeafParticles()
		for (let e of poplarLeafParticles) drawDropSprite(e.x, e.y, e.z, e.texture)
	}

	function isSupporter(block) {
		block = block & BASE_MASK
		return block === blockIds.grass || block === blockIds.dirt ||
			block === blockIds.grassBlock || block === blockIds.farmland ||
			block === blockIds.podzol || block === blockIds.coarseDirt ||
			block === blockIds.rootedDirt || block === blockIds.mycelium ||
			block === blockIds.mossBlock || block === blockIds.mud
	}
	// Torches need a full (non-plant) block on the side they attach to.
	function isTorchSupport(block) {
		if (!block) {
			return false
		}
		let data = blockData[block & STATE_MASK]
		return !!data && !data.cross && !data.torch && !data.fence && !data.door && !data.trap
	}
	// Placement replaces air and fluids. Water and lava are intentionally not
	// targetable by the ray trace, so aiming into them targets the solid block
	// behind and lands the new block in the fluid cell.
	function canReplaceBlock(block) {
		if (!block) return true
		let data = blockData[block & STATE_MASK]
		return !!data && !!data.liquid
	}
	// Blocks that own their shape (plants, fences, doors, trapdoors) ignore the slab/stair mode.
	function placementMode(id) {
		let base = id & BASE_MASK
		let data = blockData[id & STATE_MASK] || blockData[base]
		if (!data) return CUBE
		if (data.cross || data.fence || data.bars || data.door || data.trap || data.torch || data.flat || data.facing || data.liquid || data.sign || data.gravity || data.bed || data.lantern) return CUBE
		if (data.slabOnly) return SLAB
		if (data.stairOnly) return STAIR
		// A stale save or a partially built registry must never produce a state
		// with no block entry; fall back to the full block instead.
		if (blockMode && !blockData[base | blockMode]) return CUBE
		return blockMode
	}
	function isDoorState(block) {
		let data = blockData[block & STATE_MASK] || blockData[block & BASE_MASK]
		return !!(block & STATE_MASK) && !!data && !!data.door
	}
	function isTrapState(block) {
		let data = blockData[block & STATE_MASK] || blockData[block & BASE_MASK]
		return !!(block & STATE_MASK) && !!data && !!data.trap
	}

	// A closed door that closes around the player would otherwise be resolved
	// as a ceiling by the collision pass and launch them upwards. Remember any
	// door that closed on the player so collision can let them walk out of it.
	const doorPassThrough = new Set()
	function doorKey(x, y, z) {
		return x + ',' + y + ',' + z
	}
	function doorOverlapsPlayer(x, y, z, shape) {
		if (!shape || !shape.verts) return false
		let px0 = p.x - p.w, px1 = p.x + p.w
		let py0 = p.y - p.bottomH, py1 = p.y + p.topH
		let pz0 = p.z - p.w, pz1 = p.z + p.w
		let pad = 0.001
		for (let faces of shape.verts) {
			for (let face of faces) {
				let min = face.min, max = face.max
				if (px1 > x + min[0] + pad && px0 < x + max[0] - pad &&
					py1 > y + min[1] + pad && py0 < y + max[1] - pad &&
					pz1 > z + min[2] + pad && pz0 < z + max[2] - pad) return true
			}
		}
		return false
	}
	function doorPassesPlayer(x, y, z, shape) {
		let key = doorKey(x, y, z)
		if (!doorPassThrough.has(key)) return false
		if (doorOverlapsPlayer(x, y, z, shape)) return true
		// The player has walked clear of the panel; make the door solid again.
		doorPassThrough.delete(key)
		return false
	}
	function clearDoorPassThrough(x, y, z) {
		doorPassThrough.delete(doorKey(x, y - 1, z))
		doorPassThrough.delete(doorKey(x, y, z))
		doorPassThrough.delete(doorKey(x, y + 1, z))
	}
	function refreshDoorPassThrough() {
		if (!doorPassThrough.size) return
		for (let key of doorPassThrough) {
			let parts = key.split(',')
			let x = +parts[0], y = +parts[1], z = +parts[2]
			let block = world.getBlock(x, y, z)
			let data = block && blockData[block]
			if (!data || !data.door || (block & DOOR_OPEN) ||
				!doorOverlapsPlayer(x, y, z, data.collisionShape || data.shape)) {
				doorPassThrough.delete(key)
			}
		}
	}

	function toggleDoor(x, y, z) {
		let block = world.getBlock(x, y, z)
		if (!isDoorState(block)) {
			return
		}
		let base = block & BASE_MASK
		let upper = block & DOOR_UPPER
		let otherY = upper ? y - 1 : y + 1
		let other = otherY >= 0 && otherY < maxHeight ? world.getBlock(x, otherY, z) : 0
		let halves = [ [ x, y, z, block ] ]
		if (other && (other & BASE_MASK) === base && isDoorState(other)) {
			halves.push([ x, otherY, z, other ])
		}
		let open = !(block & DOOR_OPEN)
		for (let half of halves) {
			world.setBlock(half[0], half[1], half[2], (half[3] & ~DOOR_OPEN) | (open ? DOOR_OPEN : 0))
		}
		if (open) {
			clearDoorPassThrough(x, y, z)
		} else {
			let overlaps = false
			for (let half of halves) {
				let data = blockData[world.getBlock(half[0], half[1], half[2])]
				if (data && doorOverlapsPlayer(half[0], half[1], half[2], data.collisionShape || data.shape)) {
					overlaps = true
					break
				}
			}
			if (overlaps) {
				for (let half of halves) doorPassThrough.add(doorKey(half[0], half[1], half[2]))
			}
		}
		refreshFences(x, y, z)
		p.lastPlace = Date.now()
	}

	// Vanilla hinge bits are left (0) / right (1) as seen from the door's
	// front. Convert a physical edge of the cell into that bit.
	function hingeForSide(facing, high) {
		if (facing === NORTH) return high ? DOOR_HINGE : 0
		if (facing === SOUTH) return high ? 0 : DOOR_HINGE
		if (facing === EAST) return high ? DOOR_HINGE : 0
		return high ? 0 : DOOR_HINGE // WEST
	}
	function doorFacingFromYaw() {
		let quarter = Math.PI / 4
		let yaw = p.ry % (Math.PI * 2)
		if (yaw < 0) yaw += Math.PI * 2
		if (yaw <= quarter || yaw >= 7 * quarter) return SOUTH
		if (yaw < 3 * quarter) return WEST
		if (yaw < 5 * quarter) return NORTH
		return EAST
	}
	function placeDoor(baseId, x, y, z) {
		if (y + 1 >= maxHeight || !canReplaceBlock(world.getBlock(x, y + 1, z))) {
			return false
		}
		let facing = doorFacingFromYaw()
		let horizontal = facing === NORTH || facing === SOUTH
		// The hinge goes on the side of the cell the player pointed at,
		// matching vanilla placement. Fall back to the player's position for
		// programmatic placements without a ray hit.
		// Cell centers sit on integer block coordinates (cells span x-0.5..x+0.5).
		let high = horizontal ? p.x >= x : p.z >= z
		let point = hitBox.point
		if (point && point[0] >= x - 0.5 && point[0] <= x + 0.5 && point[2] >= z - 0.5 && point[2] <= z + 0.5) {
			high = horizontal ? point[0] >= x : point[2] >= z
		}
		let hinge = hingeForSide(facing, high)

		// Placing a door beside another door creates a double door; vanilla
		// forces the pair to open away from each other.
		let neighbors = []
		for (let d of [ -1, 1 ]) {
			let nx = x + (horizontal ? d : 0)
			let nz = z + (horizontal ? 0 : d)
			let n = world.getBlock(nx, y, nz)
			if (n && isDoorState(n) && (n & BASE_MASK) === baseId && (n & DOOR_FACING) === facing) {
				neighbors.push({ x: nx, z: nz, d: d, y: y - (n & DOOR_UPPER ? 1 : 0) })
			}
		}
		if (neighbors.length === 1) {
			hinge = hingeForSide(facing, neighbors[0].d < 0)
		}

		let state = baseId | facing | hinge
		world.setBlock(x, y, z, state)
		world.setBlock(x, y + 1, z, state | DOOR_UPPER)

		if (neighbors.length === 1) {
			let n = neighbors[0]
			// Look one cell past the existing door, away from the new one.
			let farX = x + (horizontal ? 2 * n.d : 0)
			let farZ = z + (horizontal ? 0 : 2 * n.d)
			let far = world.getBlock(farX, n.y, farZ)
			let inLongerRow = far && isDoorState(far) && (far & BASE_MASK) === baseId && (far & DOOR_FACING) === facing
			if (!inLongerRow) {
				// The existing half hinges away from the new door.
				let neighborHinge = hingeForSide(facing, n.d > 0)
				for (let yy of [ n.y, n.y + 1 ]) {
					let nb = world.getBlock(n.x, yy, n.z)
					if (nb && isDoorState(nb) && (nb & BASE_MASK) === baseId) {
						world.setBlock(n.x, yy, n.z, (nb & ~DOOR_HINGE) | neighborHinge)
					}
				}
			}
		}
		refreshFences(x, y, z)
		p.lastPlace = Date.now()
		return true
	}
	// The yaw -> facing mapping used by the normal rotate-on-place path.
	function facingFromYaw() {
		let pi = Math.PI / 4
		if (p.ry <= pi) return NORTH
		if (p.ry < 3 * pi) return WEST
		if (p.ry < 5 * pi) return SOUTH
		if (p.ry < 7 * pi) return EAST
		return NORTH
	}
	// Direction a placed block should face so its front side points at the player.
	function facingToPlayer(x, z) {
		let dx = p.x - (x + 0.5)
		let dz = p.z - (z + 0.5)
		if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? EAST : WEST
		return dz >= 0 ? NORTH : SOUTH
	}
	function toggleTrapdoor(x, y, z) {
		let block = world.getBlock(x, y, z)
		if (!isTrapState(block)) {
			return
		}
		world.setBlock(x, y, z, (block & ~TRAPDOOR_OPEN) | (block & TRAPDOOR_OPEN ? 0 : TRAPDOOR_OPEN))
		refreshFences(x, y, z)
		p.lastPlace = Date.now()
	}
	function placeTrapdoor(baseId, x, y, z, face) {
		// Half is decided by which face was clicked: top -> sits on top,
		// bottom -> hangs from the underside.
		let half = face === "bottom" ? TRAPDOOR_BOTTOM : 0
		let state = baseId | half | facingFromYaw()
		world.setBlock(x, y, z, state)
		refreshFences(x, y, z)
		p.lastPlace = Date.now()
		return true
	}
	function oppositeFacing(facing) {
		if (facing === NORTH) return SOUTH
		if (facing === SOUTH) return NORTH
		if (facing === EAST) return WEST
		return EAST
	}
	// Beds occupy two cells. The clicked cell is the foot and the head extends
	// away from the player, matching vanilla placement. Both cells need a
	// solid floor and the head cell must be empty.
	function placeBed(baseId, x, y, z) {
		if (hitBox.face !== "top" || y <= 0 || y >= maxHeight) return false
		// Cells are centered on integer coordinates, so compare the player to
		// the cell center directly. The head points away from the player.
		let px = p.x - x
		let pz = p.z - z
		let toward = Math.abs(px) >= Math.abs(pz)
			? (px >= 0 ? EAST : WEST)
			: (pz >= 0 ? NORTH : SOUTH)
		let facing = oppositeFacing(toward)
		let dx = facing === EAST ? 1 : facing === WEST ? -1 : 0
		let dz = facing === NORTH ? 1 : facing === SOUTH ? -1 : 0
		let headX = x + dx
		let headZ = z + dz
		if (!canReplaceBlock(world.getBlock(headX, y, headZ)) ||
			!isTorchSupport(world.getBlock(x, y - 1, z)) ||
			!isTorchSupport(world.getBlock(headX, y - 1, headZ))) {
			return false
		}
		world.setBlock(x, y, z, baseId | facing)
		world.setBlock(headX, y, headZ, baseId | BED_HEAD | facing)
		p.lastPlace = Date.now()
		p.interactHold = true
		return true
	}
	function inCobweb() {
		let block = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
		let data = blockData[block & STATE_MASK]
		return data && data.web
	}

	// ---------------------------------------------------------------
	// Fluid simulation
	// A fluid source is the plain base id (state 0). Flowing fluid stores
	// its level (1..7) in bits 11-13, and bit 14 marks a falling column.
	// When any block changes we mark the cell and its neighbours; a
	// throttled tick settles each affected connected region by a 0-1 BFS
	// out from the sources (falling costs nothing, spreading costs a level).
	// ---------------------------------------------------------------
	// Minecraft water advances one block every 5 game ticks (4 blocks/second).
	const FLUID_TICK_MS = 250
	let fluidCellList = []
	let fluidCellSeen = new Set()
	let fluidLastTick = 0

	function markFluid(x, y, z) {
		let k = x + "," + y + "," + z
		if (fluidCellSeen.has(k)) return
		fluidCellSeen.add(k)
		fluidCellList.push([ x, y, z ])
	}
	function fluidWakeAround(x, y, z) {
		if (!fluidsReady) return
		markFluid(x, y, z)
		markFluid(x + 1, y, z)
		markFluid(x - 1, y, z)
		markFluid(x, y + 1, z)
		markFluid(x, y - 1, z)
		markFluid(x, y, z + 1)
		markFluid(x, y, z - 1)
	}
	function fluidMaxLevel(type) {
		return type === "lava" ? 4 : 8
	}
	const fluidDirs = [ [ 1, 0, 0 ], [ -1, 0, 0 ], [ 0, 1, 0 ], [ 0, -1, 0 ], [ 0, 0, 1 ], [ 0, 0, -1 ] ]
	function collectFluidComponent(sx, sy, sz, base) {
		let cells = []
		let seen = new Set([ sx + "," + sy + "," + sz ])
		let stack = [ [ sx, sy, sz ] ]
		let limit = 4000
		while (stack.length) {
			let c = stack.pop()
			cells.push(c)
			if (cells.length > limit) return cells
			for (let d = 0; d < 6; d++) {
				let nx = c[0] + fluidDirs[d][0], ny = c[1] + fluidDirs[d][1], nz = c[2] + fluidDirs[d][2]
				let k = nx + "," + ny + "," + nz
				if (seen.has(k)) continue
				if ((world.getBlock(nx, ny, nz) & BASE_MASK) !== base) continue
				seen.add(k)
				stack.push([ nx, ny, nz ])
			}
		}
		return cells
	}
	function settleFluid(cells, base, maxLevel) {
		let dist = new Map()
		// Snapshot of the body before this tick. New cells are checked against
		// it so the fluid advances one layer per tick instead of filling the
		// whole reachable area in a single pass.
		let wet = new Set()
		for (let i = 0; i < cells.length; i++) wet.add(cells[i][0] + "," + cells[i][1] + "," + cells[i][2])
		// Cells reached by falling keep their column together: they only
		// spread sideways once they land on a solid block.
		let fell = new Set()
		let buckets = []
		for (let i = 0; i <= maxLevel; i++) buckets.push([])
		// Sources seed the BFS; a cell is reachable if it is air or the same
		// fluid. Falling (into the cell below) is free, spreading costs a level.
		for (let i = 0; i < cells.length; i++) {
			let c = cells[i]
			if (world.getBlock(c[0], c[1], c[2]) === base) {
				dist.set(c[0] + "," + c[1] + "," + c[2], 0)
				buckets[0].push(c)
			}
		}
		let cap = 4000
		for (let cost = 0; cost < buckets.length; cost++) {
			let b = buckets[cost]
			for (let i = 0; i < b.length; i++) {
				let c = b[i]
				let ck = c[0] + "," + c[1] + "," + c[2]
				if (dist.get(ck) !== cost) continue
				let below = world.getBlock(c[0], c[1] - 1, c[2])
				let current = world.getBlock(c[0], c[1], c[2])
				// Air below always means fall. A falling cell below continues a
				// column, so keep it falling even after the column fills in; a
				// source sitting on top of still water is a pool surface.
				let canFall = below === 0 || (below & FLUID_FALLING) !== 0 || ((below & BASE_MASK) === base && current !== base)
				// Water with somewhere to fall goes straight down and only fans
				// out sideways once it lands, like Minecraft waterfalls. This also
				// stops a suspended source from growing a new ring at every level.
				for (let d = 0; d < 6; d++) {
					let nx = c[0] + fluidDirs[d][0], ny = c[1] + fluidDirs[d][1], nz = c[2] + fluidDirs[d][2]
					// Water and lava never flow upward on their own.
					if (ny > c[1]) continue
					if (canFall && ny !== c[1] - 1) continue
					let nb = world.getBlock(nx, ny, nz)
					let ndata = blockData[nb & BASE_MASK]
					let passable = nb === 0 || (ndata && ndata.liquid && (nb & BASE_MASK) === base)
					if (!passable) continue
					let ncost = cost + (ny < c[1] ? 0 : 1)
					if (ncost > maxLevel) continue
					let nk = nx + "," + ny + "," + nz
					let cur = dist.has(nk) ? dist.get(nk) : Infinity
					if (ncost < cur) {
						dist.set(nk, ncost)
						if (ny < c[1]) fell.add(nk)
						else fell.delete(nk)
						buckets[ncost].push([ nx, ny, nz ])
						if (dist.size > cap) return dist
					}
				}
			}
		}
		// Re-level (or drain) the existing cells. Falling cells use the
		// full-height state so a waterfall is a continuous sheet.
		for (let i = 0; i < cells.length; i++) {
			let c = cells[i]
			let block = world.getBlock(c[0], c[1], c[2])
			if (block === base) continue
			let k = c[0] + "," + c[1] + "," + c[2]
			let cost = dist.get(k)
			let next = 0
			if (cost !== undefined) {
				if (fell.has(k)) {
					next = base | FLUID_FALLING
				} else {
					let level = Math.min(maxLevel - 1, maxLevel - cost)
					if (level >= 1) next = base | (level << 11)
				}
			}
			if (next !== block) world.setBlock(c[0], c[1], c[2], next)
		}
		// Fill newly reachable air cells that touch the existing fluid body.
		// Only the cells on the edge of the body advance each tick, so water
		// spreads one block per tick instead of appearing all at once.
		for (let entry of dist) {
			let c = entry[0].split(",")
			let x = Number(c[0]), y = Number(c[1]), z = Number(c[2])
			if (world.getBlock(x, y, z) !== 0) continue
			let level = Math.min(maxLevel - 1, maxLevel - entry[1])
			if (level < 1) continue
			let touching = false
			for (let d = 0; d < 6; d++) {
				let ny = y + fluidDirs[d][1]
				// Only fluid beside this cell or above it can pour in; a fluid
				// sitting below must not push water upward.
				if (ny < y) continue
				if (wet.has((x + fluidDirs[d][0]) + "," + ny + "," + (z + fluidDirs[d][2]))) { touching = true; break }
			}
			if (!touching) continue
			let next = fell.has(entry[0]) ? (base | FLUID_FALLING) : (base | (level << 11))
			world.setBlock(x, y, z, next)
		}
		return dist
	}
	function tickFluids() {
		if (!fluidCellList.length) return
		let now = Date.now()
		if (now - fluidLastTick < FLUID_TICK_MS) return
		fluidLastTick = now
		let list = fluidCellList
		fluidCellList = []
		fluidCellSeen = new Set()
		let settled = new Set()
		for (let i = 0; i < list.length; i++) {
			let c = list[i]
			let k = c[0] + "," + c[1] + "," + c[2]
			if (settled.has(k)) continue
			let block = world.getBlock(c[0], c[1], c[2])
			let base = block & BASE_MASK
			let data = blockData[base]
			if (!data || !data.liquid) { settled.add(k); continue }
			let cells = collectFluidComponent(c[0], c[1], c[2], base)
			for (let j = 0; j < cells.length; j++) settled.add(cells[j][0] + "," + cells[j][1] + "," + cells[j][2])
			if (cells.length > 3000) continue
			let reached = settleFluid(cells, base, fluidMaxLevel(data.liquid))
			// Newly placed water is usually already in this pass's wake list.
			// Mark the whole reachable set as handled so it cannot re-settle the
			// same component several times in one tick and skip ahead by rings.
			if (reached) {
				for (let k of reached.keys()) settled.add(k)
			}
		}
	}
	function fluidAt(x, y, z) {
		let data = blockData[world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) & BASE_MASK]
		return data && data.liquid ? data.liquid : null
	}
	function playerFluid() {
		return fluidAt(p.x, p.y + 0.4, p.z) || fluidAt(p.x, p.y + 1.3, p.z)
	}
	function bucketUse(behavior) {
		let def = itemDef(holding)
		if (!def || def.behavior !== "bucket" || !hitBox.pos) return false
		let pos = hitBox.pos
		if (def.bucketType === "empty") {
			let target = world.getBlock(pos[0], pos[1], pos[2])
			let base = target & BASE_MASK
			let data = blockData[base]
			// Only a full source can be scooped; flowing levels cannot.
			if (!data || !data.liquid || target !== base) return false
			world.setBlock(pos[0], pos[1], pos[2], 0)
			consumeHeld(1)
			if (gameMode !== "creative") addItem(itemIds[data.liquid + "Bucket"], 1)
			p.lastPlace = Date.now()
			return true
		}
		let x = pos[0], y = pos[1], z = pos[2]
		switch (hitBox.face) {
			case "top": y += 1; break
			case "bottom": y -= 1; break
			case "south": z -= 1; break
			case "north": z += 1; break
			case "west": x -= 1; break
			case "east": x += 1; break
		}
		if (y <= 0 || y >= maxHeight || world.getBlock(x, y, z)) return false
		world.setBlock(x, y, z, blockIds[def.bucketType])
		consumeHeld(1)
		if (gameMode !== "creative") addItem(itemIds.bucket, 1)
		p.lastPlace = Date.now()
		return true
	}
	const FENCE_BITS = 0x7800
	function isFenceConnectable(block) {
		if (!block) return false
		let data = blockData[block & STATE_MASK]
		if (!data) return false
		return data.fence === true || data.bars === true || data.transparent === false
	}
	function updateFence(x, y, z) {
		let block = world.getBlock(x, y, z)
		let data = blockData[block & STATE_MASK]
		if (!data || (!data.fence && !data.bars)) {
			return
		}
		let mask = 0
		if (isFenceConnectable(world.getBlock(x, y, z + 1))) mask |= 1
		if (isFenceConnectable(world.getBlock(x, y, z - 1))) mask |= 2
		if (isFenceConnectable(world.getBlock(x + 1, y, z))) mask |= 4
		if (isFenceConnectable(world.getBlock(x - 1, y, z))) mask |= 8
		let next = (block & ~FENCE_BITS) | (mask << 11)
		if (next !== block) {
			world.setBlock(x, y, z, next)
		}
	}
	function refreshFences(x, y, z) {
		updateFence(x, y, z)
		updateFence(x, y, z + 1)
		updateFence(x, y, z - 1)
		updateFence(x + 1, y, z)
		updateFence(x - 1, y, z)
	}
	win.refreshFences = refreshFences
	win.tickFluids = tickFluids
	win.markFluid = markFluid
	win.fluidWakeAround = fluidWakeAround
	win.settleFluid = settleFluid
	win.collectFluidComponent = collectFluidComponent
	win.bucketUse = bucketUse
	win.toggleDoor = toggleDoor
	win.placeDoor = placeDoor
	win.isDoorState = isDoorState
	win.toggleTrapdoor = toggleTrapdoor
	win.placeTrapdoor = placeTrapdoor
	win.isTrapState = isTrapState
	win.drops = drops
	win.spawnDrop = spawnDrop
	win.dropHeld = dropHeld
	win.updateDrops = updateDrops
	win.renderDrops = renderDrops
	win.dropStats = dropStats
	win.tnts = tnts
	win.primeTnt = primeTnt
	win.explodeTnt = explodeTnt
	win.updateTnts = updateTnts
	win.isTntBlock = isTntBlock
	win.TNT_RADIUS = TNT_RADIUS
	win.fallingBlocks = fallingBlocks
	win.updateFallingBlocks = updateFallingBlocks
	win.arrows = arrows
	win.spawnArrow = spawnArrow
	win.updateArrows = updateArrows
	win.potionClouds = potionClouds
	win.spawnPotionCloud = spawnPotionCloud
	win.updatePotionClouds = updatePotionClouds
	win.fireworks = fireworks
	win.spawnFirework = spawnFirework
	win.updateFireworks = updateFireworks
	win.fishingBobbers = fishingBobbers
	win.castFishingBobber = castFishingBobber
	win.updateFishingBobbers = updateFishingBobbers
	win.reelFishingBobber = reelFishingBobber
	win.vehicles = vehicles
	win.spawnVehicle = spawnVehicle
	win.dismountVehicle = dismountVehicle
	win.updateVehicles = updateVehicles
	win.endCrystals = endCrystals
	win.spawnEndCrystal = spawnEndCrystal
	win.updateEndCrystals = updateEndCrystals
	win.decorations = decorations
	win.spawnDecoration = spawnDecoration
	win.renderPoplarLeaves = renderPoplarLeaves
	win.renderCampfires = renderCampfires


export {
	spawnDrop, dropHeld, isDropSolid, updateDrops, drawDropCube, renderDrops,
	isTntBlock, primeTnt, drawTntCube, renderTnts, updateTnts, explodeTnt,
	checkFallingAt, updateFallingBlocks, renderFallingBlocks,
	spawnArrow, updateArrows, renderArrows,
	spawnPotionCloud, updatePotionClouds, renderPotionClouds,
	spawnFirework, updateFireworks, renderFireworks,
	castFishingBobber, updateFishingBobbers, renderFishingBobbers, reelFishingBobber,
	spawnVehicle, dismountVehicle, updateVehicles, renderVehicles,
	spawnEndCrystal, updateEndCrystals, renderEndCrystals,
	spawnDecoration, renderDecorations, renderPoplarLeaves, renderCampfires,
	isSupporter, isTorchSupport, canReplaceBlock, placementMode, isDoorState, isTrapState,
	toggleDoor, placeDoor, doorPassesPlayer, clearDoorPassThrough, refreshDoorPassThrough, facingFromYaw, facingToPlayer, toggleTrapdoor, placeTrapdoor, placeBed, inCobweb,
	markFluid, fluidWakeAround, fluidMaxLevel, collectFluidComponent, settleFluid,
	tickFluids, fluidAt, playerFluid, bucketUse,
	isFenceConnectable, updateFence, refreshFences
}
