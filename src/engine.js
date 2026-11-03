import { blockData, BLOCK_COUNT } from './blocks.js'
import { VANILLA_MODELS } from './vanillaModels.js'
import { ITEM_ID_BASE, itemData } from './items.js'
import {
	win, doc, gl, setGl, glCache, program3D, setProgram3D, program2D, setProgram2D,
	programSky, setProgramSky, skyCache, textures, textureMap, dirtBuffer, setDirtBuffer,
	dirtTexture, setDirtTexture, textureCoords, texCoordsBuffers,
	dirtbg, setDirtbg, bigArray,
	sideEdgeBuffers, dropEdgeBuffers, indexBuffer, setIndexBuffer,
	modelView, setModelView, projection, defaultModelView, matrix,
	width, height, sky, settings, setCurrentFov, setBlockOutlines, locked, setLocked,
	p, p2, world, inventory, celestialTex
} from './state.js'
import { ensureCelestialTexture, initTextures } from './textures.js'
import { FOV, initModelView, block2 } from './player.js'

// Atlas constants
const ATLAS_TILES = 64
const ATLAS_MASK = ATLAS_TILES - 1
const ATLAS_SHIFT = Math.log2(ATLAS_TILES)
const ATLAS_SCALE = 1 / ATLAS_TILES
// Crops store their growth stage in state bits 11-13. These are the stage
// counts used by the 26.3 assets: wheat has eight sprites, the root crops four.
const CROP_MAX_AGE = { wheat: 7, carrots: 3, potatoes: 3 }

const CUBE     = 0
 	const SLAB     = 0x800 // bit 11
 	const STAIR    = 0x1000 // bit 12
 	const FLIP     = 0x2000 // bit 13
 	const NORTH    = 0 // bits 14-15 hold the four directions
 	const SOUTH    = 0x4000
 	const EAST     = 0x8000
 	const WEST     = 0xC000
 	const ROTATION = 0xC000
 	// Vertical facing states. Facing blocks never use slab/stair bits, so the
 	// spare 0x2000 bit distinguishes up/down from the four horizontal states.
 	const FACING_UP = 0x2000
 	const FACING_DOWN = 0x6000
 	// Block state encoding: base block ids live in bits 0-10 (2048 blocks),
 	// owning state lives in bits 11-15. This is the "16-bit palette" layout and
 	// leaves room for the full vanilla block registry (1300+ blocks).
 	const BASE_MASK  = 0x7ff  // the base block id
 	const STATE_MASK = 0xffff // the full block state (base id | owning bits)
 	// Door state bits. Doors own bits 11-15 (they never use slab/stair/flip),
 	// so these aliases are safe to reuse for their own variant states.
 	const DOOR_UPPER = 0x800 // top half of the door
 	const DOOR_OPEN  = 0x1000 // swung open
 	const DOOR_HINGE = 0x2000 // right-hand hinge (else left-hand)
 	const DOOR_FACING = 0xC000 // the four facing directions (NORTH/SOUTH/EAST/WEST bits)
 	// Trapdoor state bits (also own bits 11-15).
 	const TRAPDOOR_BOTTOM = 0x800 // hangs from the underside of its cell
 	const TRAPDOOR_OPEN   = 0x1000 // folded up against an edge
 	const TRAPDOOR_FACING = 0xC000
	// Torch state bit (owns bit 11): hanging from the block above vs standing.
	const TORCH_HANGING = 0x800
	// Bed state bit (also bit 11): the head half. Beds own their state and never
	// create slab/stair variants, so this does not collide with SLAB.
	const BED_HEAD = 0x800
	// Lantern state bit (bit 11): the lantern hangs from the block above
	// instead of standing on the block below. Lanterns own their state, so this
	// does not collide with the slab/stair bits used by full blocks.
	const LANTERN_HANGING = 0x800
	// Fluid bit 14 marks a falling column. Falling fluid renders full-height so
	// a waterfall reads as one continuous sheet instead of stacked shallow slabs.
	const FLUID_FALLING = 0x4000
	// Dynamic lighting: emissive blocks lift face brightness from LIGHT_LIFT up to 1.
	const LIGHT_MAX = 15
	const LIGHT_LIFT = 0.3


const MAX_STACK = 64

function getPointer() {
	setLocked(true)
	if (typeof canvas !== "undefined" && canvas.requestPointerLock) {
		canvas.requestPointerLock()
	}
}

function releasePointer() {
	setLocked(false)
	if (typeof document !== "undefined" && document.exitPointerLock) {
		document.exitPointerLock()
	}
}

	let Block = {
		top: 0x4,
		bottom: 0x8,
		north: 0x20,
		south: 0x10,
		east: 0x2,
		west: 0x1,
	}
	let Sides = {
		top: 0,
		bottom: 1,
		north: 2,
		south: 3,
		east: 4,
		west: 5,
	}

	// GLSL Shader code (written in script tags at the top of the file)
	let vertexShaderSrc3D = document.getElementById("blockVertexShader").text
	let fragmentShaderSrc3D = document.getElementById("blockFragmentShader").text
	let vertexShaderSrc2D = document.getElementById("2dVertexShader").text
	let fragmentShaderSrc2D = document.getElementById("2dFragmentShader").text
	let vertexShaderSrcSky = document.getElementById("skyVertexShader").text
	let fragmentShaderSrcSky = document.getElementById("skyFragmentShader").text

	function createProgramObject(curContext, vetexShaderSource, fragmentShaderSource) {
		let vertexShaderObject = curContext.createShader(curContext.VERTEX_SHADER)
		curContext.shaderSource(vertexShaderObject, vetexShaderSource)
		curContext.compileShader(vertexShaderObject)
		if (!curContext.getShaderParameter(vertexShaderObject, curContext.COMPILE_STATUS)) {
			throw curContext.getShaderInfoLog(vertexShaderObject)
		}

		let fragmentShaderObject = curContext.createShader(curContext.FRAGMENT_SHADER)
		curContext.shaderSource(fragmentShaderObject, fragmentShaderSource)
		curContext.compileShader(fragmentShaderObject)
		if (!curContext.getShaderParameter(fragmentShaderObject, curContext.COMPILE_STATUS)) {
			throw curContext.getShaderInfoLog(fragmentShaderObject)
		}

		let programObject = curContext.createProgram()
		curContext.attachShader(programObject, vertexShaderObject)
		curContext.attachShader(programObject, fragmentShaderObject)
		curContext.linkProgram(programObject)
		if (!curContext.getProgramParameter(programObject, curContext.LINK_STATUS)) {
			throw "Error linking shaders."
		}

		return programObject
	}



	// The sky is drawn as a large cube centered on the camera. Because the shader
	// uses w = 0 for its vertices, only the direction matters, so the sky appears
	// infinitely far away and moves with the player.
	let skyboxVertices = new Float32Array([
		-1, -1, -1,   1, -1, -1,   1, -1,  1,   1, -1,  1,  -1, -1,  1,  -1, -1, -1,
		-1,  1, -1,  -1,  1,  1,   1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,
		 1, -1, -1,   1,  1, -1,   1,  1,  1,   1,  1,  1,   1, -1,  1,   1, -1, -1,
		-1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1,  1,  -1,  1, -1,  -1, -1, -1,
		-1, -1,  1,   1, -1,  1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1, -1,  1,
		-1, -1, -1,  -1,  1, -1,   1,  1, -1,   1,  1, -1,   1, -1, -1,  -1, -1, -1,
	])

	function objectify(x, y, z, width, height, textureX, textureY) {
		return {
			x: x,
			y: y,
			z: z,
			w: width,
			h: height,
			tx: textureX,
			ty: textureY
		}
	}
	let shapes = {
		/*
			[
				[(-x, -z), (+x, -z), (+x, +z), (-x, +z)], // minX = 0,  minZ = 2,  maxX = 6, maxZ = 8
				[(-x, +z), (+x, +z), (+x, -z), (-x, -z)], // minX = 9,  minZ = 10, maxX = 3, maxZ = 4
				[(+x, +y), (-x, +y), (-x, -y), (+x, -y)], // minX = 6,  minY = 7,  maxX = 0, maxY = 1
				[(-x, +y), (+x, +y), (+x, -y), (-x, -y)], // minX = 9,  minY = 10, maxX = 3, maxY = 4
				[(+y, -z), (+y, +z), (-y, +z), (-y, -z)], // minY = 10, minZ = 11, maxY = 4, maxZ = 5
				[(+y, +z), (+y, -z), (-y, -z), (-y, +z)]  // minY = 7,  minZ = 8,  maxY = 1, maxZ = 2
			]
			*/
		cube: {
			verts: [
				// x, y, z, width, height, textureX, textureY
				// 0, 0, 0 is the corner on the top left of the texture
				[objectify( 0,  0,  0, 16, 16, 0, 0)], //bottom
				[objectify( 0, 16, 16, 16, 16, 0, 0)], //top
				[objectify(16, 16, 16, 16, 16, 0, 0)], //north
				[objectify( 0, 16,  0, 16, 16, 0, 0)], //south
				[objectify(16, 16,  0, 16, 16, 0, 0)], //east
				[objectify( 0, 16, 16, 16, 16, 0, 0)]  //west
			],
			cull: {
				top: 3,
				bottom: 3,
				north: 3,
				south: 3,
				east: 3,
				west: 3
			},
			texVerts: [],
			varients: [],
			buffer: null,
			size: 6
		},
		slab: {
			verts: [
				[objectify( 0, 0,  0, 16, 16, 0, 0)], //bottom
				[objectify( 0, 8, 16, 16, 16, 0, 0)], //top
				[objectify(16, 8, 16, 16, 8, 0, 0)], //north
				[objectify( 0, 8,  0, 16, 8, 0, 0)], //south
				[objectify(16, 8,  0, 16, 8, 0, 0)], //east
				[objectify( 0, 8, 16, 16, 8, 0, 0)]  //west
			],
			cull: {
				top: 0,
				bottom: 3,
				north: 1,
				south: 1,
				east: 1,
				west: 1
			},
			texVerts: [],
			buffer: null,
			size: 6,
			varients: [],
			flip: true,
			rotate: false
		},
		stair: {
			verts: [
				[objectify( 0, 0,  0, 16, 16, 0, 0)], //bottom
				[objectify( 0, 8,  8, 16, 8, 0, 8), objectify( 0, 16,  16, 16, 8, 0, 0)], //top
				[objectify(16, 16, 16, 16, 16, 0, 0)], //north
				[objectify( 0, 8,  0, 16, 8, 0, 8), objectify( 0, 16,  8, 16, 8, 0, 0)], //south
				[objectify(16, 8, 0, 8, 8, 8, 8), objectify(16, 16, 8, 8, 16, 0, 0)], //east
				[objectify( 0, 8, 8, 8, 8, 0, 8), objectify( 0, 16, 16, 8, 16, 8, 0)]  //west
			],
			cull: {
				top: 0,
				bottom: 3,
				north: 3,
				south: 0,
				east: 0,
				west: 0
			},
			texVerts: [],
			buffer: null,
			size: 10,
			varients: [],
			flip: true,
			rotate: true
		},
		cross: {
			// Two diagonal planes, each drawn double-sided (4 quads total).
			// Geometry is built directly in initShapes(); see `custom`.
			verts: [ [], [], [], [], [], [] ],
			texVerts: [],
			cull: {
				top: 0,
				bottom: 0,
				north: 0,
				south: 0,
				east: 0,
				west: 0
			},
			size: 4,
			varients: [],
			custom: true,
			noCollide: true
		},
	}
	win.shapes = shapes

	function compareArr(arr, out) {
		let minX = 1000
		let maxX = -1000
		let minY = 1000
		let maxY = -1000
		let minZ = 1000
		let maxZ = -1000
		let min = Math.min
		let max = Math.max
		let num = 0
		for (let i = 0; i < arr.length; i += 3) {
			num = arr[i]
			minX = minX > num ? num : minX
			maxX = maxX < num ? num : maxX
			num = arr[i + 1]
			minY = minY > num ? num : minY
			maxY = maxY < num ? num : maxY
			num = arr[i + 2]
			minZ = minZ > num ? num : minZ
			maxZ = maxZ < num ? num : maxZ
		}
		out[0] = minX
		out[1] = minY
		out[2] = minZ
		out[3] = maxX
		out[4] = maxY
		out[5] = maxZ
		return out
	}

	function initShapes() {
		function mapCoords(rect, face) {
			let x = rect.x
			let y = rect.y
			let z = rect.z
			let w = rect.w
			let h = rect.h
			let tx = rect.tx
			let ty = rect.ty
			let tex = [tx+w,ty, tx,ty, tx,ty+h, tx+w,ty+h]
			let pos = null
			switch(face) {
				case 0: // Bottom
					pos = [x,y,z, x+w,y,z, x+w,y,z+h, x,y,z+h]
					break
				case 1: // Top
					pos = [x,y,z, x+w,y,z, x+w,y,z-h, x,y,z-h]
					break
				case 2: // North
					pos = [x,y,z, x-w,y,z, x-w,y-h,z, x,y-h,z]
					break
				case 3: // South
					pos = [x,y,z, x+w,y,z, x+w,y-h,z, x,y-h,z]
					break
				case 4: // East
					pos = [x,y,z, x,y,z+w, x,y-h,z+w, x,y-h,z]
					break
				case 5: // West
					pos = [x,y,z, x,y,z-w, x,y-h,z-w, x,y-h,z]
					break
			}
			pos = pos.map(c => c / 16 - 0.5)
			let minmax = compareArr(pos, [])
			pos.max = minmax.splice(3, 3)
			pos.min = minmax
			tex = tex.map(c => c / 16 * ATLAS_SCALE)
			
			return {
				pos: pos,
				tex: tex
			}
		}
		
		// 90 degree clockwise rotation; returns a new shape object
		function rotate(shape) {
			let verts = shape.verts
			let texVerts = shape.texVerts
			let cull = shape.cull
			let pos = []
			let tex = []
			for (let i = 0; i < verts.length; i++) {
				let side = verts[i]
				pos[i] = []
				tex[i] = []
				for (let j = 0; j < side.length; j++) {
					let face = side[j]
					let c = []
					pos[i][j] = c
					for (let k = 0; k < face.length; k += 3) {
						c[k] = face[k + 2]
						c[k + 1] = face[k + 1]
						c[k + 2] = -face[k]
					}
					
					tex[i][j] = texVerts[i][j].slice() // Copy texture verts exactly
					if (i === 0) {
						// Bottom
						c.push(...c.splice(0, 3))
						tex[i][j].push(...tex[i][j].splice(0, 2))
					}
					if (i === 1) {
						// Top
						c.unshift(...c.splice(-3, 3))
						tex[i][j].unshift(...tex[i][j].splice(-2, 2))
					}

					let minmax = compareArr(c, [])
					c.max = minmax.splice(3, 3)
					c.min = minmax
				}
			}
			let temp = tex[2] // North
			tex[2] = tex[5] // North = West
			tex[5] = tex[3] // West = South
			tex[3] = tex[4] // South = East
			tex[4] = temp // East = North

			temp = pos[2] // North
			pos[2] = pos[5] // North = West
			pos[5] = pos[3] // West = South
			pos[3] = pos[4] // South = East
			pos[4] = temp // East = North

			let cull2 = {
				top: cull.top,
				bottom: cull.bottom,
				north: cull.west,
				west: cull.south,
				south: cull.east,
				east: cull.north
			}
			let buffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos.flat(2)), gl.STATIC_DRAW)

			return {
				verts: pos,
				texVerts: tex,
				cull: cull2,
				rotate: true,
				flip: shape.flip,
				buffer: buffer,
				size: shape.size,
				varients: shape.varients
			}
		}

		// Mirror over the y plane; returns a new shape object. This is the
		// upside-down slab/stair variant. A mirror reverses the winding of every
		// face, so each face is walked in reverse; the texture verts are reversed
		// in step to keep every corner on its own sprite point, and each v is
		// flipped inside its tile so the sprite still reads upright on the
		// mirrored face.
		function flip(shape) {
			let verts = shape.verts
			let texVerts = shape.texVerts
			let cull = shape.cull
			let pos = []
			let tex = []
			for (let i = 0; i < verts.length; i++) {
				let side = verts[i]
				pos[i] = []
				tex[i] = []
				for (let j = 0; j < side.length; j++) {
					let face = side[j]
					let uvs = texVerts[i][j]
					let c = []
					let t = []
					for (let k = face.length - 3; k >= 0; k -= 3) {
						c.push(face[k], -face[k + 1], face[k + 2])
					}
					for (let k = uvs.length - 2; k >= 0; k -= 2) {
						t.push(uvs[k], ATLAS_SCALE - uvs[k + 1])
					}
					let minmax = compareArr(c, [])
					c.max = minmax.splice(3, 3)
					c.min = minmax
					pos[i][j] = c
					tex[i][j] = t
				}
			}
			let temp = pos[0] // Bottom
			pos[0] = pos[1] // Bottom = Top
			pos[1] = temp // Top = Bottom

			temp = tex[0] // Bottom
			tex[0] = tex[1] // Bottom = Top
			tex[1] = temp // Top = Bottom

			let cull2 = {
				top: cull.bottom,
				bottom: cull.top,
				north: (cull.north & 1) << 1 | (cull.north & 2) >> 1,
				west: (cull.west & 1) << 1 | (cull.west & 2) >> 1,
				south: (cull.south & 1) << 1 | (cull.south & 2) >> 1,
				east: (cull.east & 1) << 1 | (cull.east & 2) >> 1
			}

			let buffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos.flat(2)), gl.STATIC_DRAW)

			return {
				verts: pos,
				texVerts: tex,
				cull: cull2,
				rotate: shape.rotate,
				flip: shape.flip,
				buffer: buffer,
				size: shape.size,
				varients: shape.varients
			}
		}

		// A quad is a flat array of 12 coords plus .min/.max bounds.
		function makeQuad(a, b, c, d) {
			let f = [ ...a, ...b, ...c, ...d ]
			let minmax = compareArr(f, [])
			f.max = minmax.splice(3, 3)
			f.min = minmax
			return f
		}

		// A single axis-aligned box contributed to a fence shape. `skip` omits
		// the face pointing at a neighbouring fence (avoids coincident faces).
		function fenceBox(verts, x0, y0, z0, x1, y1, z1, skip) {
			if (skip !== "bottom") verts[0].push(objectify(x0, y0, z0, x1 - x0, z1 - z0, 6, 6))
			if (skip !== "top")    verts[1].push(objectify(x0, y1, z1, x1 - x0, z1 - z0, 6, 6))
			if (skip !== "north")  verts[2].push(objectify(x1, y1, z1, x1 - x0, y1 - y0, 6, 0))
			if (skip !== "south")  verts[3].push(objectify(x0, y1, z0, x1 - x0, y1 - y0, 6, 0))
			if (skip !== "east")   verts[4].push(objectify(x1, y1, z0, z1 - z0, y1 - y0, 6, 0))
			if (skip !== "west")   verts[5].push(objectify(x0, y1, z1, z1 - z0, y1 - y0, 6, 0))
		}
		function buildFenceShape(mask) {
			let verts = [ [], [], [], [], [], [] ]
			fenceBox(verts, 6, 0, 6, 10, 16, 10)     // center post, always drawn
			for (let b of [ 6, 12 ]) {               // lower and upper bars
				if (mask & 1) fenceBox(verts, 7, b, 7, 9,  b + 3, 16, "north")
				if (mask & 2) fenceBox(verts, 7, b, 0, 9,  b + 3, 9,  "south")
				if (mask & 4) fenceBox(verts, 7, b, 7, 16, b + 3, 9,  "east")
				if (mask & 8) fenceBox(verts, 0, b, 7, 9,  b + 3, 9,  "west")
			}
			return {
				verts: verts,
				texVerts: [],
				cull: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 },
				size: 6,
				varients: [],
				rotate: false,
				flip: false
			}
		}
		for (let mask = 0; mask < 16; mask++) {
			shapes["fence" + mask] = buildFenceShape(mask)
		}

		// Doors share geometry with fences and cross blocks: each door half is a
		// 3px-thick panel sitting at one of the four edges of its block cell.
		// There are only four unique panels (north/south/east/west edge), and
		// both the closed and the open door are always one of those four boxes.
		function buildDoorShape(x0, y0, z0, x1, y1, z1) {
			return {
				verts: [
					[objectify(x0, y0, z0, x1 - x0, z1 - z0, 0, 0)],
					[objectify(x0, y1, z1, x1 - x0, z1 - z0, 0, 0)],
					[objectify(x1, y1, z1, x1 - x0, y1 - y0, 0, 0)],
					[objectify(x0, y1, z0, x1 - x0, y1 - y0, 0, 0)],
					[objectify(x1, y1, z0, z1 - z0, y1 - y0, 0, 0)],
					[objectify(x0, y1, z1, z1 - z0, y1 - y0, 0, 0)]
				],
				texVerts: [],
				cull: {
					top: 0,
					bottom: 0,
					north: 0,
					south: 0,
					east: 0,
					west: 0
				},
				size: 6,
				varients: [],
				rotate: false,
				flip: false
			}
		}
		shapes.doorNorth = buildDoorShape( 0, 0,  0, 16, 16, 3)
		shapes.doorSouth = buildDoorShape( 0, 0, 13, 16, 16, 16)
		shapes.doorWest  = buildDoorShape( 0, 0,  0, 3, 16, 16)
		shapes.doorEast  = buildDoorShape(13, 0,  0, 16, 16, 16)
		// Trapdoors are 3px slabs. Closed ones sit at the top or bottom of their
		// cell; open ones fold up against an edge (reusing the door panels).
		shapes.trapTop    = buildDoorShape( 0, 13,  0, 16, 16, 16)
		shapes.trapBottom = buildDoorShape( 0,  0,  0, 16,  3, 16)

		// Stair corner models. A straight stair is a full lower step plus an
		// upper half-step at the back of the cell. A perpendicular stair beside
		// it turns that upper step into an L (inner corner) or shrinks it to the
		// quarter nearest the neighbour (outer corner), which is what makes two
		// flights meet cleanly at a right angle. `side` is +1 when the bend is
		// on the right of the stair's high side (east for a north-facing stair)
		// and -1 when it is on the left.
		function buildStairCorner(inner, side) {
			let verts = [ [], [], [], [], [], [] ]
			function face(f, x0, y0, z0, x1, y1, z1) {
				if (f === 0) verts[0].push(objectify(x0, y0, z0, x1 - x0, z1 - z0, 0, 0))
				else if (f === 1) verts[1].push(objectify(x0, y1, z1, x1 - x0, z1 - z0, 0, 0))
				else if (f === 2) verts[2].push(objectify(x1, y1, z1, x1 - x0, y1 - y0, 0, 0))
				else if (f === 3) verts[3].push(objectify(x0, y1, z0, x1 - x0, y1 - y0, 0, 0))
				else if (f === 4) verts[4].push(objectify(x1, y1, z0, z1 - z0, y1 - y0, 0, 0))
				else verts[5].push(objectify(x0, y1, z1, z1 - z0, y1 - y0, 0, 0))
			}
			let sx0 = side > 0 ? 8 : 0
			let sx1 = side > 0 ? 16 : 8
			// Full lower step.
			for (let f = 0; f < 6; f++) face(f, 0, 0, 0, 16, 8, 16)
			if (inner) {
				// Upper step spans the back of the cell and wraps into an L.
				face(1, 0, 8, 8, 16, 16, 16)
				face(2, 0, 8, 8, 16, 16, 16)
				face(4, 0, 8, 8, 16, 16, 16)
				face(5, 0, 8, 8, 16, 16, 16)
				// Only the half of the riser the wrap does not cover.
				if (side > 0) face(3, 0, 8, 8, 8, 16, 8)
				else face(3, 8, 8, 8, 16, 16, 8)
				face(1, sx0, 8, 0, sx1, 16, 8)
				face(3, sx0, 8, 0, sx1, 16, 8)
				face(5, sx0, 8, 0, sx0, 16, 8)
				face(4, sx1, 8, 0, sx1, 16, 8)
			} else {
				// Upper step shrinks to the quarter nearest the neighbour.
				face(1, sx0, 8, 8, sx1, 16, 16)
				face(2, sx0, 8, 8, sx1, 16, 16)
				face(3, sx0, 8, 8, sx1, 16, 16)
				face(5, sx0, 8, 8, sx0, 16, 16)
				face(4, sx1, 8, 8, sx1, 16, 16)
			}
			let count = 0
			for (let f of verts) count += f.length
			return {
				verts: verts,
				texVerts: [],
				cull: { top: 0, bottom: 3, north: 0, south: 0, east: 0, west: 0 },
				size: count,
				varients: [],
				rotate: false,
				flip: false
			}
		}
		shapes.stairInnerRight = buildStairCorner(true, 1)
		shapes.stairInnerLeft = buildStairCorner(true, -1)
		shapes.stairOuterRight = buildStairCorner(false, 1)
		shapes.stairOuterLeft = buildStairCorner(false, -1)

		for (let shape in shapes) {
			let obj = shapes[shape]
			let verts = obj.verts
			
			if (obj.custom) {
				// Cross-shaped blocks: two full-block diagonal planes, each
				// drawn front and back so the plant is visible from any angle.
				let s = 0.5
				const A  = [ -s, -s, -s ], B  = [  s, -s,  s ], C  = [  s,  s,  s ], D  = [ -s,  s, -s ]
				const A2 = [  s, -s, -s ], B2 = [ -s, -s,  s ], C2 = [ -s,  s,  s ], D2 = [  s,  s, -s ]
				let uv = [ ATLAS_SCALE, ATLAS_SCALE, 0, ATLAS_SCALE, 0, 0, ATLAS_SCALE, 0 ]
				// The back-facing quad reverses the winding, so its UV list is
				// reversed in lockstep. Every corner then keeps the sprite point
				// it has on the front and the plant stays upright from behind;
				// reusing the front UVs rotates the sprite 180 degrees instead.
				let uvR = [ uv[6], uv[7], uv[4], uv[5], uv[2], uv[3], uv[0], uv[1] ]
				let q1  = makeQuad(A,  B,  C,  D)
				let q1r = makeQuad(D,  C,  B,  A)
				let q2  = makeQuad(A2, B2, C2, D2)
				let q2r = makeQuad(D2, C2, B2, A2)
				obj.verts = [ [], [], [ q1 ], [ q1r ], [ q2 ], [ q2r ] ]
				obj.texVerts = [ [], [], [ uv.slice() ], [ uvR.slice() ], [ uv.slice() ], [ uvR.slice() ] ]
				verts = obj.verts
			} else {
				// Populate the vertex coordinates
				for (let i = 0; i < verts.length; i++) {
					let side = verts[i]
					let texArr = []
					obj.texVerts.push(texArr)
					for (let j = 0; j < side.length; j++) {
						let face = side[j]
						let mapped = mapCoords(face, i)
						side[j] = mapped.pos
						texArr.push(mapped.tex)
					}
				}
			}

			if (obj.rotate) {
				let v = obj.varients
				let east = rotate(obj)
				let south = rotate(east)
				let west = rotate(south)
				v[0] = obj
				v[2] = south
				v[4] = east
				v[6] = west
			}
			if (obj.flip) {
				let v = obj.varients
				v[1] = flip(obj)
				if (obj.rotate) {
					v[3] = flip(v[2])
					v[5] = flip(v[4])
					v[7] = flip(v[6])
				}
			}

			obj.buffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, obj.buffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts.flat(2)), gl.STATIC_DRAW)
		}

		// Give every straight stair variant the four corner shapes that share
		// its rotation and half. Mesh generation picks one of these when a
		// perpendicular stair touches the block (see chunk.js).
		{
			let baseCorners = [ shapes.stairInnerRight, shapes.stairInnerLeft, shapes.stairOuterRight, shapes.stairOuterLeft ]
			let oriented = baseCorners.map(function(base) {
				let out = []
				let east = rotate(base)
				let south = rotate(east)
				let west = rotate(south)
				out[0] = base
				out[4] = east
				out[2] = south
				out[6] = west
				out[1] = flip(base)
				out[5] = flip(east)
				out[3] = flip(south)
				out[7] = flip(west)
				return out
			})
			let variants = shapes.stair.varients
			for (let j = 0; j < 8; j++) {
				if (!variants[j]) continue
				variants[j].corners = oriented.map(function(v) { return v[j] })
			}
		}

		// Signs are thin boards, not cubes. The geometry and UV slices follow
		// the vanilla 26.3 templates (template_sign, template_wall_sign,
		// template_hanging_sign, template_wall_hanging_sign), so the 32x32 sign
		// sprite is split across the board faces and edges. Textures are added
		// to the atlas at 16x16, so model UVs stay in 0..16 units.
		function newSignShape() {
			return {
				verts: [ [], [], [], [], [], [] ],
				texVerts: [ [], [], [], [], [], [] ],
				cull: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 },
				size: 6,
				varients: [],
				rotate: false,
				flip: false,
				noCollide: true
			}
		}
		function signQuad(shape, face, points, uv) {
			let scale = ATLAS_SCALE / 16
			let flat = []
			for (let i = 0; i < 4; i++) {
				flat.push(points[i][0] / 16 - 0.5, points[i][1] / 16 - 0.5, points[i][2] / 16 - 0.5)
			}
			let tex = [ uv[2], uv[1], uv[0], uv[1], uv[0], uv[3], uv[2], uv[3] ].map(function(c) { return c * scale })
			shape.verts[face].push(flat)
			shape.texVerts[face].push(tex)
		}
		function signBox(shape, x0, y0, z0, x1, y1, z1, uv) {
			let pick = function(name) { return Array.isArray(uv) ? uv : uv[name] }
			let faces = [
				[ 0, [ [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1] ], "down" ],
				[ 1, [ [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [x0,y1,z0] ], "up" ],
				[ 2, [ [x1,y1,z1], [x0,y1,z1], [x0,y0,z1], [x1,y0,z1] ], "north" ],
				[ 3, [ [x0,y1,z0], [x1,y1,z0], [x1,y0,z0], [x0,y0,z0] ], "south" ],
				[ 4, [ [x1,y1,z0], [x1,y1,z1], [x1,y0,z1], [x1,y0,z0] ], "east" ],
				[ 5, [ [x0,y1,z1], [x0,y1,z0], [x0,y0,z0], [x0,y0,z1] ], "west" ],
			]
			for (let face of faces) {
				let faceUv = pick(face[2])
				if (faceUv) signQuad(shape, face[0], face[1], faceUv)
			}
		}
		let signStanding = newSignShape()
		signBox(signStanding, 7.3333, 0, 7.3333, 8.6667, 9.3333, 8.6667, {
			north: [14, 8, 15, 15], south: [14, 0, 15, 7],
			east: [15, 0, 16, 7], west: [15, 8, 16, 15],
			down: [14, 15, 15, 16], up: [14, 0, 15, 1]
		})
		signBox(signStanding, 0, 9.3333, 7.3333, 16, 17.3333, 8.6667, {
			north: [0, 8, 12, 14], south: [0, 1, 12, 7],
			east: [12, 1, 13, 7], west: [12, 8, 13, 14],
			up: [0, 0, 12, 1], down: [0, 14, 12, 15]
		})
		// Sign state bits select one of four yaw rotations. Wall signs already
		// build these below; standing and hanging signs need the same treatment
		// so a sign placed on the ground can face the player instead of always
		// pointing north.
		function signRotations(shape) {
			let east = rotate(shape)
			let south = rotate(east)
			let west = rotate(south)
			east.rotate = south.rotate = west.rotate = false
			east.noCollide = south.noCollide = west.noCollide = true
			return [ shape, south, east, west ]
		}
		shapes.signStanding = signRotations(signStanding)

		let signWall = newSignShape()
		signBox(signWall, 0, 4.3333, 0.3333, 16, 12.3333, 1.6667, {
			north: [0, 1, 12, 7], south: [0, 8, 12, 14],
			east: [12, 1, 13, 7], west: [12, 8, 13, 14],
			up: [0, 0, 12, 1], down: [0, 14, 12, 15]
		})
		let signWallEast = rotate(signWall)
		let signWallSouth = rotate(signWallEast)
		let signWallWest = rotate(signWallSouth)
		signWallEast.rotate = signWallSouth.rotate = signWallWest.rotate = false
		signWallEast.noCollide = signWallSouth.noCollide = signWallWest.noCollide = true
		shapes.signWall = [ signWall, signWallSouth, signWallEast, signWallWest ]

		let hangingBoard = {
			north: [9, 8, 16, 13], south: [1, 8, 8, 13],
			east: [8, 8, 9, 13], west: [0, 8, 1, 13],
			up: [1, 7, 8, 8], down: [1, 13, 8, 14]
		}
		let chainUv = [11, 3.5, 12.5, 6.5]
		let signHanging = newSignShape()
		signBox(signHanging, 1, 0, 7, 15, 10, 9, hangingBoard)
		signBox(signHanging, 2, 10, 7.6, 3.2, 16, 8.4, chainUv)
		signBox(signHanging, 12.8, 10, 7.6, 14, 16, 8.4, chainUv)
		shapes.signHanging = signRotations(signHanging)

		let signWallHanging = newSignShape()
		signBox(signWallHanging, 1, 0, 7, 15, 10, 9, hangingBoard)
		signBox(signWallHanging, 0, 14, 6, 16, 16, 10, {
			north: [0, 3.5, 8, 4.5], south: [0, 2, 8, 3],
			east: [8, 2, 10, 3], west: [8, 3.5, 10, 4.5],
			up: [0, 0, 8, 2], down: [8, 4.5, 0, 6.5]
		})
		signBox(signWallHanging, 2, 10, 7.6, 3.2, 14, 8.4, chainUv)
		signBox(signWallHanging, 12.8, 10, 7.6, 14, 14, 8.4, chainUv)
		let wallHangEast = rotate(signWallHanging)
		let wallHangSouth = rotate(wallHangEast)
		let wallHangWest = rotate(wallHangSouth)
		wallHangEast.rotate = wallHangSouth.rotate = wallHangWest.rotate = false
		wallHangEast.noCollide = wallHangSouth.noCollide = wallHangWest.noCollide = true
		shapes.signWallHanging = [ signWallHanging, wallHangSouth, wallHangEast, wallHangWest ]

		// Baked 26.3 block models. Each face carries its own texture name and
		// UV rectangle, so beds, candles, dripleaves, shelves and other partial
		// blocks render their real geometry instead of a textured cube.
		let modelShapes = {}
		const MODEL_GROUPS = { d: 0, u: 1, n: 2, s: 3, e: 4, w: 5 }
		function buildModelShape(model) {
			let shape = newSignShape()
			shape.noCollide = false
			shape.faceTextures = [ [], [], [], [], [], [] ]
			let faceCount = 0
			let scale = ATLAS_SCALE / 16
			for (let element of model.e) {
				for (let key in element.faces) {
					let face = element.faces[key]
					let group = MODEL_GROUPS[key]
					if (group === undefined) continue
					let points = face[6]
					let verts = []
					for (let point of points) {
						verts.push(point[0] / 16 - 0.5, point[1] / 16 - 0.5, point[2] / 16 - 0.5)
					}
					let corners = [ [face[1], face[2]], [face[3], face[2]], [face[3], face[4]], [face[1], face[4]] ]
					let rotation = ((face[5] || 0) % 360 + 360) % 360
					while (rotation >= 90) {
						corners.unshift(corners.pop())
						rotation -= 90
					}
					let uvs = []
					for (let corner of corners) uvs.push(corner[0] * scale, corner[1] * scale)
					shape.verts[group].push(verts)
					shape.texVerts[group].push(uvs)
					shape.faceTextures[group].push(face[0])
					faceCount++
				}
			}
			shape.size = faceCount
			return shape
		}

		// The brewing stand blockstate layers three always-present bottle
		// holders (brewing_stand_empty0/1/2) onto the base model. The generated
		// table only keeps the unconditional brewing_stand part, so add the
		// exact 26.3 planes here. They are full-height, double-sided fins that
		// give the stand its bottle-holding spouts.
		function addBrewingStandFins(shape) {
			let scale = ATLAS_SCALE / 16
			let fins = [
				{ angle: 0, from: 8, to: 16, north: [16, 0, 8, 16], south: [8, 0, 16, 16] },
				{ angle: -45, from: -0.41, to: 7.59, north: [8, 0, 16, 16], south: [16, 0, 8, 16] },
				{ angle: 45, from: -0.41, to: 7.59, north: [8, 0, 16, 16], south: [16, 0, 8, 16] },
			]
			function rotateFin(point, angle) {
				if (!angle) return point
				let radians = angle * Math.PI / 180
				let cos = Math.cos(radians), sin = Math.sin(radians)
				let dx = point[0] - 8, dz = point[2] - 8
				return [ 8 + dx * cos + dz * sin, point[1], 8 - dx * sin + dz * cos ]
			}
			function addFinFace(group, points, uv, angle) {
				let verts = []
				for (let point of points) {
					point = rotateFin(point, angle)
					verts.push(point[0] / 16 - 0.5, point[1] / 16 - 0.5, point[2] / 16 - 0.5)
				}
				let corners = [ [uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]] ]
				let tex = []
				for (let corner of corners) tex.push(corner[0] * scale, corner[1] * scale)
				shape.verts[group].push(verts)
				shape.texVerts[group].push(tex)
				shape.faceTextures[group].push("brewingStand")
				shape.size++
			}
			for (let fin of fins) {
				// These point orders match facePoints() in genVanillaModels.mjs.
				addFinFace(2, [
					[ fin.to, 16, 8 ], [ fin.from, 16, 8 ],
					[ fin.from, 0, 8 ], [ fin.to, 0, 8 ],
				], fin.north, fin.angle)
				addFinFace(3, [
					[ fin.from, 16, 8 ], [ fin.to, 16, 8 ],
					[ fin.to, 0, 8 ], [ fin.from, 0, 8 ],
				], fin.south, fin.angle)
			}
		}

		// Entity-rendered blocks have no model JSON, but their full cube is just
		// as wrong as a flat sprite wrapped around six faces. Build a real box
		// from the block's existing sprite instead.
		let fullFaceUV = { down: [0,0,16,16], up: [0,0,16,16], north: [0,0,16,16], south: [0,0,16,16], east: [0,0,16,16], west: [0,0,16,16] }
		function buildBannerShape(wall) {
			let shape = newSignShape()
			// Banners are decorative and do not collide with entities in vanilla.
			shape.noCollide = true
			if (!wall) signBox(shape, 7.5, 0, 7.5, 8.5, 16, 8.5, fullFaceUV)
			signBox(shape, 1, 4, wall ? 0.5 : 7.5, 15, 16, wall ? 1.5 : 8.5, fullFaceUV)
			return shape
		}
		shapes.bannerStanding = buildBannerShape(false)
		shapes.bannerWall = buildBannerShape(true)
		function buildHeadShape(wall) {
			let shape = newSignShape()
			// Heads are decorative and do not collide with entities in vanilla.
			shape.noCollide = true
			if (wall) signBox(shape, 4, 4, 0, 12, 12, 8, fullFaceUV)
			else signBox(shape, 4, 0, 4, 12, 8, 12, fullFaceUV)
			return shape
		}
		shapes.head = buildHeadShape(false)
		shapes.headWall = buildHeadShape(true)
		function buildBoxShape(x0, y0, z0, x1, y1, z1) {
			let shape = newSignShape()
			shape.noCollide = false
			signBox(shape, x0, y0, z0, x1, y1, z1, fullFaceUV)
			return shape
		}
		shapes.chest = buildBoxShape(1, 0, 1, 15, 14, 15)
		shapes.chestCollision = finalizeShape(buildDoorShape(1, 0, 1, 15, 14, 15))
		shapes.pot = buildBoxShape(2, 0, 2, 14, 16, 14)
		shapes.conduit = buildBoxShape(4, 4, 4, 12, 12, 12)
		// These render shapes contain raw quads, so give the solid blocks a
		// separate bounds-bearing hitbox for collision and ray tracing.
		shapes.potCollision = finalizeShape(buildDoorShape(2, 0, 2, 14, 16, 14))
		shapes.conduitCollision = finalizeShape(buildDoorShape(4, 4, 4, 12, 12, 12))

		// Lanterns use the 26.3 template_lantern models: a 6x7x6 body, a
		// smaller 4x2 cap, and a crossed 45-degree handle above the cap. The
		// hanging variant moves the body down one pixel and stretches the handle
		// up to the ceiling. Both variants are thin geometry, not full cubes.
		function lanternRing(shape, aBottom, aTop, bBottom, bTop) {
			let offset = 1.5 * Math.SQRT1_2
			let x0 = 8 - offset
			let x1 = 8 + offset
			function ringPlane(points, uv, frontFace, backFace) {
				signQuad(shape, frontFace, points, uv)
				signQuad(shape, backFace, points.slice().reverse(), uv)
			}
			ringPlane([
				[ x0, aTop, x1 ], [ x1, aTop, x0 ],
				[ x1, aBottom, x0 ], [ x0, aBottom, x1 ],
			], [ 11, 1, 14, 5 ], 2, 3)
			ringPlane([
				[ x0, bTop, x0 ], [ x1, bTop, x1 ],
				[ x1, bBottom, x1 ], [ x0, bBottom, x0 ],
			], [ 11, 6, 14, 12 ], 4, 5)
		}
		function buildLanternShape(hanging) {
			let shape = newSignShape()
			shape.noCollide = false
			let bodyY = hanging ? 1 : 0
			let capY = bodyY + 7
			signBox(shape, 5, bodyY, 5, 11, capY, 11, {
				down: [ 0, 9, 6, 15 ], up: [ 0, 9, 6, 15 ],
				north: [ 0, 2, 6, 9 ], south: [ 0, 2, 6, 9 ],
				east: [ 0, 2, 6, 9 ], west: [ 0, 2, 6, 9 ],
			})
			// The cap has no bottom face in vanilla; the body's top closes it.
			signBox(shape, 6, capY, 6, 10, capY + 2, 10, {
				up: [ 1, 10, 5, 14 ],
				north: [ 1, 0, 5, 2 ], south: [ 1, 0, 5, 2 ],
				east: [ 1, 0, 5, 2 ], west: [ 1, 0, 5, 2 ],
			})
			if (hanging) lanternRing(shape, 11, 15, 10, 16)
			else lanternRing(shape, 9, 11, 9, 11)
			return shape
		}
		shapes.lantern = buildLanternShape(false)
		shapes.lanternHanging = buildLanternShape(true)
		shapes.lanternCollision = finalizeShape(buildDoorShape(5, 0, 5, 11, 7, 11))
		shapes.lanternHangingCollision = finalizeShape(buildDoorShape(5, 1, 5, 11, 8, 11))

		// Anvils are not cubes. The 26.3 template has a base, a narrow waist,
		// a wider body and a full-depth top plate. Vanilla crops and rotates
		// the body/top UVs differently on every face, so the face rotations
		// are applied by rotating the four texture corners around the face.
		function signQuadRot(shape, face, points, uv, rotation) {
			let scale = ATLAS_SCALE / 16
			let u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3]
			let corners = [ [u1, v0], [u0, v0], [u0, v1], [u1, v1] ]
			if (rotation === 90) corners = [ corners[1], corners[2], corners[3], corners[0] ]
			else if (rotation === 180) corners = [ corners[2], corners[3], corners[0], corners[1] ]
			else if (rotation === 270) corners = [ corners[3], corners[0], corners[1], corners[2] ]
			let flat = []
			for (let i = 0; i < 4; i++) {
				flat.push(points[i][0] / 16 - 0.5, points[i][1] / 16 - 0.5, points[i][2] / 16 - 0.5)
			}
			let tex = []
			for (let i = 0; i < 4; i++) {
				tex.push(corners[i][0] * scale, corners[i][1] * scale)
			}
			shape.verts[face].push(flat)
			shape.texVerts[face].push(tex)
		}
		function signBoxRot(shape, x0, y0, z0, x1, y1, z1, faces) {
			let points = {
				down: [ [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1] ],
				up: [ [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [x0,y1,z0] ],
				north: [ [x1,y1,z1], [x0,y1,z1], [x0,y0,z1], [x1,y0,z1] ],
				south: [ [x0,y1,z0], [x1,y1,z0], [x1,y0,z0], [x0,y0,z0] ],
				east: [ [x1,y1,z0], [x1,y1,z1], [x1,y0,z1], [x1,y0,z0] ],
				west: [ [x0,y1,z1], [x0,y1,z0], [x0,y0,z0], [x0,y0,z1] ]
			}
			let groups = { down: 0, up: 1, north: 2, south: 3, east: 4, west: 5 }
			for (let name in faces) {
				let face = faces[name]
				if (!face) continue
				signQuadRot(shape, groups[name], points[name], face.uv, face.rot || 0)
			}
		}
		let anvil = newSignShape()
		anvil.noCollide = false
		signBoxRot(anvil, 2, 0, 2, 14, 4, 14, {
			down: { uv: [2, 2, 14, 14], rot: 180 },
			up: { uv: [2, 2, 14, 14], rot: 180 },
			north: { uv: [2, 12, 14, 16] },
			south: { uv: [2, 12, 14, 16] },
			west: { uv: [0, 2, 4, 14], rot: 90 },
			east: { uv: [4, 2, 0, 14], rot: 270 }
		})
		signBoxRot(anvil, 4, 4, 3, 12, 5, 13, {
			up: { uv: [4, 3, 12, 13], rot: 180 },
			north: { uv: [4, 11, 12, 12] },
			south: { uv: [4, 11, 12, 12] },
			west: { uv: [4, 3, 5, 13], rot: 90 },
			east: { uv: [5, 3, 4, 13], rot: 270 }
		})
		signBoxRot(anvil, 6, 5, 4, 10, 10, 12, {
			north: { uv: [6, 6, 10, 11] },
			south: { uv: [6, 6, 10, 11] },
			west: { uv: [5, 4, 10, 12], rot: 90 },
			east: { uv: [10, 4, 5, 12], rot: 270 }
		})
		signBoxRot(anvil, 3, 10, 0, 13, 16, 16, {
			down: { uv: [3, 0, 13, 16], rot: 180 },
			up: { uv: [3, 0, 13, 16], rot: 180 },
			north: { uv: [3, 0, 13, 6] },
			south: { uv: [3, 0, 13, 6] },
			west: { uv: [10, 0, 16, 16], rot: 90 },
			east: { uv: [16, 0, 10, 16], rot: 270 }
		})
		let anvilEast = rotate(anvil)
		let anvilSouth = rotate(anvilEast)
		let anvilWest = rotate(anvilSouth)
		anvilEast.rotate = anvilSouth.rotate = anvilWest.rotate = false
		anvilEast.noCollide = anvilSouth.noCollide = anvilWest.noCollide = false
		// Only the top plate's up face uses #top; every other face, including
		// the base ring and the overhanging underside, uses the opaque body
		// texture. The top sprite has transparent margins, so applying it to
		// every upward face let the world show through around the waist.
		// Groups are down/up/north/south/east/west; face order within a group
		// is base, lower waist, body, top plate.
		shapes.anvil = [ anvil, anvilSouth, anvilEast, anvilWest ]
		let anvilTextureSlots = [
			[ 1, 1 ],           // base underside, top plate underside
			[ 1, 1, 0 ],        // base up, waist up, top plate up
			[ 1, 1, 1, 1 ],     // north faces
			[ 1, 1, 1, 1 ],     // south faces
			[ 1, 1, 1, 1 ],     // east faces
			[ 1, 1, 1, 1 ]      // west faces
		]
		for (let shape of shapes.anvil) shape.faceTextureSlots = anvilTextureSlots

		// Sculk blocks are not cubes. Their sprites are mostly transparent by
		// design (the sensor's side sprite has a clear upper half and the vein
		// is a cut-out), so the generic cube fallback read as a clear box with
		// a faint outline. These builders follow the 26.3 sculk_sensor,
		// calibrated_sculk_sensor, template_sculk_shrieker and sculk_vein
		// models: an 8px plinth with thin geometry above it, and a single sheet
		// for the vein. No shape fills a cell, so every cull mask stays zero
		// and neighbouring blocks keep their own faces.
		function sculkRotateY(point, originX, originZ, degrees) {
			let angle = degrees * Math.PI / 180
			let cos = Math.cos(angle), sin = Math.sin(angle)
			let dx = point[0] - originX
			let dz = point[2] - originZ
			return [ originX + dx * cos - dz * sin, point[1], originZ + dx * sin + dz * cos ]
		}
		// One sensor tendril: a zero-thickness plane spun 45 degrees around a
		// corner, drawn front and back so it stays visible from both sides.
		function sculkTendril(shape, t) {
			let north = [
				[ t.x1, 16, t.z ], [ t.x0, 16, t.z ],
				[ t.x0, 8, t.z ], [ t.x1, 8, t.z ],
			].map(function(p) { return sculkRotateY(p, t.originX, t.z, t.angle) })
			let south = [
				[ t.x0, 16, t.z ], [ t.x1, 16, t.z ],
				[ t.x1, 8, t.z ], [ t.x0, 8, t.z ],
			].map(function(p) { return sculkRotateY(p, t.originX, t.z, t.angle) })
			signQuad(shape, 2, north, t.uvNorth)
			signQuad(shape, 3, south, t.uvSouth)
		}
		// A calibrated-sensor amethyst blade: a vertical sheet rising 4px above
		// the block, drawn from both sides.
		function sculkBlade(shape, group, ax, az, bx, bz) {
			let uv = [ 0, 4, 16, 16 ]
			signQuad(shape, group,
				[ [ bx, 20, bz ], [ ax, 20, az ], [ ax, 8, az ], [ bx, 8, bz ] ], uv)
			signQuad(shape, group,
				[ [ ax, 20, az ], [ bx, 20, bz ], [ bx, 8, bz ], [ ax, 8, az ] ], uv)
		}
		function buildSculkSensorShape(amethyst) {
			let shape = newSignShape()
			shape.noCollide = false
			// Six plinth faces, four tendrils (two quads each) and, for the
			// calibrated sensor, two blades (two quads each).
			shape.size = amethyst ? 18 : 14
			signBoxRot(shape, 0, 0, 0, 16, 8, 16, {
				down: { uv: [ 0, 0, 16, 16 ] },
				up: { uv: [ 0, 0, 16, 16 ] },
				north: { uv: [ 0, 8, 16, 16 ] },
				east: { uv: [ 0, 8, 16, 16 ] },
				west: { uv: [ 0, 8, 16, 16 ] },
			})
			// There is one atlas tile per face slot, so the calibrated sensor
			// folds its south plinth side into the north slot to free the south
			// slot for the amethyst blades.
			let southGroup = amethyst ? 2 : 3
			signQuad(shape, southGroup, [ [0,8,0], [16,8,0], [16,0,0], [0,0,0] ], [ 0, 8, 16, 16 ])
			let tendrils = [
				{ x0: -1, x1: 7, z: 3, originX: 3, angle: 45, uvNorth: [ 4, 8, 12, 16 ], uvSouth: [ 12, 8, 4, 16 ] },
				{ x0: 9, x1: 17, z: 3, originX: 13, angle: -45, uvNorth: [ 12, 8, 4, 16 ], uvSouth: [ 4, 8, 12, 16 ] },
				{ x0: 9, x1: 17, z: 13, originX: 13, angle: 45, uvNorth: [ 12, 8, 4, 16 ], uvSouth: [ 4, 8, 12, 16 ] },
				{ x0: -1, x1: 7, z: 13, originX: 3, angle: -45, uvNorth: [ 4, 8, 12, 16 ], uvSouth: [ 12, 8, 4, 16 ] },
			]
			for (let t of tendrils) sculkTendril(shape, t)
			if (amethyst) {
				// Rotating vanilla's two 16px planes 45 degrees about the cell
				// centre leaves two crossed blades over the plinth.
				let low = 8 - 8 * Math.SQRT1_2
				let high = 8 + 8 * Math.SQRT1_2
				sculkBlade(shape, 3, low, low, high, high)
				sculkBlade(shape, 3, low, high, high, low)
			}
			return shape
		}
		shapes.sculkSensor = buildSculkSensorShape(false)
		shapes.calibratedSculkSensor = [ buildSculkSensorShape(true) ]
		shapes.calibratedSculkSensor[1] = rotate(shapes.calibratedSculkSensor[0])
		shapes.calibratedSculkSensor[2] = rotate(shapes.calibratedSculkSensor[1])
		shapes.calibratedSculkSensor[3] = rotate(shapes.calibratedSculkSensor[2])
		for (let i = 1; i < 4; i++) {
			shapes.calibratedSculkSensor[i].rotate = false
			shapes.calibratedSculkSensor[i].noCollide = false
		}
		// rotate() walks north, east, south, west while states are stored
		// north, south, east, west.
		shapes.calibratedSculkSensor = [
			shapes.calibratedSculkSensor[0], shapes.calibratedSculkSensor[2],
			shapes.calibratedSculkSensor[1], shapes.calibratedSculkSensor[3]
		]
		let calibratedSculkTex = [
			"calibratedSculkSensorTop", "sculkSensorBottom", "sculkSensorSide",
			"calibratedSculkSensorAmethyst", "sculkSensorSide", "sculkSensorSide"
		]
		shapes.calibratedSculkSensorTex = [ calibratedSculkTex ]
		for (let i = 1; i < 4; i++) {
			shapes.calibratedSculkSensorTex.push(bedTextureRotate(shapes.calibratedSculkSensorTex[i - 1]))
		}
		shapes.calibratedSculkSensorTex = [
			shapes.calibratedSculkSensorTex[0], shapes.calibratedSculkSensorTex[2],
			shapes.calibratedSculkSensorTex[1], shapes.calibratedSculkSensorTex[3]
		]

		function buildSculkShriekerShape() {
			let shape = newSignShape()
			shape.noCollide = false
			shape.size = 11
			// 26.3 template_sculk_shrieker: a full-footprint 8px slab plus a
			// 14x14x7 collar. The collar has no bottom face; its inset leaves
			// the slab's top rim visible around it.
			signBoxRot(shape, 0, 0, 0, 16, 8, 16, {
				down: { uv: [ 0, 0, 16, 16 ] },
				up: { uv: [ 0, 0, 16, 16 ] },
				north: { uv: [ 0, 8, 16, 16 ] },
				south: { uv: [ 0, 8, 16, 16 ] },
				east: { uv: [ 0, 8, 16, 16 ] },
				west: { uv: [ 0, 8, 16, 16 ] },
			})
			signBoxRot(shape, 1, 8, 1, 15, 15, 15, {
				up: { uv: [ 1, 1, 15, 15 ] },
				north: { uv: [ 1, 1, 15, 8 ] },
				south: { uv: [ 1, 1, 15, 8 ] },
				east: { uv: [ 1, 1, 15, 8 ] },
				west: { uv: [ 1, 1, 15, 8 ] },
			})
			return shape
		}
		shapes.sculkShrieker = buildSculkShriekerShape()

		function buildSculkVeinShape() {
			let shape = newSignShape()
			shape.size = 2
			// The 26.3 vein model is one sheet 0.1px off the block face. This
			// engine has no per-face attachment state, so the sheet sits on the
			// north (+z) face, where a wall-mounted vein lands.
			signQuad(shape, 2, [ [16,16,15.9], [0,16,15.9], [0,0,15.9], [16,0,15.9] ], [ 0, 0, 16, 16 ])
			signQuad(shape, 3, [ [0,16,15.9], [16,16,15.9], [16,0,15.9], [0,0,15.9] ], [ 16, 0, 0, 16 ])
			return shape
		}
		shapes.sculkVein = buildSculkVeinShape()

		// Cake is a 14x8x14 box, not a cube. The 26.3 model puts the top sprite
		// on the cut surface and the side sprite on the four walls, so the cube
		// fallback wrapped one continuous shell around the whole cell.
		function buildCakeShape() {
			let shape = newSignShape()
			shape.noCollide = false
			shape.size = 6
			signBoxRot(shape, 1, 0, 1, 15, 8, 15, {
				down: { uv: [ 0, 0, 16, 16 ] },
				up: { uv: [ 0, 0, 16, 16 ] },
				north: { uv: [ 0, 0, 16, 16 ] },
				south: { uv: [ 0, 0, 16, 16 ] },
				east: { uv: [ 0, 0, 16, 16 ] },
				west: { uv: [ 0, 0, 16, 16 ] },
			})
			return shape
		}
		shapes.cake = buildCakeShape()
		// The cake only fills 14 of its 16 pixels, so a slab-sized hitbox would
		// let the player stand on the empty one-pixel ledge around it.
		shapes.cakeCollision = finalizeShape(buildDoorShape(1, 0, 1, 15, 8, 15))

		// Shapes built after the main pass (fluids, flats) still hold raw
		// objectify() rectangles. Map them into vertex/UV arrays like the rest.
		function finalizeShape(obj) {
			let verts = obj.verts
			for (let i = 0; i < verts.length; i++) {
				let side = verts[i]
				let texArr = []
				obj.texVerts.push(texArr)
				for (let j = 0; j < side.length; j++) {
					let mapped = mapCoords(side[j], i)
					side[j] = mapped.pos
					texArr.push(mapped.tex)
				}
			}
			obj.buffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, obj.buffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts.flat(2)), gl.STATIC_DRAW)
			return obj
		}

		// Torches are small glowing posts. They either stand on the block below
		// or hang from the block above (flame pointing down). Vanilla uses one
		// 2x10x2 box whose sides sample the middle 2px of the torch sprite.
		// Every face is drawn double-sided so the culled back face never hides
		// the torch.
		function pushTorchBox(verts, texVerts, x0, y0, z0, x1, y1, z1, hanging) {
			let cv = (x, y, z) => [ x / 16 - 0.5, y / 16 - 0.5, z / 16 - 0.5 ]
			let scale = ATLAS_SCALE / 16
			// Vanilla's side faces use columns 7..9 and rows 6..16 of
			// the torch sprite; rows 6..8 are the flame, 13..15 the stick cap.
			let u0 = 7 * scale, u1 = 9 * scale
			let vTop = (hanging ? 16 : 6) * scale
			let vBottom = (hanging ? 6 : 16) * scale
			let capTop = (hanging ? 13 : 6) * scale
			let capBottom = (hanging ? 6 : 13) * scale
			let faces = [
				[ 0, [ [x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0] ],
					[ u0,capTop, u0,capTop + 2 * scale, u1,capTop + 2 * scale, u1,capTop ] ], // top
				[ 1, [ [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1] ],
					[ u0,capBottom, u1,capBottom, u1,capBottom + 2 * scale, u0,capBottom + 2 * scale ] ], // bottom
				[ 2, [ [x0,y0,z0], [x0,y1,z0], [x1,y1,z0], [x1,y0,z0] ],
					[ u0,vBottom, u0,vTop, u1,vTop, u1,vBottom ] ], // north
				[ 3, [ [x1,y0,z1], [x1,y1,z1], [x0,y1,z1], [x0,y0,z1] ],
					[ u0,vBottom, u0,vTop, u1,vTop, u1,vBottom ] ], // south
				[ 4, [ [x1,y0,z0], [x1,y0,z1], [x1,y1,z1], [x1,y1,z0] ],
					[ u0,vBottom, u0,vTop, u1,vTop, u1,vBottom ] ], // east
				[ 5, [ [x0,y0,z1], [x0,y0,z0], [x0,y1,z0], [x0,y1,z1] ],
					[ u0,vBottom, u0,vTop, u1,vTop, u1,vBottom ] ]  // west
			]
			for (let f of faces) {
				let pts = f[1]
				let uv = f[2]
				let flat = pts.map(q => cv(q[0], q[1], q[2])).flat()
				let flatRev = pts.slice().reverse().map(q => cv(q[0], q[1], q[2])).flat()
				let uvRev = [ uv[6],uv[7], uv[4],uv[5], uv[2],uv[3], uv[0],uv[1] ]
				verts[f[0]].push(flat, flatRev)
				texVerts[f[0]].push(uv.slice(), uvRev)
			}
		}
		function buildTorchShape(hanging) {
			let verts = [ [], [], [], [], [], [] ]
			let texVerts = [ [], [], [], [], [], [] ]
			pushTorchBox(verts, texVerts, 7, hanging ? 6 : 0, 7, 9, hanging ? 16 : 10, 9, hanging)
			return {
				verts: verts,
				texVerts: texVerts,
				cull: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 },
				size: 6,
				varients: [],
				rotate: false,
				flip: false,
				noCollide: true
			}
		}
		shapes.torchUp = buildTorchShape(false)
		shapes.torchDown = buildTorchShape(true)

		// Fluids render as a box whose top surface sits at a height determined by
		// the fluid level (2..14px). The full-height source uses the same shape so
		// it can be non-solid like the flowing levels.
		function buildFluidShape(h) {
			return {
				verts: [
					[objectify( 0, 0,  0, 16, 16, 0, 0)], // bottom
					[objectify( 0, h, 16, 16, 16, 0, 0)], // top
					[objectify(16, h, 16, 16, h, 0, 0)],  // north
					[objectify( 0, h,  0, 16, h, 0, 0)],  // south
					[objectify(16, h,  0, 16, h, 0, 0)],  // east
					[objectify( 0, h, 16, 16, h, 0, 0)]   // west
				],
				texVerts: [],
				cull: { top: 0, bottom: 3, north: 1, south: 1, east: 1, west: 1 },
				size: 6,
				varients: [],
				rotate: false,
				flip: false,
				noCollide: true
			}
		}
		for (let h = 1; h <= 7; h++) {
			shapes["fluid" + h] = finalizeShape(buildFluidShape(h * 2))
		}
		shapes.fluidSource = finalizeShape(buildFluidShape(16))

		// Thin horizontal blocks (carpets, rails, pressure plates).
		function buildFlatShape(h) {
			return {
				verts: [
					[objectify( 0, 0,  0, 16, 16, 0, 0)], // bottom
					[objectify( 0, h, 16, 16, 16, 0, 0)], // top
					[objectify(16, h, 16, 16, h, 0, 0)],  // north
					[objectify( 0, h,  0, 16, h, 0, 0)],  // south
					[objectify(16, h,  0, 16, h, 0, 0)],  // east
					[objectify( 0, h, 16, 16, h, 0, 0)]   // west
				],
				texVerts: [],
				cull: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 },
				buffer: null,
				size: 6,
				varients: [],
				rotate: false,
				flip: false
			}
		}
		shapes.flat = finalizeShape(buildFlatShape(1))
		// Snow layers are two pixels tall. They cover the top of the block below,
		// but they must not cull the bottom face of a block above: that face sits
		// 14 pixels higher, so hiding it would open a hole under anything placed
		// on top of a snow layer.
		let snowLayerShape = buildFlatShape(2)
		snowLayerShape.cull = { top: 0, bottom: 3, north: 3, south: 3, east: 3, west: 3 }
		shapes.snowLayer = finalizeShape(snowLayerShape)

		// Beds follow the 26.3 template: a 6px mattress at y=3..9 with two 3px
		// legs at the head or foot end. The base state points north (head at
		// +z), and the other facings are produced by rotating both the geometry
		// and the six texture slots. rotate() moves UVs but not texture names,
		// so the texture array has to rotate with the shape as well.
		function bedTextureRotate(texs) {
			return [ texs[0], texs[1], texs[5], texs[4], texs[2], texs[3] ]
		}
		function buildBedHeadShape() {
			let shape = newSignShape()
			shape.size = 9
			shape.noCollide = false
			// 26.3 template_bed_head: the full mattress leaves its south side
			// open where the foot joins it, and both legs sit at the north end.
			signBoxRot(shape, 0, 3, 0, 16, 9, 16, {
				down: { uv: [ 0, 0, 16, 16 ] },
				up: { uv: [ 0, 0, 16, 16 ] },
				north: { uv: [ 0, 7, 16, 13 ] },
				west: { uv: [ 0, 7, 16, 13 ] },
				east: { uv: [ 0, 7, 16, 13 ] }
			})
			signBoxRot(shape, 0, 0, 0, 3, 3, 3, {
				down: { uv: [ 6, 13, 9, 16 ] },
				north: { uv: [ 13, 13, 16, 16 ] },
				south: { uv: [ 3, 13, 6, 16 ] },
				west: { uv: [ 0, 13, 3, 16 ] },
				east: { uv: [ 10, 13, 13, 16 ] }
			})
			signBoxRot(shape, 13, 0, 0, 16, 3, 3, {
				down: { uv: [ 7, 13, 10, 16 ] },
				north: { uv: [ 0, 13, 3, 16 ] },
				south: { uv: [ 10, 13, 13, 16 ] },
				west: { uv: [ 3, 13, 6, 16 ] },
				east: { uv: [ 13, 13, 16, 16 ] }
			})
			return shape
		}
		function buildBedFootShape() {
			let shape = newSignShape()
			shape.size = 9
			shape.noCollide = false
			// Mirror image of the head: the north side is the seam with the head,
			// so it stays open, and the legs sit at the south end.
			signBoxRot(shape, 0, 3, 0, 16, 9, 16, {
				down: { uv: [ 0, 0, 16, 16 ] },
				up: { uv: [ 0, 0, 16, 16 ] },
				south: { uv: [ 0, 7, 16, 13 ] },
				west: { uv: [ 0, 7, 16, 13 ] },
				east: { uv: [ 0, 7, 16, 13 ] }
			})
			signBoxRot(shape, 0, 0, 13, 3, 3, 16, {
				down: { uv: [ 7, 13, 10, 16 ] },
				north: { uv: [ 10, 13, 13, 16 ] },
				south: { uv: [ 0, 13, 3, 16 ] },
				west: { uv: [ 13, 13, 16, 16 ] },
				east: { uv: [ 3, 13, 6, 16 ] }
			})
			signBoxRot(shape, 13, 0, 13, 16, 3, 16, {
				down: { uv: [ 6, 13, 9, 16 ] },
				north: { uv: [ 3, 13, 6, 16 ] },
				south: { uv: [ 13, 13, 16, 16 ] },
				west: { uv: [ 10, 13, 13, 16 ] },
				east: { uv: [ 0, 13, 3, 16 ] }
			})
			return shape
		}
		let bedHeadShapes = [ buildBedHeadShape() ]
		let bedFootShapes = [ buildBedFootShape() ]
		let bedHeadTexs = [ [ "whiteBedHeadUp", "bedDown", "bedHeadNorth", "whiteBedHeadWest", "whiteBedHeadEast", "whiteBedHeadWest" ] ]
		let bedFootTexs = [ [ "whiteBedFootUp", "bedDown", "whiteBedFootWest", "whiteBedFootSouth", "whiteBedFootEast", "whiteBedFootWest" ] ]
		for (let i = 1; i < 4; i++) {
			bedHeadShapes.push(rotate(bedHeadShapes[i - 1]))
			bedFootShapes.push(rotate(bedFootShapes[i - 1]))
			bedHeadTexs.push(bedTextureRotate(bedHeadTexs[i - 1]))
			bedFootTexs.push(bedTextureRotate(bedFootTexs[i - 1]))
		}
		// State-facing order is north, south, east, west, while the rotation
		// order above is north, east, south, west.
		shapes.bedHead = [ bedHeadShapes[0], bedHeadShapes[2], bedHeadShapes[1], bedHeadShapes[3] ]
		shapes.bedFoot = [ bedFootShapes[0], bedFootShapes[2], bedFootShapes[1], bedFootShapes[3] ]
		shapes.bedHeadTex = [ bedHeadTexs[0], bedHeadTexs[2], bedHeadTexs[1], bedHeadTexs[3] ]
		shapes.bedFootTex = [ bedFootTexs[0], bedFootTexs[2], bedFootTexs[1], bedFootTexs[3] ]
		let bedCollision = buildFlatShape(9)
		bedCollision.noCollide = false
		bedCollision.cull = { top: 0, bottom: 3, north: 0, south: 0, east: 0, west: 0 }
		shapes.bedCollision = finalizeShape(bedCollision)

		// Iron bars are a thin lattice, not a cube. These shapes mirror the
		// vanilla multipart models: a central cross-shaped post, small caps at
		// the top and bottom, and one 2px-wide rail per connected side. They are
		// built directly (like torches) so every face can sample the correct
		// strip of the 16x16 bar sprite instead of stretching the whole texture
		// across a block face.
		function pushBarQuad(verts, texVerts, face, points, uv) {
			let scale = ATLAS_SCALE / 16
			let cv = (p) => [ p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5 ]
			let front = points.flatMap(cv)
			let back = points.slice().reverse().flatMap(cv)
			let fuv = uv.map(c => c * scale)
			let buv = []
			for (let i = 3; i >= 0; i--) {
				buv.push(fuv[i * 2], fuv[i * 2 + 1])
			}
			verts[face].push(front, back)
			texVerts[face].push(fuv, buv)
		}
		// Vertical planes run along either Z (fixed X) or X (fixed Z). They
		// carry the left or right half of the bar sprite, which is where the
		// repeated vertical bars in vanilla's side models come from.
		function pushBarPlaneZ(verts, texVerts, face, x, z0, z1, u0, u1) {
			pushBarQuad(verts, texVerts, face,
				[ [x, 0, z0], [x, 0, z1], [x, 16, z1], [x, 16, z0] ],
				[ u0, 16, u1, 16, u1, 0, u0, 0 ])
		}
		function pushBarPlaneX(verts, texVerts, face, z, x0, x1, u0, u1) {
			pushBarQuad(verts, texVerts, face,
				[ [x0, 0, z], [x1, 0, z], [x1, 16, z], [x0, 16, z] ],
				[ u0, 16, u1, 16, u1, 0, u0, 0 ])
		}
		function pushBarPlate(verts, texVerts, face, x0, z0, x1, z1, y, u0, v0, u1, v1) {
			pushBarQuad(verts, texVerts, face,
				[ [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1] ],
				[ u0, v0, u1, v0, u1, v1, u0, v1 ])
		}
		function buildBarsShape(mask) {
			let verts = [ [], [], [], [], [], [] ]
			let texVerts = [ [], [], [], [], [], [] ]

			// Central post: two crossed planes and the little end caps that
			// vanilla always draws with the post_ends model.
			pushBarPlaneZ(verts, texVerts, 4, 8, 7, 9, 7, 9)
			pushBarPlaneX(verts, texVerts, 2, 8, 7, 9, 7, 9)
			pushBarPlate(verts, texVerts, 0, 7, 7, 9, 9, 0.5, 7, 7, 9, 9)
			pushBarPlate(verts, texVerts, 1, 7, 7, 9, 9, 15.5, 7, 7, 9, 9)

			// Side rails start at the edge of the post so the transparent
			// planes never z-fight with each other in the centre of the cell.
			if (mask & 1) { // +z
				pushBarPlaneZ(verts, texVerts, 4, 8, 9, 16, 8, 16)
				pushBarQuad(verts, texVerts, 2,
					[ [7, 0, 15.99], [9, 0, 15.99], [9, 16, 15.99], [7, 16, 15.99] ],
					[ 7, 16, 9, 16, 9, 0, 7, 0 ])
				pushBarPlate(verts, texVerts, 0, 7, 9, 9, 16, 0.5, 9, 9, 7, 16)
				pushBarPlate(verts, texVerts, 1, 7, 9, 9, 16, 15.5, 7, 9, 9, 16)
			}
			if (mask & 2) { // -z
				pushBarPlaneZ(verts, texVerts, 5, 8, 0, 7, 0, 8)
				pushBarQuad(verts, texVerts, 3,
					[ [7, 0, 0.01], [9, 0, 0.01], [9, 16, 0.01], [7, 16, 0.01] ],
					[ 9, 16, 7, 16, 7, 0, 9, 0 ])
				pushBarPlate(verts, texVerts, 0, 7, 0, 9, 7, 0.5, 7, 0, 9, 7)
				pushBarPlate(verts, texVerts, 1, 7, 0, 9, 7, 15.5, 9, 0, 7, 7)
			}
			if (mask & 4) { // +x
				pushBarPlaneX(verts, texVerts, 4, 8, 9, 16, 8, 16)
				pushBarQuad(verts, texVerts, 4,
					[ [15.99, 0, 7], [15.99, 0, 9], [15.99, 16, 9], [15.99, 16, 7] ],
					[ 8, 16, 16, 16, 16, 0, 8, 0 ])
				pushBarPlate(verts, texVerts, 0, 9, 7, 16, 9, 0.5, 9, 7, 16, 9)
				pushBarPlate(verts, texVerts, 1, 9, 7, 16, 9, 15.5, 9, 7, 16, 9)
			}
			if (mask & 8) { // -x
				pushBarPlaneX(verts, texVerts, 5, 8, 0, 7, 0, 8)
				pushBarQuad(verts, texVerts, 5,
					[ [0.01, 0, 7], [0.01, 0, 9], [0.01, 16, 9], [0.01, 16, 7] ],
					[ 16, 16, 8, 16, 8, 0, 16, 0 ])
				pushBarPlate(verts, texVerts, 0, 0, 7, 7, 9, 0.5, 0, 7, 7, 9)
				pushBarPlate(verts, texVerts, 1, 0, 7, 7, 9, 15.5, 0, 7, 7, 9)
			}

			return {
				verts: verts,
				texVerts: texVerts,
				cull: { top: 0, bottom: 0, north: 0, south: 0, east: 0, west: 0 },
				size: 6,
				varients: [],
				rotate: false,
				flip: false
			}
		}
		for (let mask = 0; mask < 16; mask++) {
			shapes["bars" + mask] = buildBarsShape(mask)
		}

		// Gravity blocks are driven by the falling-block entities in features.js.
		// Flag them once here so placement, rendering and support checks all use
		// the same registry metadata. Soul sand is deliberately not included.
		function isGravityBlockName(name) {
			return name === "sand" || name === "redSand" || name === "gravel" ||
				name === "suspiciousSand" || name === "suspiciousGravel" ||
				name === "anvil" || name === "chippedAnvil" || name === "damagedAnvil" ||
				name === "dragonEgg" || /ConcretePowder$/.test(name)
		}
		// Lanterns share the small body/handle model. Sea lanterns and jack
		// o'lanterns are full cubes and must not be included.
		function isLanternBlockName(name) {
			return name === "lantern" || name === "soulLantern" ||
				(/Lantern$/.test(name) && name !== "seaLantern" && name !== "jackOLantern")
		}

		for (let i = 0; i < BLOCK_COUNT; i++) {
			let baseBlock = blockData[i]
			if (baseBlock.name && isGravityBlockName(baseBlock.name)) {
				baseBlock.gravity = true
			}
			// Farmland stores moisture in bits 11-13. Wet variants share the
			// vanilla moist top texture; the sides stay dirt.
			if (baseBlock.name === "farmland") {
				baseBlock.farmland = true
				baseBlock.moisture = 0
				baseBlock.maxMoisture = 7
				baseBlock.shape = shapes.cube
				baseBlock.collisionShape = shapes.cube
				baseBlock.rayShape = shapes.cube
				for (let wet = 1; wet <= 7; wet++) {
					let variant = Object.create(baseBlock)
					variant.moisture = wet
					variant.textures = [ "farmlandMoist", "dirt", "dirt", "dirt", "dirt", "dirt" ]
					blockData[i | (wet << 11)] = variant
				}
				continue
			}
			// The legacy id 224 "snow" block predates the generated vanilla
			// list and was always a solid block. The generated table has a
			// model named "snow" for the thin layer, so keep this legacy id a
			// cube; the separate snowLayer block/model handles thin cover.
			if (baseBlock.name === "snow") {
				baseBlock.shape = shapes.cube
				baseBlock.collisionShape = shapes.cube
				baseBlock.rayShape = shapes.cube
				continue
			}
			// Some blocks use another block's model without sharing its id (the
			// large shelf mushroom is the first).  Prefer the explicit modelName
			// so those blocks still receive the real 26.3 geometry.
			let bakedModel = baseBlock.name
				? (VANILLA_MODELS[baseBlock.name] || (baseBlock.modelName ? VANILLA_MODELS[baseBlock.modelName] : null))
				: null
			if (bakedModel && bakedModel.c) {
				baseBlock.cross = true
				baseBlock.support = true
				baseBlock.transparent = true
				baseBlock.shadow = false
			}
			// Banners, heads, chests and pots are entity-rendered in vanilla,
			// so their blockstate has no elements to import. Give them boxes.
			if (baseBlock.name) {
				if (/Banner$/.test(baseBlock.name)) {
					baseBlock.banner = true
					baseBlock.bannerWall = /WallBanner$/.test(baseBlock.name)
					baseBlock.shape = baseBlock.bannerWall ? shapes.bannerWall : shapes.bannerStanding
					baseBlock.modelShape = baseBlock.shape
					baseBlock.rayShape = shapes.cube
					baseBlock.transparent = true
					if (!baseBlock.facing) continue
				} else if (/(Head|Skull)$/.test(baseBlock.name)) {
					baseBlock.head = true
					baseBlock.wallHead = /Wall(Head|Skull)$/.test(baseBlock.name)
					baseBlock.shape = baseBlock.wallHead ? shapes.headWall : shapes.head
					baseBlock.modelShape = baseBlock.shape
					baseBlock.rayShape = shapes.cube
					baseBlock.transparent = true
					if (!baseBlock.facing) continue
				} else if (/Chest$/i.test(baseBlock.name)) {
					baseBlock.shape = shapes.chest
					baseBlock.modelShape = shapes.chest
					baseBlock.collisionShape = shapes.chestCollision
					baseBlock.rayShape = shapes.chestCollision
					baseBlock.transparent = true
					if (!baseBlock.facing) continue
				} else if (baseBlock.name === "decoratedPot") {
					baseBlock.shape = shapes.pot
					baseBlock.modelShape = shapes.pot
					baseBlock.collisionShape = shapes.potCollision
					baseBlock.rayShape = shapes.potCollision
					baseBlock.transparent = true
					continue
				} else if (baseBlock.name === "conduit") {
					baseBlock.shape = shapes.conduit
					baseBlock.modelShape = shapes.conduit
					baseBlock.collisionShape = shapes.conduitCollision
					baseBlock.rayShape = shapes.conduitCollision
					baseBlock.transparent = true
					continue
				} else if (baseBlock.name === "bamboo" || baseBlock.name === "fire" || baseBlock.name === "soulFire") {
					baseBlock.cross = true
					baseBlock.support = true
					baseBlock.transparent = true
					baseBlock.shadow = false
				}
			}
			// Floor coral fans are generated as plain transparent blocks, which
			// stretches the flat fan sprite around all six cube faces. They use the
			// same cross model as coral plants. Wall fans end in "CoralWallFan" and
			// have no wall model, so they stay hidden in creative instead.
			if (baseBlock.name && /CoralFan$/.test(baseBlock.name)) {
				baseBlock.cross = true
				baseBlock.support = true
				baseBlock.transparent = true
				baseBlock.shadow = false
			}
			if (baseBlock.cross) {
				baseBlock.shape = shapes.cross
				baseBlock.rayShape = shapes.cube
				let maxAge = baseBlock.name ? CROP_MAX_AGE[baseBlock.name] : undefined
				if (maxAge !== undefined) {
					baseBlock.crop = true
					baseBlock.cropAge = 0
					baseBlock.maxAge = maxAge
					for (let age = 1; age <= maxAge; age++) {
						let variant = Object.create(baseBlock)
						let tex = baseBlock.name + "Stage" + age
						variant.cropAge = age
						variant.textures = [ tex, tex, tex, tex, tex, tex ]
						blockData[i | (age << 11)] = variant
					}
				}
				continue
			}
			if (baseBlock.torch) {
				baseBlock.shape = shapes.torchUp
				baseBlock.rayShape = shapes.cube
				let variant = Object.create(baseBlock)
				variant.shape = shapes.torchDown
				variant.hanging = true
				blockData[i | TORCH_HANGING] = variant
				continue
			}
			if (baseBlock.bed) {
				let facings = [ NORTH, SOUTH, EAST, WEST ]
				// Keep the generated bed's own color for the foot. The colored
				// beds ship foot textures only, so their head reuses those side
				// sprites plus the shared headboard; white keeps its dedicated
				// pillow textures. Rotating the arrays alongside the geometry is
				// required because rotate() moves UVs but not texture names.
				let baseTextures = Array.isArray(baseBlock.textures) ? baseBlock.textures.slice() : shapes.bedFootTex[0]
				let footTextures = [ baseTextures ]
				let headTextures = null
				if (baseBlock.name === "whiteBed") {
					headTextures = shapes.bedHeadTex
				} else if (!baseBlock.strawBed) {
					let color = (baseBlock.name || "whiteBed").replace(/Bed$/, "")
					headTextures = [ [
						color + "BedFootUp", "bedDown", "bedHeadNorth",
						color + "BedFootWest", color + "BedFootEast", color + "BedFootWest"
					] ]
				}
				for (let f = 1; f < facings.length; f++) {
					footTextures.push(bedTextureRotate(footTextures[f - 1]))
					if (headTextures && headTextures !== shapes.bedHeadTex) {
						headTextures.push(bedTextureRotate(headTextures[f - 1]))
					}
				}
				if (!headTextures) headTextures = footTextures
				baseBlock.shape = shapes.bedFoot[0]
				baseBlock.textures = footTextures[0]
				baseBlock.collisionShape = shapes.bedCollision
				baseBlock.rayShape = shapes.bedCollision
				baseBlock.transparent = true
				baseBlock.shadow = false
				for (let f = 0; f < facings.length; f++) {
					let foot = f === 0 ? baseBlock : Object.create(baseBlock)
					foot.shape = shapes.bedFoot[f]
					foot.textures = footTextures[f]
					foot.collisionShape = shapes.bedCollision
					foot.rayShape = shapes.bedCollision
					blockData[i | facings[f]] = foot
					let head = Object.create(baseBlock)
					head.shape = shapes.bedHead[f]
					head.textures = headTextures[f]
					head.collisionShape = shapes.bedCollision
					head.rayShape = shapes.bedCollision
					blockData[i | BED_HEAD | facings[f]] = head
				}
				continue
			}
			if (baseBlock.portal) {
				// The portal surface is a full cube for rendering and aiming, but
				// it has no collision so the player can walk into it.
				baseBlock.transparent = true
				baseBlock.shadow = false
				baseBlock.shape = shapes.cube
				baseBlock.rayShape = shapes.cube
				baseBlock.collisionShape = Object.assign({}, shapes.cube, { noCollide: true })
				continue
			}
			if (baseBlock.liquid) {
				// Fluids own bits 11-13: level 1..7 (a full/source block uses the
				// base id with no level bits). Lower levels use a shorter box.
				// Fluids are not solid: the player can walk and swim through them.
				baseBlock.shape = shapes.fluidSource
				baseBlock.rayShape = shapes.fluidSource
				let flow = baseBlock.liquid === "lava" ? "lavaFlow" : "waterFlow"
				for (let level = 1; level <= 7; level++) {
					let variant = Object.create(baseBlock)
					variant.shape = shapes["fluid" + level]
					variant.textures = [ flow, flow, flow, flow, flow, flow ]
					variant.flowing = true
					blockData[i | (level << 11)] = variant
				}
				let falling = Object.create(baseBlock)
				falling.shape = shapes.fluidSource
				falling.textures = [ flow, flow, flow, flow, flow, flow ]
				falling.flowing = true
				falling.falling = true
				blockData[i | FLUID_FALLING] = falling
				continue
			}
			if (baseBlock.fence) {
				baseBlock.shape = shapes.fence0
				baseBlock.rayShape = shapes.cube
				baseBlock.collisionShape = shapes.cube
				for (let m = 1; m < 16; m++) {
					let variant = Object.create(baseBlock)
					variant.shape = shapes["fence" + m]
					blockData[i | (m << 11)] = variant
				}
				continue
			}
			if (baseBlock.bars) {
				baseBlock.shape = shapes.bars0
				baseBlock.rayShape = shapes.cube
				baseBlock.collisionShape = shapes.cube
				for (let m = 1; m < 16; m++) {
					let variant = Object.create(baseBlock)
					variant.shape = shapes["bars" + m]
					blockData[i | (m << 11)] = variant
				}
				continue
			}
			// Lanterns are modelled as their real small body/cap/handle. The
			// hanging state is the same block with bit 11 set.
			if (baseBlock.name && isLanternBlockName(baseBlock.name)) {
				baseBlock.lantern = true
				baseBlock.shape = shapes.lantern
				baseBlock.collisionShape = shapes.lanternCollision
				baseBlock.rayShape = shapes.cube
				let hanging = Object.create(baseBlock)
				hanging.shape = shapes.lanternHanging
				hanging.collisionShape = shapes.lanternHangingCollision
				hanging.lanternHanging = true
				blockData[i | LANTERN_HANGING] = hanging
				continue
			}
			// Signs own their shape. Wall signs store the direction the board
			// faces in the rotation bits so placement can pick the wall; the
			// upright and ceiling signs are symmetric and use the base state.
			if (baseBlock.name && /Sign$/.test(baseBlock.name)) {
				let name = baseBlock.name
				baseBlock.sign = true
				baseBlock.wallSign = /Wall(Hanging)?Sign$/.test(name)
				baseBlock.hangingSign = /HangingSign$/.test(name)
				let signShapes = baseBlock.wallSign
					? (baseBlock.hangingSign ? shapes.signWallHanging : shapes.signWall)
					: (baseBlock.hangingSign ? shapes.signHanging : shapes.signStanding)
				baseBlock.shape = signShapes[0]
				baseBlock.rayShape = shapes.cube
				for (let f = 1; f < signShapes.length; f++) {
					let variant = Object.create(baseBlock)
					variant.shape = signShapes[f]
					blockData[i | (f << 14)] = variant
				}
				continue
			}
			if (baseBlock.name === "anvil" || baseBlock.name === "chippedAnvil" || baseBlock.name === "damagedAnvil") {
				// The anvil has its own four-part model. It stays a full-block
				// collision/ray target, but the visible shape follows facing.
				baseBlock.shape = shapes.anvil[0]
				baseBlock.collisionShape = shapes.cube
				baseBlock.rayShape = shapes.cube
				for (let f = 1; f < 4; f++) {
					let variant = Object.create(baseBlock)
					variant.shape = shapes.anvil[f]
					blockData[i | (f << 14)] = variant
				}
				continue
			}
			// Cake uses the 14x8x14 model built above instead of a cube.
			if (baseBlock.name === "cake") {
				baseBlock.shape = shapes.cake
				baseBlock.collisionShape = shapes.cakeCollision
				baseBlock.rayShape = shapes.cakeCollision
				continue
			}
			// Sculk blocks use the models built above instead of a cube. The
			// calibrated sensor keeps its facing in the state bits, so each of
			// its four facings gets a rotated shape and texture set.
			if (baseBlock.name === "sculkSensor" || baseBlock.name === "sculkShrieker" ||
				baseBlock.name === "calibratedSculkSensor" || baseBlock.name === "sculkVein") {
				baseBlock.transparent = true
				if (baseBlock.name === "sculkSensor") {
					baseBlock.shape = shapes.sculkSensor
					baseBlock.collisionShape = shapes.slab
					baseBlock.rayShape = shapes.slab
				} else if (baseBlock.name === "sculkShrieker") {
					baseBlock.shape = shapes.sculkShrieker
					baseBlock.collisionShape = shapes.cube
					baseBlock.rayShape = shapes.cube
				} else if (baseBlock.name === "sculkVein") {
					// Veins are decoration with no collision box of their own.
					baseBlock.shape = shapes.sculkVein
					baseBlock.collisionShape = shapes.sculkVein
					baseBlock.rayShape = shapes.cube
				} else {
					baseBlock.shape = shapes.calibratedSculkSensor[0]
					baseBlock.textures = shapes.calibratedSculkSensorTex[0]
					baseBlock.collisionShape = shapes.slab
					baseBlock.rayShape = shapes.slab
					let facings = [ SOUTH, EAST, WEST ]
					for (let f = 0; f < facings.length; f++) {
						let variant = Object.create(baseBlock)
						variant.shape = shapes.calibratedSculkSensor[f + 1]
						variant.textures = shapes.calibratedSculkSensorTex[f + 1]
						blockData[i | facings[f]] = variant
					}
				}
				continue
			}
			// Every remaining non-cube block uses its real 26.3 model geometry.
			if (bakedModel && bakedModel.e) {
				if (!modelShapes[baseBlock.name]) {
					let shape = buildModelShape(bakedModel)
					if (baseBlock.name === "brewingStand") addBrewingStandFins(shape)
					// Campfires are lit by default. The generated model uses the
					// unlit log sprite, so swap every log face to the matching animated
					// lit strip before caching the shape.
					if ((baseBlock.name === "campfire" || baseBlock.name === "soulCampfire") && shape.faceTextures) {
						let litLog = baseBlock.name === "soulCampfire" ? "soulCampfireLogLit" : "campfireLogLit"
						for (let faces of shape.faceTextures) {
							for (let f = 0; f < faces.length; f++) {
								if (faces[f] === "campfireLog") faces[f] = litLog
							}
						}
					}
					modelShapes[baseBlock.name] = shape
				}
				baseBlock.shape = modelShapes[baseBlock.name]
				baseBlock.modelShape = baseBlock.shape
				baseBlock.transparent = true
				baseBlock.collisionShape = shapes.cube
				baseBlock.rayShape = shapes.cube
				// Shelf mushrooms are wall plates.  A flat collision/ray box
				// keeps the player from being stopped by empty air below the
				// visible bracket and gives the large variant a clean landing
				// surface for its bounce behavior.
				if (baseBlock.name === "shelfMushroom" || baseBlock.name === "largeShelfMushroom") {
					baseBlock.collisionShape = shapes.flat
					baseBlock.rayShape = shapes.flat
				}
				if (baseBlock.facing) {
					for (let facing of [ SOUTH, EAST, WEST ]) {
						let variant = Object.create(baseBlock)
						variant.shape = baseBlock.shape
						blockData[i | facing] = variant
					}
					if (baseBlock.verticalFacing) {
						blockData[i | FACING_UP] = Object.create(baseBlock)
						blockData[i | FACING_DOWN] = Object.create(baseBlock)
					}
				}
				continue
			}
			if (baseBlock.facing) {
				// Facing blocks show a different texture on the side they face.
				// Generated vanilla blocks carry a complete per-facing texture set,
				// so every face keeps its own texture (furnace, dispenser, chest...).
				baseBlock.shape = baseBlock.modelShape || shapes.cube
				if (baseBlock.faceTextures) {
					let facings = [ NORTH, SOUTH, EAST, WEST ]
					let names = [ 'north', 'south', 'east', 'west' ]
					for (let fi = 0; fi < 4; fi++) {
						let texs = baseBlock.faceTextures[names[fi]]
						if (!texs) continue
						if (facings[fi] === NORTH) {
							baseBlock.textures = texs
						} else {
							let variant = Object.create(baseBlock)
							variant.textures = texs
							blockData[i | facings[fi]] = variant
						}
					}
					// Dispensers, droppers, pistons, observers and barrels can
					// also point up or down. Their vertical models carry the
					// front texture on the top/bottom face instead of a side.
					if (baseBlock.verticalFacing) {
						let up = baseBlock.faceTextures.up
						let down = baseBlock.faceTextures.down
						if (up) {
							let variant = Object.create(baseBlock)
							variant.textures = up
							blockData[i | FACING_UP] = variant
						}
						if (down) {
							let variant = Object.create(baseBlock)
							variant.textures = down
							blockData[i | FACING_DOWN] = variant
						}
					}
					continue
				}
				// Legacy fallback: one front texture on the facing side.
				let top = baseBlock.textures[0]
				let side = baseBlock.side
				let front = baseBlock.front
				let frontIndex = { [NORTH]: 2, [SOUTH]: 3, [EAST]: 4, [WEST]: 5 }
				let facings = [ NORTH, SOUTH, EAST, WEST ]
				for (let facing of facings) {
					let textures = [ top, top, side, side, side, side ]
					textures[frontIndex[facing]] = front
					if (facing === NORTH) {
						baseBlock.textures = textures
					} else {
						let variant = Object.create(baseBlock)
						variant.textures = textures
						blockData[i | facing] = variant
					}
				}
				continue
			}
			if (baseBlock.door) {
				// Create all 32 block states: facing (4) x open (2) x hinge (2)
				// x upper/lower half (2). Vanilla models put the closed panel on
				// the side of the cell facing the player, i.e. opposite the door's
				// facing value. An open panel always rotates onto the hinge edge.
				let bottomTex = baseBlock.textures[0]
				let topTex = bottomTex.replace("DoorBottom", "DoorTop")
				let facings = [ NORTH, SOUTH, EAST, WEST ]
				let closedByFacing = {
					[NORTH]: shapes.doorSouth,
					[SOUTH]: shapes.doorNorth,
					[EAST]: shapes.doorWest,
					[WEST]: shapes.doorEast,
				}
				// Open door panel edge for facing x hinge, matching vanilla's
				// left/right hinge models (index 0 = left hinge, 1 = right).
				let openByHinge = {
					[NORTH]: [ shapes.doorWest, shapes.doorEast ],
					[SOUTH]: [ shapes.doorEast, shapes.doorWest ],
					[EAST]: [ shapes.doorNorth, shapes.doorSouth ],
					[WEST]: [ shapes.doorSouth, shapes.doorNorth ],
				}
				for (let f = 0; f < facings.length; f++) {
					let facing = facings[f]
					for (let open = 0; open < 2; open++) {
						let openShapes = open ? openByHinge[facing] : null
						for (let hinge = 0; hinge < 2; hinge++) {
							let shape = open ? openShapes[hinge] : closedByFacing[facing]
							let state = facing | (open ? DOOR_OPEN : 0) | (hinge ? DOOR_HINGE : 0)
							// Left-hinged doors use the horizontally mirrored texture so
							// the handle remains on the side opposite the hinge.
							let bottomTexture = hinge ? bottomTex : bottomTex + "Mirror"
							let topTexture = hinge ? topTex : topTex + "Mirror"
							let lower = Object.create(baseBlock)
							lower.shape = shape
							lower.collisionShape = shape
							lower.rayShape = shape
							lower.textures = [ bottomTexture, bottomTexture, bottomTexture, bottomTexture, bottomTexture, bottomTexture ]
							blockData[i | state] = lower
							let upper = Object.create(lower)
							upper.textures = [ topTexture, topTexture, topTexture, topTexture, topTexture, topTexture ]
							blockData[i | state | DOOR_UPPER] = upper
						}
					}
				}
				let baseShape = closedByFacing[NORTH]
				baseBlock.shape = baseShape
				baseBlock.collisionShape = baseShape
				baseBlock.rayShape = baseShape
				continue
			}
			if (baseBlock.trap) {
				// 16 states: bottom/top half (2) x open/closed (2) x facing (4).
				let closedShapeByHalf = [ shapes.trapTop, shapes.trapBottom ]
				let openShapeByFacing = {
					[NORTH]: shapes.doorNorth,
					[SOUTH]: shapes.doorSouth,
					[EAST]: shapes.doorEast,
					[WEST]: shapes.doorWest,
				}
				let facings = [ NORTH, SOUTH, EAST, WEST ]
				for (let half = 0; half < 2; half++) {
					let closedShape = closedShapeByHalf[half]
					for (let open = 0; open < 2; open++) {
						for (let f = 0; f < facings.length; f++) {
							let facing = facings[f]
							let shape = open ? openShapeByFacing[facing] : closedShape
							let state = (half ? TRAPDOOR_BOTTOM : 0) | (open ? TRAPDOOR_OPEN : 0) | facing
							let variant = Object.create(baseBlock)
							variant.shape = shape
							variant.collisionShape = shape
							variant.rayShape = shape
							blockData[i | state] = variant
						}
					}
				}
				baseBlock.shape = shapes.trapTop
				baseBlock.collisionShape = shapes.trapTop
				baseBlock.rayShape = shapes.trapTop
				continue
			}
			// Snow layers are full-footprint plates; unlike carpets they should
			// not offer slab/stair placement modes.
			if (baseBlock.snowLayer) {
				baseBlock.shape = shapes.snowLayer
				baseBlock.collisionShape = shapes.snowLayer
				baseBlock.rayShape = shapes.snowLayer
				continue
			}
			// Blocks that are already a slab, stair or thin plate keep their own
			// base shape while still offering the slab/stair placement modes.
			if (baseBlock.slabOnly || baseBlock.stairOnly || baseBlock.flat) {
				let baseShape = baseBlock.slabOnly ? shapes.slab : (baseBlock.stairOnly ? shapes.stair : shapes.flat)
				baseBlock.shape = baseShape
				baseBlock.collisionShape = baseShape
				baseBlock.rayShape = baseShape
				// A slab or stair does not fill its cell. If it is left marked
				// opaque, every full block beside it has that whole face culled,
				// which opens an x-ray window over the empty half of the cell.
				baseBlock.transparent = true
				let slabBlock = Object.create(baseBlock)
				let stairBlock = Object.create(baseBlock)
				slabBlock.shape = shapes.slab
				slabBlock.collisionShape = shapes.slab
				slabBlock.rayShape = shapes.slab
				slabBlock.transparent = true
				stairBlock.shape = shapes.stair
				stairBlock.collisionShape = shapes.stair
				stairBlock.rayShape = shapes.stair
				stairBlock.transparent = true
				stairBlock.corners = shapes.stair.varients[0].corners
				if (baseBlock.stairOnly) baseBlock.corners = shapes.stair.varients[0].corners
				blockData[i | SLAB] = slabBlock
				blockData[i | STAIR] = stairBlock
				let sv = shapes.slab.varients
				for (let j = 0; j < sv.length; j++) {
					if (!sv[j]) continue
					let block = Object.create(slabBlock)
					block.shape = sv[j]
					// Collisions and ray tracing follow the visible orientation too,
					// otherwise top slabs keep the bottom slab's hitbox.
					block.collisionShape = sv[j]
					block.rayShape = sv[j]
					blockData[i | SLAB | j << 13] = block
				}
				let tv = shapes.stair.varients
				for (let j = 0; j < tv.length; j++) {
					if (!tv[j]) continue
					let block = Object.create(stairBlock)
					block.shape = tv[j]
					// Without this, every rotated or upside-down stair collides
					// and ray-traces as the default north-facing bottom stair.
					block.collisionShape = tv[j]
					block.rayShape = tv[j]
					block.corners = tv[j].corners
					blockData[i | STAIR | j << 13] = block
				}
				continue
			}
			let slabBlock = Object.create(baseBlock)
			let stairBlock = Object.create(baseBlock)
			slabBlock.shape = shapes.slab
			baseBlock.shape = shapes.cube
			stairBlock.shape = shapes.stair
			// Slabs and stairs are partial blocks, so neighbours must keep the
			// faces they do not cover. Only the full base block is opaque.
			slabBlock.transparent = true
			stairBlock.transparent = true
			blockData[i | SLAB] = slabBlock
			blockData[i | STAIR] = stairBlock
			let v = slabBlock.shape.varients
			for (let j = 0; j < v.length; j++) {
				if (v[j]) {
					let block = Object.create(slabBlock)
					block.shape = v[j]
					blockData[i | SLAB | j << 13] = block
				}
			}
			v = stairBlock.shape.varients
			stairBlock.corners = v[0].corners
			for (let j = 0; j < v.length; j++) {
				if (v[j]) {
					let block = Object.create(stairBlock)
					block.shape = v[j]
					block.corners = v[j].corners
					blockData[i | STAIR | j << 13] = block
				}
			}
		}
		// A few custom-shaped blocks (amethyst buds, wall torches) carry facing
		// metadata but were built outside the facing branch. Fill any missing
		// facing states so every stored world state resolves to a block entry.
		for (let i = 1; i < 2048; i++) {
			let base = blockData[i]
			if (!base || !base.name || !base.facing || base.shape === shapes.cube) continue
			for (let facing of [ SOUTH, EAST, WEST ]) {
				if (blockData[i | facing]) continue
				let variant = Object.create(base)
				variant.shape = base.shape
				blockData[i | facing] = variant
			}
			if (base.verticalFacing) {
				for (let facing of [ FACING_UP, FACING_DOWN ]) {
					if (blockData[i | facing]) continue
					let variant = Object.create(base)
					variant.shape = base.shape
					blockData[i | facing] = variant
				}
			}
		}
		// Model-backed blocks no longer fall through to the slab/stair branch.
		// Slab/stair placement modes and older saves can still reference those
		// states, so restore them for blocks that do not own their state bits.
		for (let i = 1; i < 2048; i++) {
			let base = blockData[i]
			if (!base || !base.name || base.shape === shapes.cube) continue
			if (base.cross || base.fence || base.bars || base.door || base.trap ||
				base.torch || base.liquid || base.sign || base.lantern || base.bed ||
				base.facing || base.flat || base.gravity) continue
			if (blockData[i | SLAB] || blockData[i | STAIR]) continue
			let slabBlock = Object.create(base)
			let stairBlock = Object.create(base)
			slabBlock.shape = shapes.slab
			stairBlock.shape = shapes.stair
			slabBlock.transparent = true
			stairBlock.transparent = true
			blockData[i | SLAB] = slabBlock
			blockData[i | STAIR] = stairBlock
			let sv = shapes.slab.varients
			for (let j = 0; j < sv.length; j++) {
				if (!sv[j]) continue
				let block = Object.create(slabBlock)
				block.shape = sv[j]
				blockData[i | SLAB | j << 13] = block
			}
			let tv = shapes.stair.varients
			stairBlock.corners = tv[0].corners
			for (let j = 0; j < tv.length; j++) {
				if (!tv[j]) continue
				let block = Object.create(stairBlock)
				block.shape = tv[j]
				block.corners = tv[j].corners
				blockData[i | STAIR | j << 13] = block
			}
		}
	}
	let indexOrder;
	(function() {
		let arr = []
		for (let i = 0; i < 100000; i++) {
			arr.push(0 + i * 4, 1 + i * 4, 2 + i * 4, 0 + i * 4, 2 + i * 4, 3 + i * 4)
		}
		indexOrder = new Uint32Array(arr)
	})()

	let hexagonVerts
	let slabIconVerts
	let stairIconVerts
	let blockIcons
	{
		let side = Math.sqrt(3) / 2
		let s = side
		let q = s / 2
		hexagonVerts = new Float32Array([
			0, 1, 1, side, 0.5, 1, 0, 0, 1, -side, 0.5, 1,
			0, 0, 1, side, 0.5, 1, side, -0.5, 1, 0, -1, 1,
			-side, 0.5, 1, 0, 0, 1, 0, -1, 1, -side, -0.5, 1,
		])

		slabIconVerts = new Float32Array([
			0, 0.5, 1, side, 0, 1, 0, -0.5, 1, -side, 0, 1,
			0, -0.5, 1, side, 0, 1, side, -0.5, 1, 0, -1, 1,
			-side, 0, 1, 0, -0.5, 1, 0, -1, 1, -side, -0.5, 1,
		])

		stairIconVerts = [
			-s,0.5,0,0,1,         0,1,1,0,1,         q,0.75,1,0.5,1,    -q,0.25,0,0.5,1,    // top of the top step
			-q,-0.25,0,0,1,       q,0.25,1,0,1,      s,0,1,0.5,1,        0,-0.5,0,0.5,1,    // top of the bottom step
			-q,0.25,0,0,0.6,      q,0.75,1,0,0.6,    q,0.25,1,0.5,0.6,  -q,-0.25,0,0.5,0.6, // front of the top step
			0,-0.5,0,0,0.6,       s,0,1,0,0.6,       s,-0.5,1,0.5,0.6,   0,-1,0,0.5,0.6,    // front of the bottom step
			-s,0.5,0,0,0.8,      -q,0.25,0.5,0,0.8, -q,-0.75,0.5,1,0.8, -s,-0.5,0,1,0.8,    // side of the top step
			-q,-0.25,0.5,0.5,0.8, 0,-0.5,1,0.5,0.8,  0,-1,1,1,0.8,      -q,-0.75,0.5,1,0.8, // side of the bottom step
		]
	}
	function genIcons() {
		if (!textureMap || Object.keys(textureMap).length === 0) return
		if (!gl || !blockData) return
		blockIcons = [null]
		blockIcons.lengths = []
		// Textures are stored [top, bottom, north, south, east, west].
		// The cube/slab icon geometry has three vertex groups in the order
		// top, east, north. The buffer is emitted back-to-front, but the
		// group index still selects the texture and shade for that face.
		// Stairs use a different vertex layout, so they keep the
		// top/north/east order below.
		let cubeFaces = [0, 4, 2]
		let cubeShadows = [1, 0.7, 0.4]
		let texOrder = [0, 2, 4]
		let shadows = [1, 0.4, 0.7]
		let scale = 0.16 / height * inventory.size

		function iconTexture(name) {
			if (!name) return undefined
			let slot = textureMap[name]
			if (slot === undefined || !textureCoords[slot]) return undefined
			return textureCoords[slot]
		}

		// Add a textured quad. The vertex order matches indexOrder:
		// bottom-left, bottom-right, top-right, top-left. `crop` optionally
		// restricts sampling to a sub-rectangle of the tile (u0, v0, u1, v1);
		// thin fence posts/rails use it so the 16x16 plank tile is not crushed
		// into a few pixels and loses its grain.
		function addQuad(data, tex, x0, y0, x1, y1, shade, crop) {
			let c = iconTexture(tex)
			if (!c) return
			let u0 = crop ? crop[0] : 0
			let v0 = crop ? crop[1] : 0
			let u1 = crop ? crop[2] : 1
			let v1 = crop ? crop[3] : 1
			let cu0 = c[0] + (c[2] - c[0]) * u0
			let cu1 = c[0] + (c[2] - c[0]) * u1
			let cv0 = c[1] + (c[5] - c[1]) * v0
			let cv1 = c[1] + (c[5] - c[1]) * v1
			let points = [ [x0, y0], [x1, y0], [x1, y1], [x0, y1] ]
			let uv = [ cu0, cv1, cu1, cv1, cu1, cv0, cu0, cv0 ]
			for (let k = 0; k < 4; k++) {
				data.push(-points[k][0] * scale)
				data.push(points[k][1] * scale)
				data.push(0.1666666)
				data.push(uv[k * 2])
				data.push(uv[k * 2 + 1])
				data.push(shade)
			}
		}

		// A flat sprite is the correct inventory icon for plants, torches,
		// signs, rails, tools and other non-cube items.
		function addSprite(data, tex, halfW, halfH, shade) {
			addQuad(data, tex, -halfW, -halfH, halfW, halfH, shade === undefined ? 1 : shade)
		}

		// Fences, walls and panes get a small front-facing fence instead of a
		// full plank cube. Fence gates get their frame and diagonal brace.
		function addFence(data, tex, gate) {
			// A post is roughly one quarter of a plank tile wide; taking the
			// whole tile made the wood grain vanish into vertical streaks. Rails
			// similarly need only a thin horizontal band of the tile.
			let postUV = [ 0.25, 0, 0.5, 1 ]
			let railUV = [ 0, 0.25, 1, 0.5 ]
			let post = 0.09
			let px = 0.55
			addQuad(data, tex, -px - post, -0.9, -px + post, 0.9, 0.8, postUV)
			addQuad(data, tex, px - post, -0.9, px + post, 0.9, 0.65, postUV)
			if (gate) {
				addQuad(data, tex, -px - post, 0.42, px + post, 0.6, 1, railUV)
				addQuad(data, tex, -px - post, -0.6, px + post, -0.42, 0.75, railUV)
				// Diagonal brace.
				let x0 = -px, y0 = -0.42, x1 = px, y1 = 0.42
				let dx = x1 - x0, dy = y1 - y0
				let len = Math.sqrt(dx * dx + dy * dy)
				let nx = -dy / len * 0.055, ny = dx / len * 0.055
				addQuad(data, tex, x0 + nx, y0 + ny, x1 + nx, y1 + ny, 0.9, [ 0.25, 0.25, 0.75, 0.75 ])
				addQuad(data, tex, x0 - nx, y0 - ny, x1 - nx, y1 - ny, 0.7, [ 0.25, 0.25, 0.75, 0.75 ])
				return
			}
			addQuad(data, tex, -0.8, -0.03, 0.8, 0.16, 0.95, railUV)
			addQuad(data, tex, -0.8, -0.5, 0.8, -0.31, 0.7, railUV)
		}

		// Doors use their bottom and top textures on two vertical panels.
		function addDoor(data, texs) {
			// The base door state uses the mirrored hinge texture. Inventory
			// icons should use the normal handle side, and it also guarantees
			// the texture exists for every generated door type.
			let bottom = (texs[0] || texs[1] || texs[2] || "").replace(/Mirror$/, "")
			let top = bottom ? bottom.replace("DoorBottom", "DoorTop") : bottom
			if (!iconTexture(top)) top = bottom
			addQuad(data, bottom, -0.46, -0.95, 0.46, 0, 1)
			addQuad(data, top, -0.46, 0, 0.46, 0.95, 0.95)
			// A narrow side edge gives the sprite some depth.
			addQuad(data, bottom, 0.46, -0.95, 0.53, 0, 0.6)
			addQuad(data, top, 0.46, 0, 0.53, 0.95, 0.55)
		}

		// Trapdoors, plates and carpets are thin slabs, not full cubes.
		function addPlate(data, topTex, sideTex) {
			let tx = topTex || sideTex
			let sx = sideTex || topTex
			let top = [ [0, 0.3], [0.8, -0.05], [0, -0.4], [-0.8, -0.05] ]
			let bottom = [ [0, -0.05], [0.8, -0.4], [0, -0.75], [-0.8, -0.4] ]
			function plateQuad(a, b, c, d, tex, shade) {
				let coords = iconTexture(tex)
				if (!coords) return
				let pts = [ a, b, c, d ]
				let uv = [ coords[6], coords[7], coords[4], coords[5], coords[2], coords[3], coords[0], coords[1] ]
				for (let k = 0; k < 4; k++) {
					data.push(-pts[k][0] * scale)
					data.push(pts[k][1] * scale)
					data.push(0.1666666)
					data.push(uv[k * 2])
					data.push(uv[k * 2 + 1])
					data.push(shade)
				}
			}
			plateQuad(top[0], top[1], top[2], top[3], tx, 1)
			plateQuad(top[3], top[2], bottom[2], bottom[3], sx, 0.7)
			plateQuad(top[2], top[1], bottom[1], bottom[2], sx, 0.55)
			plateQuad(top[0], top[3], bottom[3], bottom[0], sx, 0.8)
			plateQuad(top[1], top[0], bottom[0], bottom[1], sx, 0.65)
		}

		// Draw a real block model instead of reducing every shaped block to a
		// plate or a cube. The model is projected with the same isometric view
		// as the cube icons, and only the three faces visible from that view
		// (top, north and east) are emitted, back to front.
		function addModelIcon(data, shape, texs) {
			if (!shape || !shape.verts || !shape.texVerts) return false
			// Shape groups are bottom, top, north, south, east, west. Block
			// textures are stored top, bottom, north, south, east, west.
			let groupTexture = [1, 0, 2, 3, 4, 5]
			let groupShade = [0.5, 1, 0.4, 0.4, 0.7, 0.7]
			let visibleGroups = [1, 2, 4]
			let faces = []
			let minX = Infinity, maxX = -Infinity
			let minY = Infinity, maxY = -Infinity
			for (let g of visibleGroups) {
				let group = shape.verts[g]
				let groupUv = shape.texVerts[g]
				if (!group || !groupUv) continue
				for (let f = 0; f < group.length; f++) {
					let verts = group[f]
					let uv = groupUv[f]
					if (!verts || verts.length < 12 || !uv) continue
					let textureSlot = shape.faceTextureSlots && shape.faceTextureSlots[g]
					if (Array.isArray(textureSlot)) textureSlot = textureSlot[f]
					let tex = (shape.faceTextures && shape.faceTextures[g] && shape.faceTextures[g][f]) || (textureSlot === undefined ? texs[groupTexture[g]] : texs[textureSlot])
					let coords = iconTexture(tex)
					if (!coords) {
						tex = texs.find(t => iconTexture(t))
						coords = iconTexture(tex)
					}
					if (!coords) continue
					let points = []
					let depth = 0
					for (let k = 0; k < 4; k++) {
						let x = verts[k * 3]
						let y = verts[k * 3 + 1]
						let z = verts[k * 3 + 2]
						let sx = (z - x) * 0.8660254 * scale
						let sy = (y - (x + z) * 0.5) * scale
						points.push([ sx, sy ])
						if (sx < minX) minX = sx
						if (sx > maxX) maxX = sx
						if (sy < minY) minY = sy
						if (sy > maxY) maxY = sy
						depth += x + y + z
					}
					faces.push({ points, coords, uv, shade: groupShade[g], depth: depth / 4 })
				}
			}
			if (!faces.length) return false
			// Keep raised models such as signs and anvils inside the slot, and
			// center shallow ones such as cakes and beds in the same space as
			// a cube icon.
			let offsetX = -(minX + maxX) / 2
			let offsetY = -(minY + maxY) / 2
			let fit = Math.min(1, 2 / Math.max(0.001, maxY - minY), 1.9 / Math.max(0.001, maxX - minX))
			faces.sort((a, b) => a.depth - b.depth)
			for (let face of faces) {
				for (let k = 0; k < 4; k++) {
					data.push((face.points[k][0] + offsetX) * fit)
					data.push((face.points[k][1] + offsetY) * fit)
					data.push(0.1666666)
					data.push(face.coords[0] + face.uv[k * 2])
					data.push(face.coords[1] + face.uv[k * 2 + 1])
					data.push(face.shade)
				}
			}
			return true
		}

		function makeIcon(id, data) {
			if (!data.length) return
			let buffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
			blockIcons[id] = buffer
			blockIcons.lengths[id] = data.length / 4
		}

		for (let i = 1; i < BLOCK_COUNT; i++) {
			let data = []
			let block = blockData[i]
			if (!block || !block.textures) continue
			let texs = block.textures
			if (typeof texs === "string") texs = [texs, texs, texs, texs, texs, texs]
			let name = block.name || ""

			if (block.cross || block.torch) {
				// A plant/torch texture is already a complete sprite. Putting it
				// on three overlapping cube faces repeated the stem and flame.
				addSprite(data, texs[0] || name, 0.78, 0.78)
			} else if (block.door) {
				addDoor(data, texs)
			} else if (block.fence || block.bars || /Pane$/.test(name)) {
				if (/FenceGate/.test(name)) {
					// Gates have a distinct frame and diagonal brace; the fence
					// connection model would just show a post and two rails.
					let fenceTex = /^bambooFence/.test(name) ? "bambooPlanks" : (texs[0] || name)
					addFence(data, fenceTex, true)
				} else {
					// Show a connected section, matching the vanilla fence/wall/
					// pane inventory silhouettes instead of a flat billboard.
					let connected = blockData[i | (12 << 11)] || block
					if (!addModelIcon(data, connected.shape, texs)) {
						let fenceTex = /^bambooFence/.test(name) ? "bambooPlanks" : (texs[0] || name)
						addFence(data, fenceTex, false)
					}
				}
			} else if (/Rail$/.test(name) || /Ladder$/.test(name) || /(Chain|Candle|LightningRod)$/.test(name) || /^(lever|candle|rail|ladder)$/.test(name)) {
				addSprite(data, texs[0] || name, 0.78, 0.78)
			} else if (block.sign || block.bed || block.lantern || block.trap || block.flat ||
					(block.shape && block.shape !== shapes.cube && !block.slabOnly && !block.stairOnly)) {
				// Signs, beds, cakes, anvils, lanterns, trapdoors and plates all
				// have real models. Use them, with the old flat fallbacks only
				// when the atlas is missing one of their textures.
				if (!addModelIcon(data, block.shape, texs)) {
					if (block.sign) addSprite(data, texs[0] || name, 0.78, 0.78)
					else if (block.trap || block.flat || block.bed) addPlate(data, texs[0] || name, texs[2] || texs[0] || name)
					else addSprite(data, texs[0] || name, 0.78, 0.78)
				}
			} else if (/Carpet$/.test(name) || /PressurePlate$/.test(name)) {
				addPlate(data, texs[0] || name, texs[2] || texs[0] || name)
			} else {
				// Normal isometric cube icon.
				for (let j = 11; j >= 0; j--) {
					data.push(-hexagonVerts[j * 3 + 0] * scale)
					data.push(hexagonVerts[j * 3 + 1] * scale)
					data.push(0.1666666)
					let face = Math.floor(j / 4)
					let t = texs[cubeFaces[face]] || texs[0]
					if (!t) continue
					let tm = textureMap[t]
					if (tm === undefined || !textureCoords[tm]) continue
					data.push(textureCoords[tm][(j * 2 + 0) % 8])
					data.push(textureCoords[tm][(j * 2 + 1) % 8])
					data.push(cubeShadows[face])
				}
			}
			makeIcon(i, data)

			// slab
			data = []
			for (let j = 11; j >= 0; j--) {
				let face = Math.floor(j / 4)
				let t = texs[cubeFaces[face]] || texs[0]
				if (!t) continue
				let tm = textureMap[t]
				if (tm === undefined || !textureCoords[tm]) continue
				let texc = textureCoords[tm]
				data.push(-slabIconVerts[j * 3 + 0] * scale)
				data.push(slabIconVerts[j * 3 + 1] * scale)
				data.push(0.1666666)
				data.push(texc[(j * 2 + 0) % 8])
				data.push(texc[(j * 2 + 1) % 8])
				data.push(cubeShadows[face])
			}
			makeIcon(i | SLAB, data)

			// stair
			data = []
			let v = stairIconVerts
			for (let j = 23; j >= 0; j--) {
				let num = Math.floor(j / 8)
				let st = texs[texOrder[num]] || texs[0]
				if (!st) continue
				let tm2 = textureMap[st]
				if (tm2 === undefined || !textureCoords[tm2]) continue
				let texc2 = textureCoords[tm2]
				let tx = texc2[0]
				let ty = texc2[1]
				data.push(-v[j * 5 + 0] * scale)
				data.push(v[j * 5 + 1] * scale)
				data.push(0.1666666)
				data.push(tx + v[j * 5 + 2] * ATLAS_SCALE)
				data.push(ty + v[j * 5 + 3] * ATLAS_SCALE)
				data.push(shadows[num])
			}
			makeIcon(i | STAIR, data)
		}

		// Non-block items (tools, food, ingots...) are flat sprites, not cubes.
		for (let i = 0; i < itemData.length; i++) {
			let data = []
			addSprite(data, itemData[i].texture, 0.78, 0.78)
			makeIcon(ITEM_ID_BASE + i, data)
		}
	}

	function uniformMatrix(cacheId, programObj, vrName, transpose, matrix) {
		let vrLocation = glCache[cacheId]
		if(vrLocation === undefined) {
			vrLocation = gl.getUniformLocation(programObj, vrName)
			glCache[cacheId] = vrLocation
		}
		gl.uniformMatrix4fv(vrLocation, transpose, matrix)
	}
	function vertexAttribPointer(cacheId, programObj, vrName, size, VBO) {
		let vrLocation = glCache[cacheId]
		if(vrLocation === undefined) {
			vrLocation = gl.getAttribLocation(programObj, vrName)
			glCache[cacheId] = vrLocation
		}
		if (vrLocation !== -1) {
			gl.enableVertexAttribArray(vrLocation)
			gl.bindBuffer(gl.ARRAY_BUFFER, VBO)
			gl.vertexAttribPointer(vrLocation, size, gl.FLOAT, false, 0, 0)

		}
	}






	function use2d() {
		gl.disableVertexAttribArray(glCache.aTexture)
		gl.disableVertexAttribArray(glCache.aShadow)
		gl.disableVertexAttribArray(glCache.aVertex)
		gl.useProgram(program2D)
		
		gl.enableVertexAttribArray(glCache.aVertex2)
		gl.enableVertexAttribArray(glCache.aTexture2)
		gl.enableVertexAttribArray(glCache.aShadow2)
	}
	function use3d() {
		gl.disableVertexAttribArray(glCache.aTexture2)
		gl.disableVertexAttribArray(glCache.aShadow2)
		gl.disableVertexAttribArray(glCache.aVertex2)
		gl.useProgram(program3D)

		// Menus, icons and the hotbar should always be fully lit (no day/night dimming)
		if (glCache.uSkyBrightness !== undefined) {
			gl.uniform1f(glCache.uSkyBrightness, 1.0)
		}

		gl.enableVertexAttribArray(glCache.aVertex)
		gl.enableVertexAttribArray(glCache.aTexture)
		gl.enableVertexAttribArray(glCache.aShadow)
	}

	// Day/night cycle constants. Time 0 is sunrise, 150 is noon, 300 is
	// sunset, and 450 is midnight; a full day is DAY_LENGTH seconds long.
	const DAY_LENGTH = 600
	const DAY_ZENITH = [0.47, 0.65, 1.0]
	const DAY_HORIZON = [0.75, 0.85, 1.0]
	const DAY_FOG = [0.75, 0.85, 1.0]
	const NIGHT_ZENITH = [0.002, 0.004, 0.012]
	const NIGHT_HORIZON = [0.02, 0.035, 0.08]
	const NIGHT_FOG = [0.015, 0.025, 0.06]
	const DAWN_HORIZON = [0.95, 0.45, 0.18]
	const DAWN_FOG = [0.72, 0.43, 0.25]
	function skySmoothstep(edge0, edge1, x) {
		let t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
		return t * t * (3 - 2 * t)
	}
	function blendColor(a, b, t) {
		return [
			a[0] + (b[0] - a[0]) * t,
			a[1] + (b[1] - a[1]) * t,
			a[2] + (b[2] - a[2]) * t,
		]
	}
	function computeSky(time) {
		const day = Math.floor(time / DAY_LENGTH)
		time = time % DAY_LENGTH
		if (time < 0) time += DAY_LENGTH
		const angle = time * Math.PI * 2 / DAY_LENGTH
		// Sunrise is east, noon is overhead, and sunset is west.
		const sun = [Math.cos(angle), Math.sin(angle), 0]
		const daylight = skySmoothstep(-0.2, 0.1, sun[1])
		const twilight = 1 - skySmoothstep(0.02, 0.42, Math.abs(sun[1]))
		let horizonColor = blendColor(NIGHT_HORIZON, DAY_HORIZON, daylight)
		horizonColor = blendColor(horizonColor, DAWN_HORIZON, twilight * 0.75)
		let fogColor = blendColor(NIGHT_FOG, DAY_FOG, daylight)
		fogColor = blendColor(fogColor, DAWN_FOG, twilight * 0.35)
		const zenithColor = blendColor(NIGHT_ZENITH, DAY_ZENITH, daylight)
		const brightness = 0.12 + 0.88 * daylight
		const moonPhase = ((day % 8) + 8) % 8
		return {
			time: time, sun: sun, horizonColor: horizonColor,
			zenithColor: zenithColor, fogColor: fogColor, brightness: brightness,
			night: 1 - daylight, twilight: twilight, moonPhase: moonPhase,
		}
	}
	function renderSkybox(timeSec, view) {
		const sky = computeSky(timeSec)

		gl.useProgram(programSky)
		gl.uniform1f(skyCache.uTime, sky.time)
		gl.uniform3f(skyCache.uSun, sky.sun[0], sky.sun[1], sky.sun[2])
		gl.uniform3f(skyCache.uHorizon, sky.horizonColor[0], sky.horizonColor[1], sky.horizonColor[2])
		gl.uniform3f(skyCache.uZenith, sky.zenithColor[0], sky.zenithColor[1], sky.zenithColor[2])
		gl.uniform1f(skyCache.uNight, sky.night)
		gl.uniform1f(skyCache.uTwilight, sky.twilight)
		gl.uniformMatrix4fv(skyCache.uView, false, view)

		ensureCelestialTexture()
		if (celestialTex) {
			gl.activeTexture(gl.TEXTURE2)
			gl.bindTexture(gl.TEXTURE_2D, celestialTex)
			gl.uniform1i(skyCache.uCelestial, 2)
			gl.uniform1f(skyCache.uHasCelestial, 1)
			gl.uniform1f(skyCache.uMoonPhase, sky.moonPhase)
		} else {
			gl.uniform1f(skyCache.uHasCelestial, 0)
		}

		gl.depthFunc(gl.LEQUAL)
		gl.bindBuffer(gl.ARRAY_BUFFER, skyCache.buffer)
		gl.enableVertexAttribArray(skyCache.aVertex)
		gl.vertexAttribPointer(skyCache.aVertex, 3, gl.FLOAT, false, 0, 0)
		gl.drawArrays(gl.TRIANGLES, 0, 36)
		gl.depthFunc(gl.LESS)
		gl.activeTexture(gl.TEXTURE0)
	}

	let maxLoad = 1
	function startLoad() {
		// Runs when the loading screen is opened; cache the player's position
		p2.x = p.x
		p2.y = p.y
		p2.z = p.z
		maxLoad = world.loadFrom.length + 9
	}
	function initWebgl() {
		if (!win.gl) {
			let canv = document.createElement('canvas')
			canv.width = ctx.canvas.width
			canv.height = ctx.canvas.height
			canv.style.position = "absolute"
			canv.style.zIndex = -1
			canv.style.top = "0px"
			canv.style.left = "0px"
			setGl(canv.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false }))
			let ext = gl.getExtension('OES_element_index_uint')
			if (!ext) {
				alert("Please use a supported browser, or update your current browser.")
			}
			gl.viewport(0, 0, canv.width, canv.height)
			gl.enable(gl.DEPTH_TEST)
			gl.enable(gl.BLEND)
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
			win.gl = gl
		} else {
			setGl(win.gl)
		}

		if (!document.body.contains(gl.canvas)) {
			document.body.append(gl.canvas)
		}

		setModelView(new Float32Array(16))
		for (let k in glCache) delete glCache[k]
		setProgram3D(createProgramObject(gl, vertexShaderSrc3D, fragmentShaderSrc3D))
		setProgram2D(createProgramObject(gl, vertexShaderSrc2D, fragmentShaderSrc2D))
		
		gl.useProgram(program2D)
		glCache.uSampler2 = gl.getUniformLocation(program2D, "uSampler")
		glCache.aTexture2 = gl.getAttribLocation(program2D, "aTexture")
		glCache.aVertex2 = gl.getAttribLocation(program2D, "aVertex")
		glCache.aShadow2 = gl.getAttribLocation(program2D, "aShadow")

		gl.useProgram(program3D)
		glCache.uSampler = gl.getUniformLocation(program3D, "uSampler")
		glCache.uPos = gl.getUniformLocation(program3D, "uPos")
		glCache.uDist = gl.getUniformLocation(program3D, "uDist")
		glCache.aShadow = gl.getAttribLocation(program3D, "aShadow")
		glCache.aTexture = gl.getAttribLocation(program3D, "aTexture")
		glCache.aVertex = gl.getAttribLocation(program3D, "aVertex")
		glCache.uLineOffset = gl.getUniformLocation(program3D, "uLineOffset")
		gl.uniform2f(glCache.uLineOffset, 0, 0)

		glCache.uSky = gl.getUniformLocation(program3D, "uSky")
		glCache.uSun = gl.getUniformLocation(program3D, "uSun")
		glCache.uSkyBrightness = gl.getUniformLocation(program3D, "uSkyBrightness")
		gl.uniform1f(glCache.uSkyBrightness, 1.0)
		gl.uniform3f(glCache.uSky, 0.75, 0.85, 1.0)
		gl.uniform3f(glCache.uSun, 0, 1, 0)

		setProgramSky(createProgramObject(gl, vertexShaderSrcSky, fragmentShaderSrcSky))
		gl.useProgram(programSky)
		skyCache.aVertex = gl.getAttribLocation(programSky, "aVertex")
		skyCache.uTime = gl.getUniformLocation(programSky, "uTime")
		skyCache.uView = gl.getUniformLocation(programSky, "uView")
		skyCache.uSun = gl.getUniformLocation(programSky, "uSun")
		skyCache.uHorizon = gl.getUniformLocation(programSky, "uHorizon")
		skyCache.uZenith = gl.getUniformLocation(programSky, "uZenith")
		skyCache.uNight = gl.getUniformLocation(programSky, "uNight")
		skyCache.uTwilight = gl.getUniformLocation(programSky, "uTwilight")
		skyCache.uCelestial = gl.getUniformLocation(programSky, "uCelestial")
		skyCache.uMoonPhase = gl.getUniformLocation(programSky, "uMoonPhase")
		skyCache.uHasCelestial = gl.getUniformLocation(programSky, "uHasCelestial")
		skyCache.buffer = gl.createBuffer()
		gl.bindBuffer(gl.ARRAY_BUFFER, skyCache.buffer)
		gl.bufferData(gl.ARRAY_BUFFER, skyboxVertices, gl.STATIC_DRAW)

		gl.useProgram(program3D)

		gl.uniform1f(glCache.uDist, 1000)

		//Send the block textures to the GPU
		initTextures()
		initShapes()

		// These buffers are only used for drawing the main menu blocks
		for (let k in sideEdgeBuffers) delete sideEdgeBuffers[k]
		for (let side in shapes.cube.verts) {
			let edgeBuffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shapes.cube.verts[side][0]), gl.STATIC_DRAW)
			sideEdgeBuffers[side] = edgeBuffer
		}
		for (let k in dropEdgeBuffers) delete dropEdgeBuffers[k]
		for (let side in shapes.cube.verts) {
			let edgeBuffer = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuffer)
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shapes.cube.verts[side][0].map(v => v * 0.4)), gl.STATIC_DRAW)
			dropEdgeBuffers[side] = edgeBuffer
		}
		texCoordsBuffers.length = 0
		for (let t in textureCoords) {
			let buff = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buff)
			gl.bufferData(gl.ARRAY_BUFFER, textureCoords[t], gl.STATIC_DRAW)
			texCoordsBuffers.push(buff)
		}

		//Bind the Vertex Array Object (VAO) that will be used to draw everything
		setIndexBuffer(gl.createBuffer())
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexOrder, gl.STATIC_DRAW)

		//Tell it not to render the insides of blocks
		gl.enable(gl.CULL_FACE)
		gl.cullFace(gl.BACK)

		gl.lineWidth(2)
		setBlockOutlines(false)
		gl.enable(gl.POLYGON_OFFSET_FILL)
		gl.polygonOffset(1, 1)
		gl.clearColor(sky[0], sky[1], sky[2], 1.0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
	}
	function initBackgrounds() {
		if (!gl || !width || !height) return

		// Dirt background
		use2d()
		let aspect = width / height
		let stack = height / 96
		let bright = 0.4
		if (dirtBuffer) {
			gl.deleteBuffer(dirtBuffer)
		}
		setDirtBuffer(gl.createBuffer())
		gl.bindBuffer(gl.ARRAY_BUFFER, dirtBuffer)
		let bgCoords = new Float32Array([
			-1, -1, 0, stack, bright,
			1, -1, stack * aspect, stack, bright,
			1, 1, stack * aspect, 0, bright,
			-1, 1, 0, 0, bright
		])
		gl.bufferData(gl.ARRAY_BUFFER, bgCoords, gl.STATIC_DRAW)
		gl.uniform1i(glCache.uSampler2, 1)
		gl.clearColor(0, 0, 0, 1)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.vertexAttribPointer(glCache.aVertex2, 2, gl.FLOAT, false, 20, 0)
		gl.vertexAttribPointer(glCache.aTexture2, 2, gl.FLOAT, false, 20, 8)
		gl.vertexAttribPointer(glCache.aShadow2, 1, gl.FLOAT, false, 20, 16)
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
		let pixels = new Uint8Array(width * height * 4)
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
		setDirtbg(ctx.createImageData(width, height))
		dirtbg.data.set(pixels)
	}


export {
	CUBE, SLAB, STAIR, FLIP, NORTH, SOUTH, EAST, WEST, ROTATION, FACING_UP, FACING_DOWN, BASE_MASK, STATE_MASK, BED_HEAD,
	DOOR_UPPER, DOOR_OPEN, DOOR_HINGE, DOOR_FACING, TRAPDOOR_BOTTOM, TRAPDOOR_OPEN, TRAPDOOR_FACING,
	TORCH_HANGING, LANTERN_HANGING, FLUID_FALLING, LIGHT_MAX, LIGHT_LIFT, MAX_STACK, DAY_LENGTH,
	ATLAS_TILES, ATLAS_MASK, ATLAS_SHIFT, ATLAS_SCALE,
	getPointer, releasePointer,
	Block, Sides,
	vertexShaderSrc3D, fragmentShaderSrc3D, vertexShaderSrc2D, fragmentShaderSrc2D,
	vertexShaderSrcSky, fragmentShaderSrcSky, skyboxVertices,
	createProgramObject, objectify, compareArr, uniformMatrix, vertexAttribPointer,
	initShapes, shapes, indexOrder, blockIcons, genIcons,
	use2d, use3d, skySmoothstep, computeSky, renderSkybox,
	initWebgl, initBackgrounds
}
