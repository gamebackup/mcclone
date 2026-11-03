// Sign text rendering.
//
// Block textures live in one atlas, so sign text is drawn as a separate small
// transparent texture on a plane just outside each board. This keeps the text
// crisp and lets it change without remeshing the chunk.

import { blockData } from './blocks.js'
import { gl, p, world, program3D, glCache, tex, settings } from './state.js'
import { uniformMatrix } from './engine.js'

const BASE_MASK = 0x7ff
const FACING = [
	{ x: 0, z: -1 }, // north
	{ x: 0, z: 1 },  // south
	{ x: 1, z: 0 },  // east
	{ x: -1, z: 0 }  // west
]
const cache = new Map()

function cleanLines(lines) {
	let out = []
	for (let i = 0; i < 4; i++) out.push(lines && lines[i] !== undefined ? String(lines[i]).slice(0, 15) : '')
	return out
}

function textCanvas(lines, width, height) {
	let canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	let ctx = canvas.getContext('2d')
	ctx.clearRect(0, 0, width, height)
	let step = height / 4
	let font = Math.max(14, Math.round(step * 0.62))
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.font = 'bold ' + font + 'px Poppins, sans-serif'
	for (let i = 0; i < 4; i++) {
		let line = lines[i]
		if (!line) continue
		let y = step * (i + 0.5)
		// A faint light edge keeps dark text readable on dark wood without
		// turning it into a glowing sign.
		ctx.fillStyle = 'rgba(255, 246, 222, 0.28)'
		ctx.fillText(line, width / 2 + 1, y + 1)
		ctx.fillStyle = '#211207'
		ctx.fillText(line, width / 2, y)
	}
	return canvas
}

function uploadCanvas(canvas) {
	let texture = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, texture)
	let flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL)
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
	return texture
}

function boardInfo(data) {
	if (data.hangingSign) return { width: 0.78, height: 0.50, centerY: -0.1875, offset: 0.075 }
	if (data.wallSign) return { width: 0.86, height: 0.42, centerY: 0.0208, offset: 0.49 }
	return { width: 0.88, height: 0.42, centerY: 0.3333, offset: 0.06 }
}

function buildGeometry(state) {
	let data = blockData[state & BASE_MASK]
	if (!data || !data.sign) return null
	let info = boardInfo(data)
	let facing = FACING[(state & 0xC000) >> 14] || FACING[0]
	// right = cross(up, normal). Keeping this per side means the back face is
	// readable when approached from the other side instead of mirrored.
	let right = { x: facing.z, z: -facing.x }
	let positions = []
	let uvs = []
	for (let side of [1, -1]) {
		let normal = { x: facing.x * side, z: facing.z * side }
		let sideRight = { x: right.x * side, z: right.z * side }
		let cx = normal.x * info.offset
		let cz = normal.z * info.offset
		let hw = info.width / 2
		let hh = info.height / 2
		let bl = [ cx - sideRight.x * hw, info.centerY - hh, cz - sideRight.z * hw ]
		let br = [ cx + sideRight.x * hw, info.centerY - hh, cz + sideRight.z * hw ]
		let tr = [ cx + sideRight.x * hw, info.centerY + hh, cz + sideRight.z * hw ]
		let tl = [ cx - sideRight.x * hw, info.centerY + hh, cz - sideRight.z * hw ]
		for (let v of [ bl, br, tr, bl, tr, tl ]) positions.push(v[0], v[1], v[2])
		uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1)
	}
	let positionBuffer = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)
	let textureBuffer = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW)
	return { positionBuffer, textureBuffer, count: 12 }
}

function disposeEntry(entry) {
	if (!entry) return
	if (entry.texture) gl.deleteTexture(entry.texture)
	if (entry.positionBuffer) gl.deleteBuffer(entry.positionBuffer)
	if (entry.textureBuffer) gl.deleteBuffer(entry.textureBuffer)
}

function makeEntry(state, lines) {
	let data = blockData[state & BASE_MASK]
	if (!data) return null
	let info = boardInfo(data)
	let canvas = textCanvas(lines, 256, Math.max(96, Math.round(256 * info.height / info.width)))
	let texture = uploadCanvas(canvas)
	let geometry = buildGeometry(state)
	if (!geometry) {
		gl.deleteTexture(texture)
		return null
	}
	return {
		signature: state + '|' + lines.join('\u0001'),
		texture,
		positionBuffer: geometry.positionBuffer,
		textureBuffer: geometry.textureBuffer,
		count: geometry.count
	}
}

export function renderSignTexts() {
	if (!world || !world.signs || !p || !gl || !program3D) return
	if (gl.isContextLost && gl.isContextLost()) return
	for (let key of Array.from(cache.keys())) {
		if (!world.signs[key]) {
			disposeEntry(cache.get(key))
			cache.delete(key)
		}
	}
	let keys = Object.keys(world.signs)
	if (!keys.length) return

	let maxDist = (settings.renderDistance + 2) * 16
	let maxDistSq = maxDist * maxDist
	let blend = gl.isEnabled(gl.BLEND)
	let cull = gl.isEnabled(gl.CULL_FACE)
	let depthMask = gl.getParameter(gl.DEPTH_WRITEMASK)
	gl.useProgram(program3D)
	if (!blend) gl.enable(gl.BLEND)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
	if (cull) gl.disable(gl.CULL_FACE)
	gl.depthMask(false)
	if (glCache.uSampler) gl.uniform1i(glCache.uSampler, 0)
	if (glCache.aShadow !== undefined && glCache.aShadow !== -1) {
		gl.disableVertexAttribArray(glCache.aShadow)
		gl.vertexAttrib1f(glCache.aShadow, 1.0)
	}
	gl.enableVertexAttribArray(glCache.aVertex)
	gl.enableVertexAttribArray(glCache.aTexture)
	gl.activeTexture(gl.TEXTURE0)

	for (let key of keys) {
		let coords = key.split(',').map(Number)
		if (coords.length !== 3 || coords.some(isNaN)) continue
		let x = coords[0], y = coords[1], z = coords[2]
		let dx = p.x - x, dz = p.z - z
		if (dx * dx + dz * dz > maxDistSq) continue
		let state = world.getBlock(x, y, z)
		let data = blockData[state & BASE_MASK]
		if (!data || !data.sign) continue
		let lines = cleanLines(world.signs[key])
		if (!lines.some(Boolean)) continue
		let entry = cache.get(key)
		let signature = state + '|' + lines.join('\u0001')
		if (!entry || entry.signature !== signature) {
			disposeEntry(entry)
			entry = makeEntry(state, lines)
			if (!entry) {
				cache.delete(key)
				continue
			}
			cache.set(key, entry)
		}
		gl.bindTexture(gl.TEXTURE_2D, entry.texture)
		p.transformation.translate(x, y, z)
		uniformMatrix('view3d', program3D, 'uView', false, p.getMatrix())
		gl.bindBuffer(gl.ARRAY_BUFFER, entry.positionBuffer)
		gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 0, 0)
		gl.bindBuffer(gl.ARRAY_BUFFER, entry.textureBuffer)
		gl.vertexAttribPointer(glCache.aTexture, 2, gl.FLOAT, false, 0, 0)
		gl.drawArrays(gl.TRIANGLES, 0, entry.count)
		p.transformation.translate(-x, -y, -z)
	}

	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.depthMask(depthMask)
	if (cull) gl.enable(gl.CULL_FACE)
	if (!blend) gl.disable(gl.BLEND)
	// aShadow was disabled so text is unlit. Re-enable it before returning;
	// the next chunk/icon draw binds its own shadow pointer.
	if (glCache.aShadow !== undefined && glCache.aShadow !== -1) {
		gl.enableVertexAttribArray(glCache.aShadow)
	}
}
