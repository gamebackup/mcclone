// Generates src/vanillaModels.js from the Minecraft 26.3 resource pack.
// Usage:
//   git clone --depth 1 --filter=blob:none --sparse --branch 26.3 \
//     https://github.com/InventivetalentDev/minecraft-assets.git .tmp-mc-assets
//   (cd .tmp-mc-assets && git sparse-checkout set assets/minecraft/models/block \
//     assets/minecraft/blockstates)
//   node --experimental-default-type=module tools/genVanillaModels.mjs .tmp-mc-assets
//
// Only blocks that still render as full cubes are candidates; the generated
// table holds real element boxes for non-cube models and a cross marker for
// sprite models. Full cubes, empty entity models and models already handled by
// bespoke engine shapes are omitted.

import fs from 'node:fs'
import path from 'node:path'
import { blockData } from '../src/blocks.js'
import { VANILLA_TEXTURES } from '../src/vanillaBlocks.js'

const assetRoot = path.resolve(process.argv[2] || '.tmp-mc-assets')
const STATES = path.join(assetRoot, 'assets/minecraft/blockstates')
const MODELS = path.join(assetRoot, 'assets/minecraft/models/block')
const OUT = path.resolve('src/vanillaModels.js')

const knownTextures = new Set(VANILLA_TEXTURES)
const modelCache = new Map()
const stateCache = new Map()

function readJson(file) {
	try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
	catch (e) { return null }
}

function camel(value) {
	let part = String(value).replace(/^minecraft:/, '')
	part = part.slice(part.lastIndexOf('/') + 1)
	return part.split('_').map((word, i) => i ? word.charAt(0).toUpperCase() + word.slice(1) : word).join('')
}

function snake(value) {
	return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function getModel(rawName) {
	let name = String(rawName).replace(/^minecraft:/, '')
	if (name.startsWith('block/')) name = name.slice(6)
	if (modelCache.has(name)) return modelCache.get(name)
	let raw = readJson(path.join(MODELS, name + '.json'))
	if (!raw) {
		let empty = { textures: {}, elements: null, cross: false, entity: false }
		modelCache.set(name, empty)
		return empty
	}
	let parent = raw.parent ? String(raw.parent).replace(/^minecraft:/, '') : null
	let base = { textures: {}, elements: null, cross: false, entity: false }
	if (parent === 'builtin/entity' || parent === 'builtin/generated') {
		base.entity = true
	} else if (parent && parent.startsWith('block/')) {
		base = getModel(parent)
	}
	let textures = { ...base.textures, ...(raw.textures || {}) }
	let elements = raw.elements !== undefined ? raw.elements : base.elements
	let cross = base.cross || parent === 'block/cross' || parent === 'block/tinted_cross' ||
		name === 'cross' || name === 'tinted_cross'
	let model = {
		textures,
		elements,
		cross,
		entity: base.entity && raw.elements === undefined,
	}
	modelCache.set(name, model)
	return model
}

function textureName(value, textures, depth) {
	if (value === undefined || value === null || depth > 8) return null
	let key = String(value).trim()
	if (key.startsWith('#')) return textureName(textures[key.slice(1)], textures, depth + 1)
	if (!key || key.startsWith('builtin/')) return null
	return camel(key)
}

function defaultUV(face, from, to) {
	let [x1, y1, z1] = from
	let [x2, y2, z2] = to
	switch (face) {
		case 'down': return [ x1, 16 - z2, x2, 16 - z1 ]
		case 'up': return [ x1, z1, x2, z2 ]
		case 'north': return [ 16 - x2, 16 - y2, 16 - x1, 16 - y1 ]
		case 'south': return [ x1, 16 - y2, x2, 16 - y1 ]
		case 'west': return [ z1, 16 - y2, z2, 16 - y1 ]
		case 'east': return [ 16 - z2, 16 - y2, 16 - z1, 16 - y1 ]
	}
	return [0, 0, 16, 16]
}

function rotatePoint(point, rotation) {
	if (!rotation) return point
	let [ox, oy, oz] = rotation.origin
	let angle = (rotation.angle || 0) * Math.PI / 180
	let cos = Math.cos(angle), sin = Math.sin(angle)
	let x = point[0] - ox, y = point[1] - oy, z = point[2] - oz
	if (rotation.axis === 'x') {
		let ny = y * cos - z * sin, nz = y * sin + z * cos
		y = ny; z = nz
	} else if (rotation.axis === 'z') {
		let nx = x * cos - y * sin, ny = x * sin + y * cos
		x = nx; y = ny
	} else {
		let nx = x * cos + z * sin, nz = -x * sin + z * cos
		x = nx; z = nz
	}
	return [ x + ox, y + oy, z + oz ]
}

function rotateY(point, degrees) {
	if (!degrees) return point
	let angle = degrees * Math.PI / 180
	let cos = Math.cos(angle), sin = Math.sin(angle)
	let x = point[0] - 8, z = point[2] - 8
	return [ 8 + x * cos + z * sin, point[1], 8 - x * sin + z * cos ]
}

function rotateX(point, degrees) {
	if (!degrees) return point
	let angle = degrees * Math.PI / 180
	let cos = Math.cos(angle), sin = Math.sin(angle)
	let y = point[1] - 8, z = point[2] - 8
	return [ point[0], 8 + y * cos - z * sin, 8 + y * sin + z * cos ]
}

// Points are listed top-left, top-right, bottom-right, bottom-left as seen
// from outside the box. This matches the order used by signQuad() in engine.js.
function facePoints(face, from, to) {
	let [x0, y0, z0] = from
	let [x1, y1, z1] = to
	switch (face) {
		case 'down': return [ [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1] ]
		case 'up': return [ [x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [x0,y1,z0] ]
		case 'north': return [ [x1,y1,z1], [x0,y1,z1], [x0,y0,z1], [x1,y0,z1] ]
		case 'south': return [ [x0,y1,z0], [x1,y1,z0], [x1,y0,z0], [x0,y0,z0] ]
		case 'east': return [ [x1,y1,z0], [x1,y1,z1], [x1,y0,z1], [x1,y0,z0] ]
		case 'west': return [ [x0,y1,z1], [x0,y1,z0], [x0,y0,z0], [x0,y0,z1] ]
	}
	return []
}

const FACE_KEYS = { down: 0, up: 1, north: 2, south: 3, east: 4, west: 5 }
const COMPACT = [ 'd', 'u', 'n', 's', 'e', 'w' ]

function buildElements(model, apply, fallbackTextures) {
	let out = []
	let yRot = apply.y || 0
	let xRot = apply.x || 0
	for (let element of model.elements || []) {
		if (!element || !element.from || !element.to || !element.faces) continue
		let from = element.from
		let to = element.to
		let rotation = element.rotation && element.rotation.axis ? element.rotation : null
		let faces = {}
		for (let faceName in element.faces) {
			let face = element.faces[faceName]
			let group = FACE_KEYS[faceName]
			if (group === undefined || !face) continue
			let texture = textureName(face.texture, model.textures, 0)
			if (!texture || !knownTextures.has(texture)) texture = fallbackTextures[group]
			if (!texture) texture = 'blank'
			let uv = face.uv ? face.uv.slice(0, 4) : defaultUV(faceName, from, to)
			let points = facePoints(faceName, from, to).map(point => {
				let p = rotatePoint(point, rotation)
				p = rotateY(p, yRot)
				p = rotateX(p, xRot)
				return p
			})
			faces[COMPACT[group]] = [ texture, uv[0], uv[1], uv[2], uv[3], face.rotation || 0, points ]
		}
		if (!Object.keys(faces).length) continue
		let compactRotation = rotation ? [ rotation.origin[0], rotation.origin[1], rotation.origin[2], rotation.axis, rotation.angle || 0 ] : null
		out.push({ from, to, rotation: compactRotation, faces })
	}
	return out
}

function chooseApplies(state) {
	if (!state) return []
	if (state.variants) {
		let keys = Object.keys(state.variants)
		if (!keys.length) return []
		let score = key => {
			let s = 0
			if (/facing=north/.test(key)) s += 20
			if (/facing=(south|east|west)/.test(key)) s -= 5
			if (/part=foot/.test(key)) s += 15
			if (/part=head/.test(key)) s -= 10
			if (/lit=true|powered=true|open=true|half=top|triggered=true|extended=true/.test(key)) s -= 8
			if (/candles=1/.test(key)) s += 10
			if (/candles=[234]/.test(key)) s -= 4
			if (/tilt=none/.test(key)) s += 6
			if (/tilt=unstable/.test(key)) s += 2
			return s
		}
		let key = keys.slice().sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0]
		let value = state.variants[key]
		if (Array.isArray(value)) value = value[0]
		return value ? [ value ] : []
	}
	if (state.multipart) {
		let all = state.multipart.filter(part => part && part.apply)
		let unconditional = all.filter(part => !part.when).map(part => part.apply)
		if (unconditional.length) return unconditional
		return all.length ? [ all[0].apply ] : []
	}
	return []
}

function isFullCube(elements) {
	if (!elements || elements.length !== 1) return false
	let e = elements[0]
	if (e.rotation) return false
	let f = e.from, t = e.to
	if (!f || !t) return false
	if (f[0] !== 0 || f[1] !== 0 || f[2] !== 0 || t[0] !== 16 || t[1] !== 16 || t[2] !== 16) return false
	return [ 'd', 'u', 'n', 's', 'e', 'w' ].every(face => e.faces && e.faces[face])
}

const SPECIAL_STATE = {
	grass: 'grass_block',
	grassBlock: 'grass_block',
	snowyGrass: 'grass_block',
	sandStone: 'sandstone',
	smoothSandStone: 'smooth_sandstone',
	chiseledSandStone: 'chiseled_sandstone',
	redSandStone: 'red_sandstone',
	iceBlock: 'ice',
	driedKelpBlock: 'dried_kelp_block',
	crackedStoneBrick: 'cracked_stone_bricks',
	flowerPot: 'flower_pot',
	redstoneWire: 'redstone_wire',
	lavaCauldron: 'cauldron',
	waterCauldron: 'cauldron',
	powderSnowCauldron: 'cauldron',
	sidewaysPillar: null,
	grassLeaves: null,
	altLeaves: null,
	justLeaves: null,
	cobwebBlock: null,
	waterBlock: null,
	strawBed: null,
}

function blockStateName(name) {
	if (Object.prototype.hasOwnProperty.call(SPECIAL_STATE, name)) return SPECIAL_STATE[name]
	return snake(name)
}

function shouldSkip(block) {
	if (block.hidden) return true
	let name = block.name
	if (!name || name === 'air') return true
	if (block.cross || block.fence || block.door || block.trap || block.bed || block.liquid ||
		block.torch || block.bars || block.slabOnly || block.stairOnly || block.snowLayer) return true
	if (/Sign$/.test(name) || /Lantern$/.test(name)) return true
	if (name === 'anvil' || name === 'chippedAnvil' || name === 'damagedAnvil' || name === 'cake') return true
	if (/^sculk/.test(name) || name === 'calibratedSculkSensor') return true
	return false
}

let blockNames = new Set()
for (let block of blockData) {
	if (!block || shouldSkip(block)) continue
	blockNames.add(block.name)
}

let output = {}
let missingStates = []
let emptyModels = []
let crossCount = 0
let modelCount = 0

for (let name of [...blockNames].sort()) {
	let stateName = blockStateName(name)
	if (!stateName) continue
	let stateFile = path.join(STATES, stateName + '.json')
	let state = stateCache.get(stateName)
	if (state === undefined) {
		state = readJson(stateFile)
		stateCache.set(stateName, state)
	}
	if (!state) { missingStates.push(name); continue }

	let block = blockData.find(b => b && b.name === name)
	let texs = block.textures
	if (typeof texs === 'string') texs = [ texs, texs, texs, texs, texs, texs ]
	if (!Array.isArray(texs)) texs = []
	let fallback = [ texs[0] || 'blank', texs[1] || texs[0] || 'blank', texs[2] || texs[0] || 'blank',
		texs[3] || texs[2] || texs[0] || 'blank', texs[4] || texs[2] || texs[0] || 'blank',
		texs[5] || texs[2] || texs[0] || 'blank' ]

	let applies = chooseApplies(state)
	if (!applies.length) { emptyModels.push(name + ' (no variant)'); continue }

	let allElements = []
	let cross = false
	for (let apply of applies) {
		let modelName = apply && apply.model
		if (!modelName) continue
		let model = getModel(modelName)
		if (model.cross) { cross = true; continue }
		if (model.entity || !model.elements) continue
		let elements = buildElements(model, apply, fallback)
		allElements.push(...elements)
	}

	if (cross) {
		output[name] = { c: 1 }
		crossCount++
	} else if (allElements.length) {
		if (isFullCube(allElements)) continue
		output[name] = { e: allElements }
		modelCount++
	} else {
		emptyModels.push(name)
	}
}

let lines = [
	'// Generated from InventivetalentDev/minecraft-assets branch 26.3.',
	'// Real block-model boxes for non-cube blocks. Face order is down, up,',
	'// north, south, east, west; each face is [texture, u0, v0, u1, v1, rotation, points].',
	'// Generated by tools/genVanillaModels.mjs. Do not edit by hand.',
	'export const VANILLA_MODELS = ' + JSON.stringify(output) + ';',
	'',
]
fs.writeFileSync(OUT, lines.join('\n'))
console.log('blocks considered:', blockNames.size)
console.log('cross models:', crossCount)
console.log('element models:', modelCount)
console.log('output bytes:', fs.statSync(OUT).size)
console.log('missing blockstates:', missingStates.length)
if (missingStates.length) console.log(missingStates.join(', '))
console.log('empty/entity models:', emptyModels.length)
if (emptyModels.length) console.log(emptyModels.join(', '))
