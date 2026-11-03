import { blockData, BLOCK_COUNT, blockIds } from './blocks.js'
import {
	win, world, p, setP, p2, setP2, gl, tex, textureMap, texCoordsBuffers, hitBox,
	holding, gameMode, Key, modelView, glCache, move, place,
	currentFov, setCurrentFov, settings, width, height, maxHeight,
	blockOutlines, blockFill, caveNoise, sideEdgeBuffers, matrix, projection,
	defaultModelView, program3D, superflat, inventory, reach, screen, setUpdateHUD
} from './state.js'
import { generator } from './state.js'
import {
	CUBE, SLAB, STAIR, FLIP, NORTH, SOUTH, EAST, WEST, ROTATION, FACING_UP, FACING_DOWN, BASE_MASK, STATE_MASK,
	DOOR_UPPER, DOOR_OPEN, DOOR_HINGE, DOOR_FACING, TRAPDOOR_BOTTOM, TRAPDOOR_OPEN, TRAPDOOR_FACING,
	TORCH_HANGING, LANTERN_HANGING, BED_HEAD, LIGHT_MAX, LIGHT_LIFT, uniformMatrix, Block, Sides, vertexAttribPointer,
	DAY_LENGTH, releasePointer
} from './engine.js'
import { PVector, noise } from './noise.js'
import {
	isDoorState, isTrapState, toggleDoor, toggleTrapdoor, placeDoor, placeTrapdoor, inCobweb,
	playerFluid, fluidAt, refreshFences, placementMode, isTorchSupport, isSupporter, canReplaceBlock, facingToPlayer,
	doorPassesPlayer, clearDoorPassThrough, refreshDoorPassThrough, bucketUse, isTntBlock, primeTnt, spawnDrop,
	spawnArrow, spawnPotionCloud, spawnFirework,
	castFishingBobber, reelFishingBobber, spawnVehicle, dismountVehicle,
	spawnEndCrystal, spawnDecoration, placeBed
} from './features.js'
import { consumeHeld, heldStack, addItem, blockDrop, openChest, openFurnace, openCraftingTable, openSign, updateHolding, changeScene } from './ui.js'
import { isItem, itemDef, itemIds, bonusDrop } from './items.js'
import { igniteNetherPortal, netherPortalAt } from './nether.js'

const vec1 = new PVector(), vec2 = new PVector(), vec3 = new PVector()

function cross(v1, v2, result) {
	let x = v1.x,
		y = v1.y,
		z = v1.z,
		x2 = v2.x,
		y2 = v2.y,
		z2 = v2.z
	result.x = y * z2 - y2 * z
	result.y = z * x2 - z2 * x
	result.z = x * y2 - x2 * y
}

	class Matrix {
		constructor(arr) {
			this.elements = new Float32Array(arr || 16)
		}
		translate(x, y, z) {
			let a = this.elements
			a[3] += a[0] * x + a[1] * y + a[2] * z
			a[7] += a[4] * x + a[5] * y + a[6] * z
			a[11] += a[8] * x + a[9] * y + a[10] * z
			a[15] += a[12] * x + a[13] * y + a[14] * z
		}
		rotX(angle) {
			let elems = this.elements
			let c = Math.cos(angle)
			let s = Math.sin(angle)
			let t = elems[1]
			elems[1] = t * c + elems[2] * s
			elems[2] = t * -s + elems[2] * c
			t = elems[5]
			elems[5] = t * c + elems[6] * s
			elems[6] = t * -s + elems[6] * c
			t = elems[9]
			elems[9] = t * c + elems[10] * s
			elems[10] = t * -s + elems[10] * c
			t = elems[13]
			elems[13] = t * c + elems[14] * s
			elems[14] = t * -s + elems[14] * c
		}
		rotY(angle) {
			let c = Math.cos(angle)
			let s = Math.sin(angle)
			let elems = this.elements
			let t = elems[0]
			elems[0] = t * c + elems[2] * -s
			elems[2] = t * s + elems[2] * c
			t = elems[4]
			elems[4] = t * c + elems[6] * -s
			elems[6] = t * s + elems[6] * c
			t = elems[8]
			elems[8] = t * c + elems[10] * -s
			elems[10] = t * s + elems[10] * c
			t = elems[12]
			elems[12] = t * c + elems[14] * -s
			elems[14] = t * s + elems[14] * c
		}
		transpose() {
			let matrix = this.elements
			let temp = matrix[4]
			matrix[4] = matrix[1]
			matrix[1] = temp

			temp = matrix[8]
			matrix[8] = matrix[2]
			matrix[2] = temp

			temp = matrix[6]
			matrix[6] = matrix[9]
			matrix[9] = temp

			temp = matrix[3]
			matrix[3] = matrix[12]
			matrix[12] = temp

			temp = matrix[7]
			matrix[7] = matrix[13]
			matrix[13] = temp

			temp = matrix[11]
			matrix[11] = matrix[14]
			matrix[14] = temp
		}
		copyArray(from) {
			let to = this.elements
			for (let i = 0; i < from.length; i++) {
				to[i] = from[i]
			}
		}
		copyMatrix(from) {
			let to = this.elements
			from = from.elements
			for (let i = 0; i < from.length; i++) {
				to[i] = from[i]
			}
		}
	}

	class Plane {
		constructor(nx, ny, nz) {
			this.set(nx, ny, nz)
		}
		set(nx, ny, nz) {
			// Pre-computed chunk offsets to reduce branching during culling
			this.dx = nx > 0 ? 16 : 0
			this.dy = ny > 0
			this.dz = nz > 0 ? 16 : 0

			// Normal vector for the plane
			this.nx = nx
			this.ny = ny
			this.nz = nz
		}
	}

	let defaultTransformation = new Matrix([ -10,0,0,0,0,10,0,0,0,0,-10,0,0,0,0,1 ])
	class Camera {
		constructor() {
			this.x = 0
			this.y = 0
			this.z = 0
			this.rx = 0; // Pitch
			this.ry = 0; // Yaw
			this.currentFov = 0
			this.defaultFov = settings.fov
			this.targetFov = settings.fov
			this.step = 0
			this.lastStep = 0
			this.bobPhase = 0
			this.bobAmount = 0
			this.projection = new Float32Array(5)
			this.transformation = new Matrix()
			this.direction = { x: 1, y: 0, z: 0 }; // Normalized direction vector
			this.frustum = [] // The 5 planes of the viewing frustum (there's no far plane)
			for (let i = 0; i < 5; i++) {
				this.frustum.push(new Plane(1, 0, 0))
			}
		}
		FOV(fov, time) {
			if (fov === this.currentFov) return

			if (!fov) {
				let now = Date.now()
				fov = this.currentFov + this.step * (now - this.lastStep)
				this.lastStep = now
				if (Math.sign(this.targetFov - this.currentFov) !== Math.sign(this.targetFov - fov)) {
					fov = this.targetFov
				}
			}
			else if (time) {
				this.targetFov = fov
				this.step = (fov - this.currentFov) / time
				this.lastStep = Date.now()
				return
			} else {
				this.targetFov = fov
			}

			const tang = Math.tan(fov * Math.PI / 360)
			const scale = 1 / tang
			const near = 1
			const far = 1000000
			this.currentFov = fov; // Store the state of the projection matrix
			setCurrentFov(fov)
			this.nearH = near * tang; // This is needed for frustum culling

			this.projection[0] = scale / width * height
			this.projection[1] = scale
			this.projection[2] = -far / (far - near)
			this.projection[3] = -1
			this.projection[4] = -far * near / (far - near)
		}
		transform() {
			this.transformation.copyMatrix(defaultTransformation)
			this.transformation.rotX(this.rx)
			this.transformation.rotY(this.ry)
			let bobX = 0, bobY = 0
			if (settings.viewBobbing && this.bobAmount > 0.001) {
				bobX = Math.cos(this.bobPhase) * 0.018 * this.bobAmount
				bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.032 * this.bobAmount
			}
			this.transformation.translate(-this.x - bobX, -this.y - bobY, -this.z)
		}
		getMatrix() {
			let proj = this.projection
			let view = this.transformation.elements
			matrix[0]  = proj[0] * view[0]
			matrix[1]  = proj[1] * view[4]
			matrix[2]  = proj[2] * view[8] + proj[3] * view[12]
			matrix[3]  = proj[4] * view[8]
			matrix[4]  = proj[0] * view[1]
			matrix[5]  = proj[1] * view[5]
			matrix[6]  = proj[2] * view[9] + proj[3] * view[13]
			matrix[7]  = proj[4] * view[9]
			matrix[8]  = proj[0] * view[2]
			matrix[9]  = proj[1] * view[6]
			matrix[10] = proj[2] * view[10] + proj[3] * view[14]
			matrix[11] = proj[4] * view[10]
			matrix[12] = proj[0] * view[3]
			matrix[13] = proj[1] * view[7]
			matrix[14] = proj[2] * view[11] + proj[3] * view[15]
			matrix[15] = proj[4] * view[11]
			return matrix
		}
		setDirection() {
			if (this.targetFov !== this.currentFov) {
				this.FOV()
			}
			this.direction.x = -Math.sin(this.ry) * Math.cos(this.rx)
			this.direction.y = Math.sin(this.rx)
			this.direction.z = Math.cos(this.ry) * Math.cos(this.rx)
			this.computeFrustum()
		}
		computeFrustum() {
			let X = vec1
			let dir = this.direction
			X.x = dir.z
			X.y = 0
			X.z = -dir.x
			X.normalize()

			let Y = vec2
			Y.set(dir)
			Y.mult(-1)
			cross(Y, X, Y)

			//Near plane
			this.frustum[0].set(dir.x, dir.y, dir.z)

			let aux = vec3
			aux.set(Y)
			aux.mult(this.nearH)
			aux.add(dir)
			aux.normalize()
			cross(aux, X, aux)
			this.frustum[1].set(aux.x, aux.y, aux.z)

			aux.set(Y)
			aux.mult(-this.nearH)
			aux.add(dir)
			aux.normalize()
			cross(X, aux, aux)
			this.frustum[2].set(aux.x, aux.y, aux.z)

			aux.set(X)
			aux.mult(-this.nearH * width / height)
			aux.add(dir)
			aux.normalize()
			cross(aux, Y, aux)
			this.frustum[3].set(aux.x, aux.y, aux.z)

			aux.set(X)
			aux.mult(this.nearH * width / height)
			aux.add(dir)
			aux.normalize()
			cross(Y, aux, aux)
			this.frustum[4].set(aux.x, aux.y, aux.z)
		}
		canSee(x, y, z, maxY) {
			x -= 0.5
			y -= 0.5
			z -= 0.5
			maxY += 0.5
			let px = 0, py = 0, pz = 0, plane = null
			let cx = p.x, cy = p.y, cz = p.z
			for (let i = 0; i < 5; i++) {
				plane = this.frustum[i]
				px = x + plane.dx
				py = plane.dy ? maxY : y
				pz = z + plane.dz
				if ((px - cx) * plane.nx + (py - cy) * plane.ny + (pz - cz) * plane.nz < 0) {
					return false
				}
			}
			return true
		}
	}

	function trans(matrix, x, y, z) {
		let a = matrix
		a[3] += a[0] * x + a[1] * y + a[2] * z
		a[7] += a[4] * x + a[5] * y + a[6] * z
		a[11] += a[8] * x + a[9] * y + a[10] * z
		a[15] += a[12] * x + a[13] * y + a[14] * z
	}
	function rotX(matrix, angle) {
		// This function is basically multiplying 2 4x4 matrices together,
		// but 1 of them has a bunch of 0's and 1's in it,
		// so I removed all terms that multiplied by 0, and just left off the 1's.
		// mat2 = [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]
		let elems = matrix
		let c = Math.cos(angle)
		let s = Math.sin(angle)
		let t = elems[1]
		elems[1] = t * c + elems[2] * s
		elems[2] = t * -s + elems[2] * c
		t = elems[5]
		elems[5] = t * c + elems[6] * s
		elems[6] = t * -s + elems[6] * c
		t = elems[9]
		elems[9] = t * c + elems[10] * s
		elems[10] = t * -s + elems[10] * c
		t = elems[13]
		elems[13] = t * c + elems[14] * s
		elems[14] = t * -s + elems[14] * c
	}
	function rotY(matrix, angle) {
	//source = c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1
		let c = Math.cos(angle)
		let s = Math.sin(angle)
		let elems = matrix
		let t = elems[0]
		elems[0] = t * c + elems[2] * -s
		elems[2] = t * s + elems[2] * c
		t = elems[4]
		elems[4] = t * c + elems[6] * -s
		elems[6] = t * s + elems[6] * c
		t = elems[8]
		elems[8] = t * c + elems[10] * -s
		elems[10] = t * s + elems[10] * c
		t = elems[12]
		elems[12] = t * c + elems[14] * -s
		elems[14] = t * s + elems[14] * c
	}
	function transpose(matrix) {
		let temp = matrix[4]
		matrix[4] = matrix[1]
		matrix[1] = temp

		temp = matrix[8]
		matrix[8] = matrix[2]
		matrix[2] = temp

		temp = matrix[6]
		matrix[6] = matrix[9]
		matrix[9] = temp

		temp = matrix[3]
		matrix[3] = matrix[12]
		matrix[12] = temp

		temp = matrix[7]
		matrix[7] = matrix[13]
		matrix[13] = temp

		temp = matrix[11]
		matrix[11] = matrix[14]
		matrix[14] = temp
	}
	function matMult() {
	//Multiply the projection matrix by the view matrix; this is optimized specifically for these matrices by removing terms that are always 0.
		let proj = projection
		let view = modelView
		matrix[0] = proj[0] * view[0]
		matrix[1] = proj[0] * view[1]
		matrix[2] = proj[0] * view[2]
		matrix[3] = proj[0] * view[3]
		matrix[4] = proj[5] * view[4]
		matrix[5] = proj[5] * view[5]
		matrix[6] = proj[5] * view[6]
		matrix[7] = proj[5] * view[7]
		matrix[8] = proj[10] * view[8] + proj[11] * view[12]
		matrix[9] = proj[10] * view[9] + proj[11] * view[13]
		matrix[10] = proj[10] * view[10] + proj[11] * view[14]
		matrix[11] = proj[10] * view[11] + proj[11] * view[15]
		matrix[12] = proj[14] * view[8]
		matrix[13] = proj[14] * view[9]
		matrix[14] = proj[14] * view[10]
		matrix[15] = proj[14] * view[11]
	}
	function copyArr(a, b) {
		for (let i = 0; i < a.length; i++) {
			b[i] = a[i]
		}
	}
	function FOV(fov) {
		let tang = Math.tan(fov * 0.5 * Math.PI / 180)
		let scale = 1 / tang
		let near = 1
		let far = 1000000
		setCurrentFov(fov)

		projection[0] = scale / width * height
		projection[5] = scale
		projection[10] = -far / (far - near)
		projection[11] = -1
		projection[14] = -far * near / (far - near)
	}
	function initModelView(camera, x, y, z, rx, ry) {
		if (camera) {
			camera.transform()
			uniformMatrix("view3d", program3D, "uView", false, camera.getMatrix())
		} else {
			copyArr(defaultModelView, modelView)
			rotX(modelView, rx)
			rotY(modelView, ry)
			trans(modelView, -x, -y, -z)
			matMult()
			transpose(matrix)
			uniformMatrix("view3d", program3D, "uView", false, matrix)
		}
	}

	function timeString(millis) {
		if (millis > 300000000000 || !millis) {
			return "never"
		}
		const SECOND = 1000
		const MINUTE = SECOND * 60
		const HOUR = MINUTE * 60
		const DAY = HOUR * 24
		const YEAR = DAY * 365

		if (millis < MINUTE) {
			return "just now"
		}

		let years = Math.floor(millis / YEAR)
		millis -= years * YEAR

		let days = Math.floor(millis / DAY)
		millis -= days * DAY

		let hours = Math.floor(millis / HOUR)
		millis -= hours * HOUR

		let minutes = Math.floor(millis / MINUTE)

		if (years) {
			return `${years} year${years > 1 ? "s" : ""} and ${days} day${days !== 1 ? "s" : ""} ago`
		}
		if (days) {
			return `${days} day${days > 1 ? "s" : ""} and ${hours} hour${hours !== 1 ? "s" : ""} ago`
		}
		if (hours) {
			return `${hours} hour${hours > 1 ? "s" : ""} and ${minutes} minute${minutes !== 1 ? "s" : ""} ago`
		}
		return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
	}
	function roundBits(number) {
		return Math.round(number * 1000000) / 1000000
	}
	function rayTrace(x, y, z, shape) {
		let cf, cd = 1e9; //Closest face and distance
		let m; //Absolute distance to intersection point
		let ix, iy, iz; //Intersection coords
		let hx, hy, hz; //Closest hit point, returned to the caller
		let minX, minY, minZ, maxX, maxY, maxZ, min, max; //Bounds of face coordinates
		let east = p.direction.x < 0
		let top = p.direction.y < 0
		let north = p.direction.z < 0
		let verts = shape.verts
		let faces = verts[0]

		//Top and bottom faces

		if (top) {
			faces = verts[1]
		}
		if (p.direction.y) {
			for (let face of faces) {
				min = face.min
				minX = min[0]
				minZ = min[2]
				max = face.max
				maxX = max[0]
				maxZ = max[2]
				m = (y + face[1] - p.y) / p.direction.y
				ix = m * p.direction.x + p.x
				iz = m * p.direction.z + p.z
				if (m > 0 && m < cd && ix >= x + minX && ix <= x + maxX && iz >= z + minZ && iz <= z + maxZ) {
					cd = m; //Ray crosses bottom face
					cf = top ? "top" : "bottom"
					hx = ix; hy = y + face[1]; hz = iz
				}
			}
		}

		//West and East faces
		if (east) {
			faces = verts[4]
		} else {
			faces = verts[5]
		}
		if (p.direction.x) {
			for (let face of faces) {
				min = face.min
				minY = min[1]
				minZ = min[2]
				max = face.max
				maxY = max[1]
				maxZ = max[2]
				m = (x + face[0] - p.x) / p.direction.x
				iy = m * p.direction.y + p.y
				iz = m * p.direction.z + p.z
				if (m > 0 && m < cd && iy >= y + minY && iy <= y + maxY && iz >= z + minZ && iz <= z + maxZ) {
					cd = m
					cf = east ? "east" : "west"
					hx = x + face[0]; hy = iy; hz = iz
				}
			}
		}

		//South and North faces
		if (north) {
			faces = verts[2]
		} else {
			faces = verts[3]
		}
		if (p.direction.z) {
			for (let face of faces) {
				min = face.min
				minX = min[0]
				minY = min[1]
				max = face.max
				maxX = max[0]
				maxY = max[1]
				m = (z + face[2] - p.z) / p.direction.z
				ix = m * p.direction.x + p.x
				iy = m * p.direction.y + p.y
				if (m > 0 && m < cd && ix >= x + minX && ix <= x + maxX && iy >= y + minY && iy <= y + maxY) {
					cd = m
					cf = north ? "north" : "south"
					hx = ix; hy = iy; hz = z + face[2]
				}
			}
		}
		return [ cd, cf, hx, hy, hz ]
	}
	function runRayTrace(x, y, z) {
		let block = world.getBlock(x, y, z)
		if (block) {
			let data = blockData[block]
			// Fluids and portal surfaces are not targetable, so aiming passes
			// through water, lava and active nether portals.
			if (!data || data.liquid || data.portal) return
			let shape = data.rayShape || data.shape
			let rt = rayTrace(x, y, z, shape)

			if (rt[1] && rt[0] < hitBox.closest) {
				hitBox.closest = rt[0]
				hitBox.face = rt[1]
				hitBox.pos = [ x, y, z ]
				hitBox.shape = shape
				hitBox.point = [ rt[2], rt[3], rt[4] ]
			}
		}
	}
	function lookingAt() {
		// Checks blocks in front of the player to see which one they're looking at
		hitBox.pos = null
		hitBox.point = null
		hitBox.closest = 1e9

		if (p.spectator) {
			return
		}
		let blockState = world.getBlock(p2.x, p2.y, p2.z)
		let blockDataAtPlayer = blockState && blockData[blockState]
		if (blockState && (!blockDataAtPlayer || (!blockDataAtPlayer.liquid && !blockDataAtPlayer.portal))) {
			hitBox.pos = [ p2.x, p2.y, p2.z ]
			hitBox.point = [ p.x, p.y, p.z ]
			hitBox.closest = 0
			hitBox.shape = blockDataAtPlayer.rayShape || blockDataAtPlayer.shape
			return
		}

		let pd = p.direction

		// Target block
		let tx = Math.round(pd.x * reach + p.x)
		let ty = Math.round(pd.y * reach + p.y)
		let tz = Math.round(pd.z * reach + p.z)

		let minX = p2.x
		let maxX = 0
		let minY = p2.y
		let maxY = 0
		let minZ = p2.z
		let maxZ = 0

		for (let i = 0; i < reach + 1; i++) {
			if (i > reach) {
				i = reach
			}
			maxX = Math.round(p.x + pd.x * i)
			maxY = Math.round(p.y + pd.y * i)
			maxZ = Math.round(p.z + pd.z * i)
			if (maxX === minX && maxY === minY && maxZ === minZ) {
				continue
			}
			if (minX !== maxX) {
				if (minY !== maxY) {
					if (minZ !== maxZ) {
						runRayTrace(maxX, maxY, maxZ)
					}
					runRayTrace(maxX, maxY, minZ)
				}
				if (minZ !== maxZ) {
					runRayTrace(maxX, minY, maxZ)
				}
				runRayTrace(maxX, minY, minZ)
			}
			if (minY !== maxY) {
				if (minZ !== maxZ) {
					runRayTrace(minX, maxY, maxZ)
				}
				runRayTrace(minX, maxY, minZ)
			}
			if (minZ !== maxZ) {
				runRayTrace(minX, minY, maxZ)
			}
			if (hitBox.pos) {
				return; //The ray has collided; it can't possibly find a closer collision now
			}
			minZ = maxZ
			minY = maxY
			minX = maxX
		}
	}
	let inBox = function(x, y, z, w, h, d) {
		let iy = y - h/2 - p.topH
		let ih = h + p.bottomH + p.topH
		let ix = x - w/2 - p.w
		let iw = w + p.w*2
		let iz = z - d/2 - p.w
		let id = d + p.w*2
		return p.x > ix && p.y > iy && p.z > iz && p.x < ix + iw && p.y < iy + ih && p.z < iz + id
	}
	let onBox = function(x, y, z, w, h, d) {
		let iy = roundBits(y - h/2 - p.topH)
		let ih = roundBits(h + p.bottomH + p.topH)
		let ix = roundBits(x - w/2 - p.w)
		let iw = roundBits(w + p.w*2)
		let iz = roundBits(z - d/2 - p.w)
		let id = roundBits(d + p.w*2)
		return p.x > ix && p.y > iy && p.z > iz && p.x < ix + iw && p.y <= iy + ih && p.z < iz + id
	}
	function collided(x, y, z, vx, vy, vz, block) {
		if(p.spectator) {
			return false
		}
		let data = blockData[block] || blockData[block & BASE_MASK]
		if (!data) return false
		let shapeData = data.collisionShape || data.shape
		if (data.door && doorPassesPlayer(x, y, z, shapeData)) {
			return false
		}
		if (shapeData.noCollide) {
			return false
		}
		let verts = shapeData.verts
		let px = roundBits(p.x - p.w - x)
		let py = roundBits(p.y - p.bottomH - y)
		let pz = roundBits(p.z - p.w - z)
		let pxx = roundBits(p.x + p.w - x)
		let pyy = roundBits(p.y + p.topH - y)
		let pzz = roundBits(p.z + p.w - z)
		let minX, minY, minZ, maxX, maxY, maxZ, min, max

		//Top and bottom faces
		let faces = verts[0]
		if (vy <= 0) {
			faces = verts[1]
		}
		if (!vx && !vz) {
			for (let face of faces) {
				min = face.min
				minX = min[0]
				minZ = min[2]
				max = face.max
				maxX = max[0]
				maxZ = max[2]
				if (face[1] > py && face[1] < pyy && minX < pxx && maxX > px && minZ < pzz && maxZ > pz) {
					if (vy <= 0) {
						p.onGround = true
						p.landingVelocity = vy
						p.y = Math.round((face[1] + y + p.bottomH) * 10000) / 10000
						return false
					} else {
						return true
					}
				}
			}
			return false
		}

		//West and East faces
		if (vx < 0) {
			faces = verts[4]
		} else if (vx > 0) {
			faces = verts[5]
		}
		if (vx) {
			let col = false
			for (let face of faces) {
				min = face.min
				minZ = min[2]
				minY = min[1]
				max = face.max
				maxZ = max[2]
				maxY = max[1]
				if (face[0] > px && face[0] < pxx && minY < pyy && maxY > py && minZ < pzz && maxZ > pz) {
					if (maxY - py > 0.5) {
						p.canStepX = false
					}
					col = true
				}
			}
			return col
		}

		//South and North faces
		if (vz < 0) {
			faces = verts[2]
		} else if (vz > 0) {
			faces = verts[3]
		}
		if (vz) {
			let col = false
			for (let face of faces) {
				min = face.min
				minX = min[0]
				minY = min[1]
				max = face.max
				maxX = max[0]
				maxY = max[1]
				if (face[2] > pz && face[2] < pzz && minY < pyy && maxY > py && minX < pxx && maxX > px) {
					if (maxY - py > 0.5) {
						p.canStepZ = false
					}
					col = true
				}
			}
			return col
		}
	}
	let contacts = {
		array: [],
		size: 0,
		add: function(x, y, z, block) {
			if (this.size === this.array.length) {
				this.array.push([ x, y, z, block ])
			} else {
				this.array[this.size][0] = x
				this.array[this.size][1] = y
				this.array[this.size][2] = z
				this.array[this.size][3] = block
			}
			this.size++
		},
		clear: function() {
			this.size = 0
		},
	}
	let sprintWallHit = function(speed, intoWall) {
		if (!p.sprinting || p.flying || speed <= 0) {
			return
		}
		if (Math.asin(Math.min(1, intoWall / speed)) * 180 / Math.PI <= 8) {
			return
		}
		p.sprinting = false
		p.FOV(settings.fov, 100)
	}
	let resolveContactsAndUpdatePosition = function() {
		let pminX = p2.x - 1
		let pmaxX = p2.x + 1
		let pminY = p2.y - 2
		let pmaxY = p2.y + 1
		let pminZ = p2.z - 1
		let pmaxZ = p2.z + 1
		let block = null
		let vel = p.velocity

		for (let x = pminX; x <= pmaxX; x++) {
			for (let y = pminY; y <= pmaxY; y++) {
				for (let z = pminZ; z <= pmaxZ; z++) {
					let block = world.getBlock(x, y, z)
					if (block) {
						contacts.add(x, y, z, block)
					}
				}
			}
		}

		let dt = (win.performance.now() - p.lastUpdate) / 33
		dt = dt > 2 ? 2 : dt

		p.previousX = p.x
		p.previousY = p.y
		p.previousZ = p.z

		//Check collisions in the Y direction
		p.onGround = false
		p.canStepX = false
		p.canStepZ = false
		p.y += vel.y * dt
		for (let i = 0; i < contacts.size; i++) {
			block = contacts.array[i]
			if (collided(block[0], block[1], block[2], 0, vel.y, 0, block[3])) {
				p.y = p.previousY
				vel.y = 0
				break
			}
		}
		if (p.y === p.previousY && !p.flying) {
			p.canStepX = true
			p.canStepZ = true
		}

		var sneakLock = false, sneakSafe = false
		if (p.sneaking) {
			for (let i = 0; i < contacts.size; i++) {
				block = contacts.array[i]
				if (onBox(block[0], block[1], block[2], 1, 1, 1)) {
					sneakLock = true
					break
				}
			}
		}

		//Check collisions in the X direction
		p.x += vel.x * dt
		for (let i = 0; i < contacts.size; i++) {
			block = contacts.array[i]
			if (collided(block[0], block[1], block[2], vel.x, 0, 0, block[3])) {
				if (p.canStepX && !world.getBlock(block[0], block[1] + 1, block[2]) && !world.getBlock(block[0], block[1] + 2, block[2])) {
					continue
				}
				sprintWallHit(Math.hypot(vel.x, vel.z), Math.abs(vel.x))
				p.x = p.previousX
				vel.x = 0
				break
			}
			if (sneakLock && onBox(block[0], block[1], block[2], 1, 1, 1)) {
				sneakSafe = true
			}
		}

		if (sneakLock && !sneakSafe) {
			p.x = p.previousX
			vel.x = 0
		}
		sneakSafe = false

		//Check collisions in the Z direction
		p.z += vel.z * dt
		for (let i = 0; i < contacts.size; i++) {
			block = contacts.array[i]
			if (collided(block[0], block[1], block[2], 0, 0, vel.z, block[3])) {
				if (p.canStepZ && !world.getBlock(block[0], block[1] + 1, block[2]) && !world.getBlock(block[0], block[1] + 2, block[2])) {
					continue
				}
				sprintWallHit(Math.hypot(vel.x, vel.z), Math.abs(vel.z))
				p.z = p.previousZ
				vel.z = 0
				break
			}
			if (sneakLock && onBox(block[0], block[1], block[2], 1, 1, 1)) {
				sneakSafe = true
			}
		}

		if (sneakLock && !sneakSafe) {
			p.z = p.previousZ
			vel.z = 0
		}

		if (!p.flying) {
			let web = inCobweb()
			let drag = p.onGround ? 0.5 : 0.85
			if (web) {
				// Cobweb clings to the player
				vel.x *= 0.75
				vel.z *= 0.75
				drag = Math.min(drag, 0.15)
			}
			if (playerFluid()) {
				drag = Math.min(drag, 0.55)
			}
			p.velocity.z += (p.velocity.z * drag - p.velocity.z) * dt
			p.velocity.x += (p.velocity.x * drag - p.velocity.x) * dt
		} else {
			let drag = 0.9
			p.velocity.z += (p.velocity.z * drag - p.velocity.z) * dt
			p.velocity.x += (p.velocity.x * drag - p.velocity.x) * dt
			p.velocity.y += (p.velocity.y * 0.8 - p.velocity.y) * dt
			if (p.onGround && !p.spectator) {
				p.flying = false
			}
		}

		// Camera-only walk bob. Keep it out of p.x/p.y so collision,
		// targeting and the saved player position stay unchanged.
		let walkDistance = Math.hypot(p.x - p.previousX, p.z - p.previousZ)
		let bobTarget = settings.viewBobbing && p.onGround && !p.flying && !p.spectator && walkDistance > 0.0005 ? 1 : 0
		p.bobAmount += (bobTarget - p.bobAmount) * Math.min(1, dt * 0.25)
		if (bobTarget) p.bobPhase = (p.bobPhase + Math.min(walkDistance, 0.2) * 4.2) % (Math.PI * 2)
		else if (p.bobAmount < 0.001) {
			p.bobAmount = 0
			p.bobPhase = 0
		}

		p.lastUpdate = win.performance.now()
		contacts.clear()
		refreshDoorPassThrough()
		lookingAt()
	}
	let shelfAudioContext = null
	function playShelfBounceSound() {
		try {
			let AudioCtor = win.AudioContext || win.webkitAudioContext
			if (!AudioCtor) return
			if (!shelfAudioContext) shelfAudioContext = new AudioCtor()
			if (shelfAudioContext.state === "suspended" && shelfAudioContext.resume) shelfAudioContext.resume()
			let now = shelfAudioContext.currentTime
			let oscillator = shelfAudioContext.createOscillator()
			let gain = shelfAudioContext.createGain()
			oscillator.type = "triangle"
			oscillator.frequency.setValueAtTime(430, now)
			oscillator.frequency.exponentialRampToValueAtTime(170, now + 0.09)
			gain.gain.setValueAtTime(0.08, now)
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)
			oscillator.connect(gain)
			gain.connect(shelfAudioContext.destination)
			oscillator.start(now)
			oscillator.stop(now + 0.12)
		} catch (e) {
			// Audio is optional and some browsers block it until a gesture.
		}
	}

	function bounceOnShelf() {
		if (p.spectator || p.flying) return false
		let x = Math.floor(p.x)
		let z = Math.floor(p.z)
		let y = Math.floor(p.y - p.bottomH - 0.02)
		let state = world.getBlock(x, y, z)
		let data = blockData[state & STATE_MASK] || blockData[state & BASE_MASK]
		if (!data || !data.bouncy) return false
		let impact = Math.abs(p.landingVelocity || 0.22)
		if (impact < 0.035) return false
		p.velocity.y = Math.min(0.34, Math.max(0.19, impact * 0.68))
		p.onGround = false
		p.elytraGliding = false
		p.fallDistance = 0
		playShelfBounceSound()
		return true
	}

	let runGravity = function() {
		if (p.flying) {
			return
		}
		let dt = (win.performance.now() - p.lastUpdate) / 33
		dt = dt > 2 ? 2 : dt
		let fluid = playerFluid()
		if (p.onGround) p.elytraGliding = false
		if(p.onGround) {
			if (bounceOnShelf()) {
				return
			}
			if(Key[" "]) {
				let jump = effectLevel("jumpBoost")
				p.velocity.y = p.jumpSpeed * (jump >= 0 ? 1 + 0.2 * (jump + 1) : 1)
				p.onGround = false
				addExhaustion(p.sprinting ? 0.2 : 0.05)
			} else {
				p.velocity.y = 0
			}
		} else {
			let gravity = inCobweb() ? p.gravityStength * 0.25 : p.gravityStength
			if (fluid === "water") gravity *= 0.3
			else if (fluid === "lava") gravity *= 0.5
			p.velocity.y += gravity * dt
			let minV = -p.maxYVelocity
			if (fluid === "water") minV = -0.16
			else if (fluid === "lava") minV = -0.1
			if(p.velocity.y < minV) {
				p.velocity.y = minV
			}
			if(fluid && Key[" "] && p.velocity.y < 0.12) {
				p.velocity.y = 0.12
			}
			if (effectLevel("slowFalling") >= 0 && p.velocity.y < -0.08) p.velocity.y = -0.08
			if (effectLevel("levitation") >= 0) {
				p.velocity.y += 0.05 * (effectLevel("levitation") + 1) * dt
				p.fallDistance = 0
			}
			// Elytra gliding starts with a jump press while airborne. It slows
			// the fall and lets forward movement carry the player, matching the
			// vanilla "glide" state closely enough for this block-world clone.
			if (Key[" "] && p.velocity.y < 0) {
				let chest = inventory.armor[1]
				let chestDef = chest && isItem(chest.id) ? itemDef(chest.id) : null
				if (chestDef && chestDef.elytra) {
					p.elytraGliding = true
					p.velocity.y = Math.max(p.velocity.y, -0.18)
					p.velocity.y += 0.04 * dt
					p.fallDistance = 0
				}
			}
			if (!Key[" "]) p.elytraGliding = false
		}
	}

	// ---------------------------------------------------------------------
	// Survival status loop: food, health, air, armor, damage and death.
	// ---------------------------------------------------------------------
	const DEATH_MESSAGES = {
		fall: "You fell from a high place",
		lava: "You tried to swim in lava",
		fire: "You burned to death",
		drown: "You drowned",
		starve: "You starved to death",
		generic: "You died",
	}
	const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"]
	let survivalLastFrame = 0
	let survivalAccum = 0
	let lastStatusKey = ""
	let lavaTimer = 0

	function resetSurvival() {
		p.maxHealth = 20
		p.health = 20
		p.maxFood = 20
		p.food = 20
		p.saturation = 5
		p.exhaustion = 0
		p.maxAir = 300
		p.air = 300
		p.hurtTime = 0
		p.damageCooldown = 0
		p.fallDistance = 0
		p.fireTicks = 0
		p.fireDamageTimer = 0
		p.eating = 0
		p.eatingItem = 0
		p.eatingTotal = 0
		p.drinking = 0
		p.drinkingItem = 0
		p.effects = {}
		p.absorption = 0
		p.bowCharge = 0
		p.bowItem = 0
		p.blocking = false
		p.elytraGliding = false
		p.elytraWear = 0
		p.ridingVehicle = null
		p.fishingCast = false
		p.dead = false
		p.deathMessage = ""
		p.deathSource = ""
		p.deathScore = 0
		p.regenTimer = 0
		p.starveTimer = 0
		p.drownTimer = 0
		p.armorPoints = 0
		p.armorToughness = 0
		p.inLava = false
		survivalAccum = 0
		survivalLastFrame = 0
		lastStatusKey = ""
		lavaTimer = 0
	}

	function armorStats() {
		let defense = 0
		let toughness = 0
		for (let i = 0; i < 4; i++) {
			let stack = inventory.armor[i]
			if (!stack || !isItem(stack.id)) continue
			let def = itemDef(stack.id)
			if (!def || def.behavior !== "armor") continue
			defense += def.defense || 0
			toughness += def.toughness || 0
		}
		return { defense: defense, toughness: toughness }
	}

	function updateArmorStats() {
		let stats = armorStats()
		p.armorPoints = stats.defense
		p.armorToughness = stats.toughness
		return stats
	}

	// Status effects use the same 20-tick-per-second clock as hunger and
	// regeneration. Durations are stored in ticks, so a potion's 200-tick
	// duration is ten seconds just like vanilla.
	function effect(name) {
		return p.effects && p.effects[name] ? p.effects[name] : null
	}
	function effectLevel(name) {
		let e = effect(name)
		return e ? e.amplifier : -1
	}
	function clearEffects() {
		p.effects = {}
		p.absorption = 0
		p.regenEffectTimer = 0
		p.poisonTimer = 0
		p.witherTimer = 0
		setUpdateHUD(true)
	}
	function applyEffect(name, duration, amplifier) {
		if (!name) return
		amplifier = amplifier || 0
		if (name === "clear") { clearEffects(); return }
		if (name === "instantHealth") {
			p.health = Math.min(p.maxHealth || 20, (p.health || 0) + 4 * (amplifier + 1))
			setUpdateHUD(true)
			return
		}
		if (name === "instantDamage") {
			hurt(6 * (amplifier + 1), "magic", true)
			return
		}
		if (name === "saturation") {
			p.food = Math.min(p.maxFood || 20, (p.food || 0) + 2 * (amplifier + 1))
			p.saturation = Math.min(p.food, (p.saturation || 0) + 2 * (amplifier + 1))
			setUpdateHUD(true)
			return
		}
		if (!(duration > 0)) return
		p.effects = p.effects || {}
		let old = p.effects[name]
		p.effects[name] = {
			duration: Math.max(duration, old ? old.duration : 0),
			amplifier: Math.max(amplifier, old ? old.amplifier : 0)
		}
		if (name === "absorption") p.absorption = Math.max(p.absorption || 0, 4 * (amplifier + 1))
		setUpdateHUD(true)
	}

	function tickEffects() {
		if (!p.effects) p.effects = {}
		let regen = effectLevel("regeneration")
		if (regen >= 0) {
			p.regenEffectTimer = (p.regenEffectTimer || 0) + 1
			if (p.regenEffectTimer >= Math.max(10, 50 >> regen)) {
				p.regenEffectTimer = 0
				p.health = Math.min(p.maxHealth || 20, (p.health || 0) + 1)
				addExhaustion(6)
				setUpdateHUD(true)
			}
		} else p.regenEffectTimer = 0

		let poison = effectLevel("poison")
		if (poison >= 0) {
			p.poisonTimer = (p.poisonTimer || 0) + 1
			if (p.poisonTimer >= Math.max(10, 25 >> poison) && p.health > 1) {
				p.poisonTimer = 0
				p.health = Math.max(1, p.health - 1)
				p.hurtTime = 10
				setUpdateHUD(true)
			}
		} else p.poisonTimer = 0

		let wither = effectLevel("wither")
		if (wither >= 0) {
			p.witherTimer = (p.witherTimer || 0) + 1
			if (p.witherTimer >= Math.max(10, 40 >> wither)) {
				p.witherTimer = 0
				if (p.health > 1) {
					p.health -= 1
					p.hurtTime = 10
					setUpdateHUD(true)
				}
			}
		} else p.witherTimer = 0

		if (effectLevel("hunger") >= 0) addExhaustion(0.006 * (effectLevel("hunger") + 1))
		let fire = effectLevel("fireResistance")
		if (fire >= 0) p.fireTicks = 0
		if (effectLevel("waterBreathing") >= 0) p.air = p.maxAir || 300

		let names = Object.keys(p.effects)
		for (let name of names) {
			let e = p.effects[name]
			e.duration--
			if (e.duration <= 0) {
				delete p.effects[name]
				if (name === "absorption") p.absorption = 0
				setUpdateHUD(true)
			}
		}
	}

	function addExhaustion(amount) {
		if (gameMode !== "survival" || p.spectator || p.dead) return
		p.exhaustion += amount
	}

	function damageArmor(amount) {
		if (!(amount > 0)) return
		let durabilityDamage = Math.max(1, Math.floor(amount / 4))
		for (let i = 0; i < 4; i++) {
			let stack = inventory.armor[i]
			if (!stack || !isItem(stack.id)) continue
			let def = itemDef(stack.id)
			if (!def || !def.durability) continue
			stack.damage = (stack.damage || 0) + durabilityDamage
			if (stack.damage >= def.durability) inventory.armor[i] = null
		}
		updateArmorStats()
		setUpdateHUD(true)
	}

	// Vanilla 1.9+ armor formula: defense becomes less effective against heavy
	// hits, while toughness softens that falloff.
	function reduceByArmor(amount) {
		let stats = armorStats()
		if (!stats.defense) return amount
		let defense = Math.min(20, Math.max(stats.defense / 5, stats.defense - amount / (2 + stats.toughness / 4)))
		return amount * (1 - defense / 25)
	}

	function damageElytra(amount) {
		let stack = inventory.armor[1]
		if (!stack || !isItem(stack.id)) return
		let def = itemDef(stack.id)
		if (!def || !def.elytra || !def.durability) return
		stack.damage = (stack.damage || 0) + amount
		if (stack.damage >= def.durability) inventory.armor[1] = null
		updateArmorStats()
		setUpdateHUD(true)
	}

	function damageHeldItem(amount) {
		let stack = heldStack()
		if (!stack || !isItem(stack.id)) return
		let def = itemDef(stack.id)
		if (!def || !def.durability) return
		stack.damage = (stack.damage || 0) + amount
		if (stack.damage >= def.durability) {
			inventory.slots[inventory.hotbarSlot] = null
			if (def.behavior === "shield") p.blocking = false
			updateHolding()
		}
		setUpdateHUD(true)
	}

	function hurt(amount, source, bypass) {
		if (p.spectator || p.dead) return false
		if (gameMode !== "survival" && !bypass) return false
		if (!(amount > 0)) return false
		if (!bypass && p.damageCooldown > 0) return false
		let shield = heldStack()
		let shieldDef = shield && isItem(shield.id) ? itemDef(shield.id) : null
		if (!bypass && p.blocking && shieldDef && shieldDef.behavior === "shield" &&
			(source === "explosion" || source === "projectile" || source === "mob")) {
			damageHeldItem(1)
			p.damageCooldown = 10
			p.hurtTime = 5
			setUpdateHUD(true)
			return true
		}
		let original = amount
		let resist = effectLevel("resistance")
		if (resist >= 0) amount *= Math.max(0, 1 - 0.2 * (resist + 1))
		// Starvation and drowning bypass armor; every other source here does not.
		if (source !== "starve" && source !== "drown") amount = reduceByArmor(amount)
		if (p.absorption > 0) {
			let absorbed = Math.min(p.absorption, amount)
			p.absorption -= absorbed
			amount -= absorbed
		}
		p.health -= amount
		p.damageCooldown = 10
		p.hurtTime = 10
		p.eating = 0
		p.drinking = 0
		p.regenTimer = 0
		addExhaustion(0.1)
		// Armor that a damage type bypasses does not lose durability either.
		if (source !== "starve" && source !== "drown") damageArmor(original)
		if (p.health <= 0) {
			p.health = 0
			die(source)
		} else {
			setUpdateHUD(true)
		}
		return true
	}

	function die(source) {
		if (p.dead) return
		p.dead = true
		p.health = 0
		p.eating = 0
		p.hurtTime = 0
		p.deathSource = source || "generic"
		p.deathMessage = DEATH_MESSAGES[p.deathSource] || DEATH_MESSAGES.generic
		for (let i = 0; i < inventory.slots.length; i++) {
			let stack = inventory.slots[i]
			if (stack && stack.count > 0) spawnDrop(stack.id, stack.count)
			inventory.slots[i] = null
		}
		for (let i = 0; i < inventory.craft.length; i++) {
			let stack = inventory.craft[i]
			if (stack && stack.count > 0) spawnDrop(stack.id, stack.count)
			inventory.craft[i] = null
		}
		for (let i = 0; i < 4; i++) {
			let stack = inventory.armor[i]
			if (stack && stack.count > 0) spawnDrop(stack.id, stack.count)
			inventory.armor[i] = null
		}
		if (inventory.cursor && inventory.cursor.count > 0) spawnDrop(inventory.cursor.id, inventory.cursor.count)
		inventory.cursor = null
		inventory.result = null
		updateArmorStats()
		updateHolding()
		releasePointer()
		changeScene("death")
	}

	function respawnPlayer() {
		p.dead = false
		p.maxHealth = 20
		p.health = 20
		p.maxFood = 20
		p.food = 20
		p.saturation = 5
		p.exhaustion = 0
		p.maxAir = 300
		p.air = 300
		p.hurtTime = 0
		p.damageCooldown = 0
		p.fallDistance = 0
		p.fireTicks = 0
		p.fireDamageTimer = 0
		p.eating = 0
		p.eatingItem = 0
		p.drinking = 0
		p.drinkingItem = 0
		p.effects = {}
		p.absorption = 0
		p.bowCharge = 0
		p.bowItem = 0
		p.blocking = false
		p.elytraGliding = false
		p.elytraWear = 0
		p.ridingVehicle = null
		p.fishingCast = false
		p.deathMessage = ""
		p.regenTimer = 0
		p.starveTimer = 0
		p.drownTimer = 0
		p.inLava = false
		p.sprinting = false
		p.sneaking = false
		p.flying = false
		p.spectator = false
		p.speed = 0.075
		p.bottomH = 1.62
		p.x = 8
		p.z = 8
		p.y = superflat ? 6 : (Math.round(noise(8 * generator.smooth, 8 * generator.smooth) * generator.height) + 2 + generator.extra)
		p.previousX = p.x
		p.previousY = p.y
		p.previousZ = p.z
		p.velocity.x = 0
		p.velocity.y = 0
		p.velocity.z = 0
		p.onGround = false
		p.lastUpdate = win.performance.now()
		p.portalCooldown = 0
		p.portalEntered = 0
		if (world && world.dimension === "nether") {
			world.dimension = "overworld"
			world.pendingPortalSite = null
			world.loadChunks()
		}
		survivalAccum = 0
		survivalLastFrame = 0
		lavaTimer = 0
		updateArmorStats()
		setUpdateHUD(true)
	}

	function equipHeldArmor() {
		let stack = heldStack()
		if (!stack || !isItem(stack.id)) return false
		let def = itemDef(stack.id)
		if (!def || def.behavior !== "armor") return false
		let index = ARMOR_SLOTS.indexOf(def.armorSlot)
		if (index < 0) return false
		let old = inventory.armor[index]
		inventory.armor[index] = stack
		inventory.slots[inventory.hotbarSlot] = old || null
		updateHolding()
		updateArmorStats()
		setUpdateHUD(true)
		return true
	}

	function startEating() {
		if (gameMode !== "survival" || p.spectator || p.dead) return false
		let def = isItem(holding) ? itemDef(holding) : null
		if (!def || def.behavior !== "food") return false
		if (p.food >= p.maxFood && !def.alwaysEdible) return false
		p.eating = 32
		p.eatingTotal = 32
		p.eatingItem = holding
		return true
	}

	function finishEating() {
		let id = p.eatingItem
		p.eating = 0
		p.eatingItem = 0
		let def = isItem(id) ? itemDef(id) : null
		if (!def || def.behavior !== "food" || holding !== id) return
		if (p.food >= p.maxFood && !def.alwaysEdible) return
		let nutrition = def.food || 0
		let saturation = def.saturation === undefined ? 0.6 : def.saturation
		p.food = Math.min(p.maxFood, p.food + nutrition)
		p.saturation = Math.min(p.food, p.saturation + nutrition * saturation * 2)
		if (def.effects) for (let e of def.effects) applyEffect(e.effect, e.duration, e.amplifier)
		if (def.teleport) {
			p.x += (Math.random() * 16 | 0) - 8
			p.z += (Math.random() * 16 | 0) - 8
			p.previousX = p.x
			p.previousZ = p.z
			p.velocity.x = 0
			p.velocity.z = 0
			p.fallDistance = 0
		}
		if (gameMode !== "creative") {
			consumeHeld(1)
			if (def.container && itemIds[def.container] !== undefined) addItem(itemIds[def.container], 1)
		}
		setUpdateHUD(true)
	}

	function findArrowItem() {
		for (let id of [itemIds.arrow, itemIds.spectralArrow, itemIds.tippedArrow]) {
			if (id === undefined) continue
			for (let i = 0; i < inventory.slots.length; i++) {
				let stack = inventory.slots[i]
				if (stack && stack.id === id && stack.count > 0) return id
			}
		}
		return 0
	}
	function consumeItem(id) {
		if (gameMode === "creative") return
		for (let i = 0; i < inventory.slots.length; i++) {
			let stack = inventory.slots[i]
			if (!stack || stack.id !== id || stack.count <= 0) continue
			stack.count--
			if (stack.count <= 0) inventory.slots[i] = null
			updateHolding()
			return
		}
	}
	function startBow() {
		if (p.bowCharge) return true
		if (gameMode !== "creative" && !findArrowItem()) return false
		p.bowCharge = win.performance.now()
		p.bowItem = holding
		p.interactHold = true
		return true
	}
	function releaseHeld() {
		let chargeStart = p.bowCharge
		p.bowCharge = 0
		p.blocking = false
		if (!chargeStart || holding !== p.bowItem) return
		let elapsed = win.performance.now() - chargeStart
		if (elapsed < 120) return
		let arrow = findArrowItem()
		if (!arrow && gameMode !== "creative") return
		if (!arrow) arrow = itemIds.arrow
		let arrowDef = itemDef(arrow)
		let speed = 0.7 + Math.min(1, elapsed / 1000) * 1.4
		let dir = p.direction
		spawnArrow(p.x, p.y + 0.35, p.z, dir.x * speed, dir.y * speed + 0.1, dir.z * speed, {
			kind: arrow, effects: arrowDef && arrowDef.effects, spectral: arrowDef && arrowDef.spectral
		})
		consumeItem(arrow)
		damageHeldItem(1)
		setUpdateHUD(true)
	}
	function startDrinking() {
		let def = isItem(holding) ? itemDef(holding) : null
		if (!def || def.behavior !== "potion") return false
		if (p.drinking > 0) return true
		p.drinking = 32
		p.drinkingItem = holding
		p.interactHold = true
		return true
	}
	function finishDrinking() {
		let id = p.drinkingItem
		p.drinking = 0
		p.drinkingItem = 0
		let def = isItem(id) ? itemDef(id) : null
		if (!def || def.behavior !== "potion" || holding !== id) return
		if (def.splash || def.lingering) {
			spawnPotionCloud(p.x, p.y, p.z, def.effects, !!def.lingering)
		} else {
			if (def.effects) for (let e of def.effects) applyEffect(e.effect, e.duration, e.amplifier)
		}
		if (gameMode !== "creative") {
			consumeHeld(1)
			if (!def.splash && !def.lingering && itemIds.glassBottle !== undefined) addItem(itemIds.glassBottle, 1)
		}
		setUpdateHUD(true)
	}
	function drinkMilk() {
		clearEffects()
		if (gameMode !== "creative") {
			consumeHeld(1)
			addItem(itemIds.bucket, 1)
		}
		setUpdateHUD(true)
	}

	function damageHeldTool(amount) {
		let stack = heldStack()
		if (!stack || !isItem(stack.id)) return
		let def = itemDef(stack.id)
		if (!def || def.behavior !== "tool" || !def.durability) return
		damageHeldItem(amount)
	}

	function damageToolOnBreak() {
		let stack = heldStack()
		if (!stack || !isItem(stack.id)) return
		let def = itemDef(stack.id)
		if (!def || def.behavior !== "tool" || !def.durability) return
		damageHeldTool(def.tool === "sword" ? 2 : 1)
	}

	function tillSoil() {
		if (!hitBox.pos || hitBox.face !== "top") return false
		let x = hitBox.pos[0], y = hitBox.pos[1], z = hitBox.pos[2]
		let target = world.getBlock(x, y, z)
		let data = blockData[target & BASE_MASK]
		if (!data || !/^(dirt|grass|grassBlock|rootedDirt)$/.test(data.name)) return false
		if (world.getBlock(x, y + 1, z)) return false
		world.setBlock(x, y, z, blockIds.farmland)
		p.lastPlace = Date.now()
		if (gameMode !== "creative") {
			damageHeldTool(1)
			addExhaustion(0.005)
		}
		return true
	}

	function plantHeld() {
		if (!hitBox.pos || hitBox.face !== "top") return false
		let pos = hitBox.pos
		let target = world.getBlock(pos[0], pos[1], pos[2])
		if ((target & BASE_MASK) !== blockIds.farmland) return false
		let def = isItem(holding) ? itemDef(holding) : null
		let crop = def && def.plant ? blockIds[def.plant] : 0
		if (!crop) return false
		let x = pos[0], y = pos[1] + 1, z = pos[2]
		if (y < 0 || y >= maxHeight || world.getBlock(x, y, z)) return false
		world.setBlock(x, y, z, crop)
		p.lastPlace = Date.now()
		if (gameMode !== "creative") {
			consumeHeld(1)
			addExhaustion(0.005)
		}
		return true
	}

	function harvestCrop(old) {
		let data = blockData[old & STATE_MASK]
		if (!data) return
		let mature = (data.cropAge || 0) >= (data.maxAge || 0)
		if (data.name === "wheat") {
			if (mature) {
				addItem(itemIds.wheat, 1)
				addItem(itemIds.wheatSeeds, 1 + (Math.random() * 3 | 0))
			} else {
				addItem(itemIds.wheatSeeds, 1)
			}
		} else if (data.name === "carrots") {
			addItem(itemIds.carrot, mature ? 1 + (Math.random() * 3 | 0) : 1)
		} else if (data.name === "potatoes") {
			addItem(itemIds.potato, mature ? 1 + (Math.random() * 3 | 0) : 1)
		} else {
			addItem(blockDrop(old), 1)
		}
	}

	function tickSurvival() {
		if (gameMode !== "survival" || p.spectator || p.dead) return
		updateArmorStats()
		if (p.damageCooldown > 0) p.damageCooldown--
		if (p.hurtTime > 0) p.hurtTime--
		tickEffects()

		if (p.eating > 0) {
			if (!Key.rightMouse || holding !== p.eatingItem) {
				p.eating = 0
			} else {
				p.eating--
				if (p.eating <= 0) finishEating()
			}
		}
		if (p.drinking > 0) {
			if (!Key.rightMouse || holding !== p.drinkingItem) {
				p.drinking = 0
			} else {
				p.drinking--
				if (p.drinking <= 0) finishDrinking()
			}
		}
		if (p.elytraGliding) {
			p.elytraWear++
			if (p.elytraWear >= 20) {
				p.elytraWear = 0
				damageElytra(1)
			}
		} else p.elytraWear = 0

		if (p.exhaustion >= 4) {
			while (p.exhaustion >= 4) {
				p.exhaustion -= 4
				if (p.saturation > 0) p.saturation = Math.max(0, p.saturation - 1)
				else p.food = Math.max(0, p.food - 1)
			}
			if (p.food <= 0) p.saturation = 0
			else if (p.saturation > p.food) p.saturation = p.food
		}

		let eyeBlock = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
		let eyeData = blockData[eyeBlock & BASE_MASK]
		let headInWater = eyeData && eyeData.liquid === "water"
		if (headInWater && effectLevel("waterBreathing") < 0) {
			p.air = Math.max(0, p.air - 1)
			if (p.air <= 0) {
				p.drownTimer++
				if (p.drownTimer >= 20) {
					p.drownTimer = 0
					hurt(2, "drown")
				}
			} else {
				p.drownTimer = 0
			}
		} else {
			p.air = Math.min(p.maxAir, p.air + 4)
			p.drownTimer = 0
		}
		if (p.dead) return

		let bodyFluid = fluidAt(p.x, p.y - 0.9, p.z)
		if (bodyFluid === "water") p.fireTicks = 0
		if (bodyFluid === "lava") {
			p.inLava = true
			if (effectLevel("fireResistance") < 0) p.fireTicks = Math.max(p.fireTicks, 160)
			else p.fireTicks = 0
			p.fireDamageTimer = 0
			lavaTimer++
			if (lavaTimer >= 10 && effectLevel("fireResistance") < 0) {
				lavaTimer = 0
				hurt(4, "lava")
			}
		} else {
			p.inLava = false
			lavaTimer = 0
			if (p.fireTicks > 0 && effectLevel("fireResistance") < 0) {
				p.fireTicks--
				p.fireDamageTimer++
				if (p.fireDamageTimer >= 20) {
					p.fireDamageTimer = 0
					hurt(1, "fire")
				}
			} else {
				p.fireDamageTimer = 0
			}
		}
		if (p.dead) return

		if (p.food <= 0) {
			p.starveTimer++
			if (p.starveTimer >= 80) {
				p.starveTimer = 0
				// Normal difficulty leaves the player at half a heart.
				if (p.health > 1) hurt(1, "starve")
			}
		} else {
			p.starveTimer = 0
		}

		if (p.health < p.maxHealth && p.food >= 18) {
			let fast = p.food >= 20 && p.saturation > 0
			p.regenTimer++
			if (p.regenTimer >= (fast ? 10 : 80)) {
				p.regenTimer = 0
				p.health = Math.min(p.maxHealth, p.health + 1)
				addExhaustion(6)
			}
		} else {
			p.regenTimer = 0
		}
		if (p.health > p.maxHealth) p.health = p.maxHealth

		let key = Math.ceil(p.health * 2) + ":" + p.food + ":" + p.armorPoints + ":" + Math.ceil(p.air / 30) + ":" + (p.hurtTime > 0 ? 1 : 0) + ":" + (p.fireTicks > 0 ? 1 : 0) + ":" + (p.inLava ? 1 : 0)
		if (key !== lastStatusKey) {
			lastStatusKey = key
			setUpdateHUD(true)
		}
	}

	function tickNetherPortal() {
		if (!world || !world.active || screen !== "play" || p.dead) return false
		let now = Date.now()
		if (p.portalCooldown && now < p.portalCooldown) {
			p.portalEntered = 0
			return false
		}
		if (!netherPortalAt(world, p.x, p.y, p.z)) {
			p.portalEntered = 0
			return false
		}
		if (!p.portalEntered) p.portalEntered = now
		let delay = gameMode === "creative" ? 400 : 900
		if (now - p.portalEntered < delay) return false
		let moved = world.dimension === "nether" ? world.enterOverworld() : world.enterNether()
		if (!moved) return false
		p.portalCooldown = now + 3000
		p.portalEntered = 0
		releasePointer()
		changeScene("loading")
		return true
	}

	function updateSurvival() {
		if (tickNetherPortal()) return
		let now = win.performance.now()
		if (!survivalLastFrame) survivalLastFrame = now
		let frameMs = now - survivalLastFrame
		survivalLastFrame = now
		if (!(frameMs >= 0)) frameMs = 0
		if (frameMs > 250) frameMs = 250
		if (gameMode !== "survival" || p.spectator || p.dead) {
			p.fallDistance = 0
			survivalAccum = 0
			return
		}

		let bodyFluid = fluidAt(p.x, p.y - 0.9, p.z)
		if (p.flying || bodyFluid || p.elytraGliding) {
			p.fallDistance = 0
		} else if (p.onGround) {
			// Include the final step down: collision zeroes the velocity before
			// this frame runs, so the landing drop would otherwise be missed.
			let landingDrop = p.previousY - p.y
			if (landingDrop > 0 && landingDrop < 100) p.fallDistance += landingDrop
			if (p.fallDistance > 3) hurt(Math.floor(p.fallDistance - 3), "fall")
			p.fallDistance = 0
		} else if (p.velocity.y < 0) {
			let dy = p.previousY - p.y
			if (dy > 0 && dy < 100) p.fallDistance += dy
		}

		if (p.onGround && !p.flying) {
			let dx = p.x - p.previousX
			let dz = p.z - p.previousZ
			let distance = Math.sqrt(dx * dx + dz * dz)
			if (distance > 0 && distance < 10) addExhaustion(distance * (p.sprinting ? 0.1 : 0.01))
		}

		survivalAccum += frameMs
		let guard = 0
		while (survivalAccum >= 50 && guard++ < 5) {
			survivalAccum -= 50
			tickSurvival()
			if (screen !== "play") return
		}
		if (p.health <= 4 || p.hurtTime > 0 || p.fireTicks > 0 || p.inLava || p.eating > 0) setUpdateHUD(true)
	}

	// Screen space offsets used to fatten the block outline.
	// Most browsers clamp gl.lineWidth() to 1, so the width is faked by
	// drawing the outline several times, offset around a circle.
	let outlinePasses = [
		[ 0, 0 ],
		[ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ],
		[ 0.7071, 0.7071 ], [ -0.7071, -0.7071 ],
		[ 0.7071, -0.7071 ], [ -0.7071, 0.7071 ]
	]
	function box2(sides, tex) {
		if (blockFill) {
			let i = 0
			for (let side in Block) {
				if (sides & Block[side]) {
					// The cube stores its bottom face first, while the top/bottom
					// visibility bits are swapped. Mirror the texture swap used by
					// the chunk mesher so menu grass blocks get grass on top.
					let texIndex = side === "top" ? 1 : side === "bottom" ? 0 : i
					vertexAttribPointer("aVertex", program3D, "aVertex", 3, sideEdgeBuffers[Sides[side]])
					vertexAttribPointer("aTexture", program3D, "aTexture", 2, texCoordsBuffers[textureMap[tex[texIndex]]])
					gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0)
				}
				i++
			}
		}
		if (blockOutlines) {
			vertexAttribPointer("aVertex", program3D, "aVertex", 3, hitBox.shape.buffer)
			vertexAttribPointer("aTexture", program3D, "aTexture", 2, texCoordsBuffers[textureMap.hitbox])
			// Pass offsets are in half pixels, which makes the outline one
			// pixel thinner than a full-pixel fattening.
			let px = 1 / width
			let py = 1 / height
			for (let pass = 0; pass < outlinePasses.length; pass++) {
				gl.uniform2f(glCache.uLineOffset, outlinePasses[pass][0] * px, outlinePasses[pass][1] * py)
				for (let i = 0; i < hitBox.shape.size; i++) {
					gl.drawArrays(gl.LINE_LOOP, i * 4, 4)
				}
			}
			gl.uniform2f(glCache.uLineOffset, 0, 0)
		}
	}
	function block2(x, y, z, t, camera) {
		if (camera) {
			camera.transformation.translate(x, y, z)
			uniformMatrix("view3d", program3D, "uView", false, camera.getMatrix())
		} else {
			//copyArr(modelView, matrix)
			trans(modelView, x, y, z)
			matMult()
			trans(modelView, -x, -y, -z)
			transpose(matrix)
			uniformMatrix("view3d", program3D, "uView", false, matrix)
		}
		box2(0xff, blockData[t].textures)
	}

	function changeWorldBlock(t) {
		let pos = hitBox.pos
		if(pos && pos[1] > 0 && pos[1] < maxHeight) {
			// A stale save or an older placement mode can carry state bits that
			// have no entry in the current registry. Place the base block rather
			// than aborting the tick and freezing the world.
			if (t && !blockData[t]) t = blockData[t & BASE_MASK] ? (t & BASE_MASK) : 0
			let shape = t ? blockData[t].shape : null
			if (shape && shape.rotate) {
				let pi = Math.PI / 4
				if (p.ry <= pi) {} // North; default
				else if (p.ry < 3 * pi) {
					t |= WEST
				} else if (p.ry < 5 * pi) {
					t |= SOUTH
				} else if (p.ry < 7 * pi) {
					t |= EAST
				}
			}

			// Vanilla picks the top half when the player clicks the bottom face or
			// the upper half of a side. Blocks here are centered on integer
			// coordinates (they span y-0.5..y+0.5), so the upper half of a face
			// lands in the lower half of world-space `% 1`.
			if (shape && shape.flip && hitBox.face !== "top" && (hitBox.face === "bottom" || (p.direction.y * hitBox.closest + p.y) % 1 < 0.5)) {
				t |= FLIP
			}

			let old = world.getBlock(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
			if ((old & BASE_MASK) === blockIds.chest && (t & BASE_MASK) !== blockIds.chest) {
				world.deleteChest(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
			}
			if ((old & BASE_MASK) === blockIds.furnace && (t & BASE_MASK) !== blockIds.furnace) {
				let furnace = world.deleteFurnace(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
				if (furnace && furnace.slots) {
					for (let stack of furnace.slots) {
						if (stack && stack.count > 0) spawnDrop(stack.id, stack.count)
					}
				}
			}
			if (!t && old && isDoorState(old)) {
				// Breaking a door takes out both halves at once.
				let base = old & BASE_MASK
				let otherY = hitBox.pos[1] + (old & DOOR_UPPER ? -1 : 1)
				let other = otherY >= 0 && otherY < maxHeight ? world.getBlock(hitBox.pos[0], otherY, hitBox.pos[2]) : 0
				if (other && isDoorState(other) && (other & BASE_MASK) === base) {
					world.setBlock(hitBox.pos[0], otherY, hitBox.pos[2], 0)
				}
				clearDoorPassThrough(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
			}
			let oldData = old && blockData[old & STATE_MASK]
			if (oldData && oldData.bed) {
				// Beds also come apart as a pair, whether the player mined one
				// half or replaced it with another block.
				let other = bedMate(old, hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
				if (other) world.setBlock(other[0], other[1], other[2], 0)
			}
			world.setBlock(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2], t)
			refreshFences(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
			if (t) {
				p.lastPlace = Date.now()
			} else {
				p.lastBreak = Date.now()
				if (old && gameMode !== "creative") {
					let oldData = blockData[old & STATE_MASK]
					if (oldData && oldData.crop) {
						harvestCrop(old)
					} else {
						addItem(blockDrop(old), 1)
						let bonus = bonusDrop(old)
						if (bonus && Math.random() < bonus.chance) addItem(bonus.id, 1)
					}
					addExhaustion(0.005)
					damageToolOnBreak()
				}
			}
		}
	}

	// Survival mining: holding the left mouse button fills a destroy-stage
	// overlay on the targeted block instead of breaking it instantly. Creative
	// mode keeps the instant break from changeWorldBlock().
	const MINING_STAGES = 10
	const MINING_TOOL_SPEED = { wooden: 2, stone: 4, iron: 6, golden: 12, diamond: 8, netherite: 9 }
	// [ name pattern, seconds by hand, preferred tool ]
	const MINING_RULES = [
		[ /obsidian|ancientdebris|netheriteblock|reinforceddeepslate/, 20, "pickaxe" ],
		[ /ore|stone|deepslate|brick|terracotta|concrete|quartz|amethyst|tuff|calcite|basalt|andesite|diorite|granite|blackstone|prismarine|endstone|purpur|anvil|furnace|dispenser|dropper|observer|piston|hopper|cauldron|beacon|conduit|spawner|sandstone/, 1.5, "pickaxe" ],
		[ /log|wood|plank|fence|door|trapdoor|bookshelf|craftingtable|chest|barrel|lectern|sign|bamboo|loom|smithing|cartography/, 2, "axe" ],
		[ /dirt|sand|gravel|clay|snow|mud|soul|farmland|grass|podzol|mycelium|moss|rooteddirt/, 0.5, "shovel" ],
		[ /leaves|wool|carpet|glass|candle|vine|cobweb|crop|wheat|carrot|potato|beetroot|kelp|seagrass|flower|sapling|torch/, 0.3, null ]
	]
	let mining = null
	let miningLast = 0

	function miningTime(block) {
		let data = blockData[block & BASE_MASK]
		let name = data && data.name ? data.name.toLowerCase() : ""
		let rule = null
		for (let i = 0; i < MINING_RULES.length; i++) {
			if (MINING_RULES[i][0].test(name)) {
				rule = MINING_RULES[i]
				break
			}
		}
		let time = rule ? rule[1] : 1
		let def = isItem(holding) ? itemDef(holding) : null
		if (def && def.behavior === "tool") {
			let speed = MINING_TOOL_SPEED[def.tier] || 1
			if (rule && rule[2] && def.tool === rule[2]) {
				time /= speed
			} else if (rule && !rule[2] && def.tool === "sword") {
				time /= 1.5
			}
		}
		return time < 0 ? 0 : time
	}

	function startMining() {
		mining = null
		if (gameMode === "creative" || screen !== "play" || !hitBox.pos) return
		let block = world.getBlock(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2])
		if (!block) return
		mining = {
			x: hitBox.pos[0], y: hitBox.pos[1], z: hitBox.pos[2],
			progress: 0,
			time: miningTime(block)
		}
		miningLast = win.performance.now()
	}

	function stopMining() {
		mining = null
		miningLast = 0
	}

	function updateMining() {
		if (gameMode === "creative" || screen !== "play" || !Key.leftMouse) {
			if (mining) stopMining()
			return
		}
		if (!mining) {
			// Keep mining the next block while the button stays held.
			startMining()
			if (!mining) return
		}
		let now = win.performance.now()
		let dt = miningLast ? (now - miningLast) / 1000 : 0
		miningLast = now
		if (dt < 0) dt = 0
		if (dt > 0.25) dt = 0.25
		if (!hitBox.pos) {
			stopMining()
			return
		}
		if (hitBox.pos[0] !== mining.x || hitBox.pos[1] !== mining.y || hitBox.pos[2] !== mining.z) {
			// Crosshair moved to a new block: start that one from scratch.
			startMining()
			return
		}
		if (!world.getBlock(mining.x, mining.y, mining.z)) {
			stopMining()
			return
		}
		if (mining.time <= 0) {
			changeWorldBlock(0)
			mining = null
			return
		}
		mining.progress += dt / mining.time
		if (mining.progress >= 1) {
			changeWorldBlock(0)
			mining = null
		}
	}

	function renderMining() {
		if (!mining || !blockFill || !hitBox.shape || !hitBox.shape.buffer) return
		if (!hitBox.pos || hitBox.pos[0] !== mining.x || hitBox.pos[1] !== mining.y || hitBox.pos[2] !== mining.z) return
		let stage = Math.floor(mining.progress * MINING_STAGES)
		if (stage > MINING_STAGES - 1) stage = MINING_STAGES - 1
		let u = texCoordsBuffers[textureMap["destroyStage" + stage]]
		if (!u) return
		gl.activeTexture(gl.TEXTURE0)
		gl.bindTexture(gl.TEXTURE_2D, tex)
		p.transformation.translate(mining.x, mining.y, mining.z)
		uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
		// Block faces use a positive polygon offset; pull the coplanar crack
		// quads forward so they win the depth test.
		gl.polygonOffset(-1, -1)
		// The texture-coordinate buffer is a single face (four UVs), so the
		// vertex pointer must advance per face while the texture pointer stays
		// at its start. Advancing both pointers made faces after the bottom
		// sample past the UV buffer and render no cracks.
		// vertexAttribPointer() binds the buffer it is given. Binding the
		// texture coordinates last leaves the UV buffer selected, so the
		// position pointer below must select the shape buffer again or every
		// crack vertex is read out of the tiny UV array and nothing appears.
		gl.bindBuffer(gl.ARRAY_BUFFER, hitBox.shape.buffer)
		vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
		gl.bindBuffer(gl.ARRAY_BUFFER, hitBox.shape.buffer)
		for (let i = 0; i < hitBox.shape.size; i++) {
			gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 0, i * 48)
			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
		}
		gl.polygonOffset(1, 1)
		p.transformation.translate(-mining.x, -mining.y, -mining.z)
	}

	// Right-click in the world: use the held item first (buckets, flint and
	// steel, doors, trapdoors), otherwise place the held block.
	function shearBlock(x, y, z) {
		let state = world.getBlock(x, y, z)
		let data = blockData[state & BASE_MASK]
		if (!data) return false
		if (!/Leaves$/.test(data.name) && !/Wool$/.test(data.name) && data.name !== "cobweb") return false
		world.setBlock(x, y, z, 0)
		let drop = x === undefined ? 0 : (state & BASE_MASK)
		if (drop) addItem(drop, 1)
		if (gameMode !== "creative") damageHeldItem(1)
		p.lastPlace = Date.now()
		return true
	}

	// Find the other half of a bed without trusting its facing bits. Older
	// saves and generated beds can disagree about which way the head points,
	// but the two cells are always adjacent and carry opposite head bits.
	function bedMate(state, x, y, z) {
		let base = state & BASE_MASK
		let wantsHead = !(state & BED_HEAD)
		for (let dir of [ [ 1, 0 ], [ -1, 0 ], [ 0, 1 ], [ 0, -1 ] ]) {
			let nx = x + dir[0]
			let nz = z + dir[1]
			let other = world.getBlock(nx, y, nz)
			if (other && (other & BASE_MASK) === base && !!(other & BED_HEAD) === wantsHead) {
				return [ nx, y, nz ]
			}
		}
		return null
	}

	function bedMessage(text) {
		if (!win.message) return
		win.message.innerText = text
		win.message.classList.remove("hidden")
		clearTimeout(win.bedMessageTimer)
		win.bedMessageTimer = setTimeout(() => win.message.classList.add("hidden"), 2000)
	}

	// Right-clicking either half of a bed sleeps until morning. Sleeping is
	// only allowed during the night half of the day; beds are never consumed.
	function useBed(x, y, z) {
		let state = world.getBlock(x, y, z)
		let data = blockData[state & STATE_MASK] || blockData[state & BASE_MASK]
		if (!data || !data.bed) return false
		let total = DAY_LENGTH * 1000
		let time = ((world.time || 0) % total + total) % total
		if (time < total / 2) {
			bedMessage("You can only sleep at night")
			p.interactHold = true
			return true
		}
		// Wake at the same clock position as /time set morning: one eighth of
		// the way through the day. world.time is in milliseconds.
		world.time = DAY_LENGTH * 125
		p.interactHold = true
		p.lastPlace = Date.now()
		return true
	}

	function useHeld() {
		if (screen !== "play") {
			return false
		}
		let def = isItem(holding) ? itemDef(holding) : null
		if (def && def.behavior === "shield") {
			p.blocking = true
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "bow") {
			if (startBow()) return true
			return false
		}
		if (def && def.behavior === "potion") {
			if (startDrinking()) return true
			return false
		}
		if (def && def.behavior === "milk") {
			drinkMilk()
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "firework") {
			spawnFirework(p.x, p.y + 0.4, p.z, p.direction.x * 0.18, 0.45, p.direction.z * 0.18)
			if (gameMode !== "creative") consumeHeld(1)
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "fishingRod") {
			if (p.fishingCast) {
				reelFishingBobber()
				p.fishingCast = false
			} else {
				p.fishingCast = castFishingBobber()
			}
			if (gameMode !== "creative") damageHeldItem(1)
			p.interactHold = true
			return true
		}
		if (def && (def.behavior === "minecart" || def.behavior === "boat")) {
			if (p.ridingVehicle) dismountVehicle()
			spawnVehicle(def.vehicle, holding)
			if (gameMode !== "creative") consumeHeld(1)
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "endCrystal") {
			spawnEndCrystal(p.x, p.y, p.z)
			if (gameMode !== "creative") consumeHeld(1)
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "decor") {
			spawnDecoration(def.name, holding, p.x, p.y - p.bottomH + 0.1, p.z)
			if (gameMode !== "creative") consumeHeld(1)
			p.interactHold = true
			return true
		}
		if (!hitBox.pos) {
			// Armor and food can be used while looking at the sky, like vanilla.
			if (def && def.behavior === "armor" && equipHeldArmor()) {
				p.interactHold = true
				return true
			}
			if (def && def.behavior === "food" && startEating()) {
				p.interactHold = true
				return true
			}
			return false
		}
		let pos = hitBox.pos
		let target = world.getBlock(pos[0], pos[1], pos[2])
		let targetData = blockData[target & BASE_MASK]
		if (targetData && targetData.sign) {
			openSign(pos[0], pos[1], pos[2])
			p.interactHold = true
			return true
		}
		if (targetData && targetData.bed && useBed(pos[0], pos[1], pos[2])) {
			return true
		}
		if (targetData && targetData.name === "obsidian" && def && (def.name === "flintAndSteel" || def.name === "fireCharge")) {
			if (igniteNetherPortal(world, pos[0], pos[1], pos[2])) {
				if (gameMode !== "creative") {
					if (def.name === "fireCharge") consumeHeld(1)
					else damageHeldItem(1)
				}
				p.lastPlace = Date.now()
				p.interactHold = true
				return true
			}
		}
		if (def && def.behavior === "shears" && shearBlock(pos[0], pos[1], pos[2])) {
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "bucket" && bucketUse()) {
			p.interactHold = true
			return true
		}
		if (target && isTntBlock(target) && def && (def.name === "flintAndSteel" || def.name === "fireCharge")) {
			if (primeTnt(pos[0], pos[1], pos[2])) {
				if (gameMode !== "creative" && def.name === "fireCharge") consumeHeld(1)
				p.lastPlace = Date.now()
				p.interactHold = true
				return true
			}
		}
		if (isDoorState(target)) {
			toggleDoor(pos[0], pos[1], pos[2])
			p.interactHold = true
			return true
		}
		if (isTrapState(target)) {
			toggleTrapdoor(pos[0], pos[1], pos[2])
			p.interactHold = true
			return true
		}
		if ((target & BASE_MASK) === blockIds.craftingTable) {
			openCraftingTable()
			p.interactHold = true
			return true
		}
		if ((target & BASE_MASK) === blockIds.chest || (target & BASE_MASK) === blockIds.barrel) {
			openChest(pos[0], pos[1], pos[2])
			p.interactHold = true
			return true
		}
		if ((target & BASE_MASK) === blockIds.furnace) {
			openFurnace(pos[0], pos[1], pos[2])
			p.interactHold = true
			return true
		}
		if (def && def.tool === "hoe" && tillSoil()) {
			p.interactHold = true
			return true
		}
		if (def && def.plant && plantHeld()) {
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "armor" && equipHeldArmor()) {
			p.interactHold = true
			return true
		}
		if (def && def.behavior === "food" && startEating()) {
			p.interactHold = true
			return true
		}
		if (holding) {
			newWorldBlock()
			return true
		}
		return false
	}
	function newWorldBlock() {
		if(!hitBox.pos || !holding) {
			return
		}
		if (isItem(holding)) {
			// Items (tools, food, materials, flint and steel) are not placeable blocks.
			return
		}
		let pos = hitBox.pos, x= pos[0], y = pos[1], z = pos[2]
		switch(hitBox.face) {
			case "top":
				y += 1
				break
			case "bottom":
				y -= 1
				break
			case "south":
				z -= 1
				break
			case "north":
				z += 1
				break
			case "west":
				x -= 1
				break
			case "east":
				x += 1
				break
		}
		if (!inBox(x, y, z, 1, 1, 1) && canReplaceBlock(world.getBlock(x, y, z)) && y > 0 && y < maxHeight) {
			let state = holding < 0x800 ? (holding | placementMode(holding)) : holding
			// Plants may only be placed on top of a supporting block.
			let held = holding < 0x800 ? blockData[holding] : null
			if (held && held.sign) {
				// Signs attach to whatever they were clicked against: a floor for
				// upright signs, the side of a block for wall signs and the ceiling
				// for hanging signs. Vanilla turns the normal sign item into its
				// wall variant when it is placed on a wall, so the hidden wall
				// blocks are never needed in the creative menu.
				let faceFacing = { north: NORTH, south: SOUTH, east: EAST, west: WEST }
				let facing = faceFacing[hitBox.face]
				let placing = holding
				let bits = 0
				if (held.wallSign) {
					// Older saves can still hold one of the hidden wall blocks.
					if (facing === undefined) return
					bits = facing
				} else if (held.hangingSign) {
					if (hitBox.face === "bottom") {
						placing = holding
						bits = facingToPlayer(x, z)
					} else if (facing !== undefined) {
						placing = blockIds[held.name.replace(/HangingSign$/, "WallHangingSign")]
						bits = facing
					} else {
						return
					}
				} else {
					if (hitBox.face === "top") {
						placing = holding
						bits = facingToPlayer(x, z)
					} else if (facing !== undefined) {
						placing = blockIds[held.name.replace(/Sign$/, "WallSign")]
						bits = facing
					} else {
						return
					}
				}
				if (!placing) return
				pos[0] = x
				pos[1] = y
				pos[2] = z
				changeWorldBlock(placing | bits)
				if (gameMode !== "creative") {
					consumeHeld(1)
				}
				// Vanilla opens the sign editor as soon as a sign is placed.
				openSign(x, y, z)
				p.interactHold = true
				return
			}
			if (held && held.lantern) {
				// Lanterns stand on a floor or hang from a ceiling. They have no
				// wall-mounted state, so a side click is not a valid placement.
				let hanging = hitBox.face === "bottom"
				if (!hanging && hitBox.face !== "top") return
				let attach = hanging ? world.getBlock(x, y + 1, z) : world.getBlock(x, y - 1, z)
				if (!isTorchSupport(attach)) return
				pos[0] = x
				pos[1] = y
				pos[2] = z
				changeWorldBlock(holding | (hanging ? LANTERN_HANGING : 0))
				if (gameMode !== "creative") {
					consumeHeld(1)
				}
				return
			}
			if (held && held.torch) {
				// Torches hang from the block they are placed against
				// (bottom face) or stand on the block below; they cannot float.
				let hanging = hitBox.face === "bottom"
				let attach = hanging ? world.getBlock(x, y + 1, z) : world.getBlock(x, y - 1, z)
				if (!isTorchSupport(attach)) {
					return
				}
				pos[0] = x
				pos[1] = y
				pos[2] = z
				changeWorldBlock(holding | (hanging ? TORCH_HANGING : 0))
				if (gameMode !== "creative") {
					consumeHeld(1)
				}
				return
			}
			if (held && held.support && (hitBox.face !== "top" || !isSupporter(world.getBlock(x, y - 1, z)))) {
				return
			}
			if (held && held.facing) {
				// Most facing blocks (pumpkins, furnaces, chests) point their
				// front at the player. Dispensers, droppers, pistons, observers
				// and barrels also have vertical models: placing one on a floor
				// or ceiling makes its front face up or down.
				let facing = facingToPlayer(x, z)
				if (held.verticalFacing) {
					// Dispensers, pistons, observers and barrels face away from
					// the block they were placed against, including straight
					// up or down when placed on a floor or ceiling.
					let faceFacing = {
						top: FACING_UP, bottom: FACING_DOWN,
						north: NORTH, south: SOUTH, east: EAST, west: WEST,
					}
					if (faceFacing[hitBox.face] !== undefined) facing = faceFacing[hitBox.face]
				}
				pos[0] = x
				pos[1] = y
				pos[2] = z
				changeWorldBlock(holding | facing)
				if (gameMode !== "creative") {
					consumeHeld(1)
				}
				return
			}
			if (held && held.bed) {
				// Beds occupy two blocks: clicked foot plus the head in front.
				if (!placeBed(holding, x, y, z)) {
					return
				}
			} else if (held && held.door) {
				// Doors occupy two blocks: place the top half together with the bottom.
				if (!placeDoor(holding, x, y, z)) {
					return
				}
			} else if (held && held.trap) {
				placeTrapdoor(holding, x, y, z, hitBox.face)
			} else {
				pos[0] = x
				pos[1] = y
				pos[2] = z
				changeWorldBlock(state)
			}
			if (gameMode !== "creative") {
				consumeHeld(1)
			}
		}
	}

	// Save the coords for a small sphere used to carve out caves
	let sphere;
	{
		let blocks = []
		let radius = 3.5
		let radsq = radius * radius
		for (let i = -radius; i <= radius; i++) {
			for (let j = -radius; j <= radius; j++) {
				for (let k = -radius; k <= radius; k++) {
					if (i*i + j*j + k*k < radsq) {
						blocks.push(i|0, j|0, k|0)
					}
				}
			}
		}
		sphere = new Int8Array(blocks)
	}

	function isCave(x, y, z) {
		// Generate a 3D rigid multifractal noise shell.
		// Then generate another one with different coordinates.
		// Overlay them on top of each other, and the overlapping parts should form a cave-like structure.
		// This is extremely slow, and requires generating 2 noise values for every single block in the world.
		// TODO: replace with a crawler system of some sort, that will never rely on a head position in un-generated chunks.
		let smooth = 0.02
		// carveCaves samples every second block. The wider band keeps the
		// number of cave centers per volume close to a full-resolution scan.
		let caveSize = 0.015
		let cave1 = Math.abs(0.5 - caveNoise(x * smooth, y * smooth, z * smooth)) < caveSize
		if (!cave1) {
			return false
		}
		// The second sample is only needed where the first one already matched.
		return Math.abs(0.5 - caveNoise(y * smooth, z * smooth, x * smooth)) < caveSize
	}
	function carveSphere(x, y, z) {
		if (y > 3) {
			for (let i = 0; i < sphere.length; i += 3) {
				world.setBlock(x + sphere[i], y + sphere[i + 1], z + sphere[i + 2], blockIds.air, true)
			}
		}
	}


	let controls = function() {
		if (p.ridingVehicle && Key.shift) dismountVehicle()
		move.x = 0
		move.z = 0
		let dt = (win.performance.now() - p.lastUpdate) / 33
		dt = dt > 2 ? 2 : dt

		if(Key.w) move.z += p.speed
		if(Key.s) move.z -= p.speed
		if(Key.a) move.x += p.speed
		if(Key.d) move.x -= p.speed
		if (p.flying) {
			if(Key[" "]) p.velocity.y += 0.06 * dt
			if(Key.shift) p.velocity.y -= 0.06 * dt
		}
		if(Key.arrowleft) p.ry -= 0.1 * dt
		if(Key.arrowright) p.ry += 0.1 * dt
		if(Key.arrowup) p.rx += 0.1 * dt
		if(Key.arrowdown) p.rx -= 0.1 * dt

		let now = Date.now()
		// Vanilla refuses to sprint while hungry or eating.
		let canSprint = gameMode === "creative" || p.food > 6
		if (!p.sprinting && !p.sneaking && !p.eating && Key.w && canSprint && now - p.sprintRequest < 350) {
			p.sprinting = true
			p.sprintRequest = 0
			p.FOV(settings.fov * 1.15, 250)
		}
		if (p.sprinting && (!Key.w || Key.s || p.eating || !canSprint)) {
			p.sprinting = false
			p.FOV(settings.fov, 100)
		}

		if(p.sprinting) {
			move.x *= p.sprintSpeed
			move.z *= p.sprintSpeed
		}
		if(p.flying) {
			move.x *= p.flySpeed
			move.z *= p.flySpeed
		}
		if (p.eating > 0 || p.drinking > 0) {
			move.x *= 0.3
			move.z *= 0.3
		}
		if (p.blocking) {
			move.x *= 0.35
			move.z *= 0.35
		}
		if (p.ridingVehicle) {
			move.x *= 1.35
			move.z *= 1.35
		}
		let speedEffect = effectLevel("speed")
		if (speedEffect >= 0) {
			let boost = 1 + 0.2 * (speedEffect + 1)
			move.x *= boost
			move.z *= boost
		}
		let slowEffect = effectLevel("slowness")
		if (slowEffect >= 0) {
			let reduction = Math.max(0.2, 1 - 0.15 * (slowEffect + 1))
			move.x *= reduction
			move.z *= reduction
		}
		if (!move.x && !move.z) {
			if (p.sprinting) {
				p.FOV(settings.fov, 100)
			}
			p.sprinting = false
		} else if(Math.abs(move.x) > 0 && Math.abs(move.z) > 0) {
			move.x *= move.ang
			move.z *= move.ang
		}

		//Update the velocity, rather than the position.
		let co = Math.cos(p.ry)
		let si = Math.sin(p.ry)
		let friction = p.onGround ? 1 : 0.3
		p.velocity.x += (co * move.x - si * move.z) * friction * dt
		p.velocity.z += (si * move.x + co * move.z) * friction * dt

		const TAU = Math.PI * 2
		const PI1_2 = Math.PI / 2
		while(p.ry > TAU) p.ry -= TAU
		while(p.ry < 0)   p.ry += TAU
		if(p.rx > PI1_2)  p.rx = PI1_2
		if(p.rx < -PI1_2) p.rx = -PI1_2

		p.setDirection()

		// The underwater screen tint has to follow the camera in every game
		// mode. The survival tick only runs five times a second, so track the
		// eye block here and refresh the HUD when it crosses a water surface.
		if (world) {
			let eyeState = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
			let eyeData = blockData[eyeState & BASE_MASK]
			let headInWater = !!(eyeData && eyeData.liquid === "water")
			if (headInWater !== !!p.headInWater) {
				p.headInWater = headInWater
				setUpdateHUD(true)
			}
		}
	}

	// Mouse sensitivity variable, used for the settings buttons and in the "mmoved" function
	let mouseS = 300


	function initPlayer() {
		setP(new Camera())
		p.speed = 0.075
		p.velocity = new PVector(0, 0, 0)
		p.pos = new Float32Array(3)
		p.sprintSpeed = 1.3
		p.lastForwardTap = 0
		p.sprintRequest = 0
		p.flySpeed = 2.5
		p.x = 8
		p.y = superflat ? 6 : (Math.round(noise(8 * generator.smooth, 8 * generator.smooth) * generator.height) + 2 + generator.extra)
		p.z = 8
		p.previousX = 8
		p.previousY = 70
		p.previousZ = 8
		p.w = 3 / 8
		p.bottomH = 1.62
		p.topH = 0.18
		p.headInWater = false
		p.onGround = false
		p.jumpSpeed = 0.3
		p.sprinting = false
		p.maxYVelocity = 1.5
		p.gravityStength = -0.032
		p.lastUpdate = win.performance.now()
		p.lastBreak = Date.now()
		p.lastPlace = Date.now()
		p.lastJump = Date.now()
		p.autoBreak = false
		p.flying = false
		p.sneaking = false
		p.spectator = false
		resetSurvival()
		
		win.player = p
		win.p2 = p2
		win.inventory = inventory
		win.applyEffect = applyEffect
		win.clearEffects = clearEffects
		win.releaseHeld = releaseHeld
		win.hurt = hurt
		Object.defineProperty(win, "gameScreen", { get: () => screen })
	}


export {
	cross, Matrix, Plane, Camera,
	trans, rotX, rotY, transpose, matMult, copyArr, FOV, initModelView,
	timeString, roundBits,
	rayTrace, runRayTrace, lookingAt,
	inBox, onBox, collided, contacts, sprintWallHit,
	resolveContactsAndUpdatePosition, runGravity,
	box2, block2, outlinePasses, changeWorldBlock, newWorldBlock, useHeld,
	startMining, stopMining, updateMining, renderMining,
	sphere, isCave, carveSphere,
	controls, mouseS, initPlayer,
	updateSurvival, resetSurvival, respawnPlayer, hurt, updateArmorStats,
	applyEffect, clearEffects, releaseHeld, effectLevel
}
