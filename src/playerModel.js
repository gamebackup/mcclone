// Remote-player model renderer.
//
// The local player is first-person and deliberately has no model in the world.
// This module owns only *remote* player state, so a future multiplayer layer
// can feed network snapshots into addRemotePlayer/updateRemotePlayer and every
// other client will render a blocky Steve rig. If a remote id matches the
// configured local id it is ignored, preventing accidental self-rendering.
import {
	win, p, gl, tex, textureMap, texCoordsBuffers, blockFill, program3D, glCache
} from './state.js'

const EYE_HEIGHT = 1.62
const REMOTE_ID = "local"
const MAX_STEP = 0.1

let localPlayerId = REMOTE_ID
let remotePlayers = new Map()
let playerBoxBuffer = null
let lastUpdate = 0

function uniformMatrix(cacheId, programObj, name, transpose, matrix) {
	let location = glCache[cacheId]
	if (location === undefined) {
		location = gl.getUniformLocation(programObj, name)
		glCache[cacheId] = location
	}
	gl.uniformMatrix4fv(location, transpose, matrix)
}

function vertexAttribPointer(cacheId, programObj, name, size, buffer) {
	let location = glCache[cacheId]
	if (location === undefined) {
		location = gl.getAttribLocation(programObj, name)
		glCache[cacheId] = location
	}
	if (location === -1) return
	gl.enableVertexAttribArray(location)
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
	gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
}

function now() {
	return (win && win.performance && win.performance.now) ? win.performance.now() : Date.now()
}

function setLocalPlayerId(id) {
	localPlayerId = id === undefined || id === null ? null : String(id)
}

// A remote state uses the same eye-level coordinates as the local camera:
// { x, y, z, ry }. Callers that have feet coordinates can pass feetY instead.
function addRemotePlayer(id, state) {
	if (id === undefined || id === null) return null
	id = String(id)
	if (localPlayerId !== null && id === localPlayerId) return null
	state = state || {}
	let eyeY = state.y === undefined ? 0 : state.y
	let feetY = state.feetY !== undefined
		? state.feetY
		: (state.feet === true ? eyeY : eyeY - EYE_HEIGHT)
	let e = {
		id: id,
		x: state.x === undefined ? 0 : state.x,
		y: feetY,
		z: state.z === undefined ? 0 : state.z,
		targetX: state.x === undefined ? 0 : state.x,
		targetY: feetY,
		targetZ: state.z === undefined ? 0 : state.z,
		ry: state.ry || 0,
		targetRy: state.ry || 0,
		walkTime: 0,
		moving: false,
		sneaking: !!state.sneaking,
		sprinting: !!state.sprinting,
		name: state.name || "",
		age: 0
	}
	remotePlayers.set(id, e)
	return e
}

function updateRemotePlayer(id, state) {
	if (id === undefined || id === null) return null
	id = String(id)
	if (localPlayerId !== null && id === localPlayerId) return null
	let e = remotePlayers.get(id)
	if (!e) return addRemotePlayer(id, state)
	state = state || {}
	if (state.x !== undefined) e.targetX = state.x
	if (state.z !== undefined) e.targetZ = state.z
	if (state.feetY !== undefined) e.targetY = state.feetY
	else if (state.y !== undefined) e.targetY = state.feet === true ? state.y : state.y - EYE_HEIGHT
	if (state.ry !== undefined) e.targetRy = state.ry
	if (state.sneaking !== undefined) e.sneaking = !!state.sneaking
	if (state.sprinting !== undefined) e.sprinting = !!state.sprinting
	if (state.name !== undefined) e.name = state.name
	return e
}

function removeRemotePlayer(id) {
	if (id === undefined || id === null) return false
	return remotePlayers.delete(String(id))
}

function clearRemotePlayers() {
	remotePlayers.clear()
}

function updateRemotePlayers() {
	if (!remotePlayers.size) return
	let t = now()
	let dt = lastUpdate ? Math.min(MAX_STEP, (t - lastUpdate) / 1000) : 0.016
	lastUpdate = t
	for (let e of remotePlayers.values()) {
		e.age += dt
		let dx = e.targetX - e.x
		let dy = e.targetY - e.y
		let dz = e.targetZ - e.z
		let distance = Math.hypot(dx, dz)
		// Network snapshots arrive much less often than frames. Ease toward the
		// newest target so movement does not teleport between updates.
		let blend = Math.min(1, dt * 10)
		e.x += dx * blend
		e.y += dy * blend
		e.z += dz * blend
		e.moving = distance > 0.015
		if (e.moving) e.walkTime += dt * (e.sprinting ? 11 : 7)
		else e.walkTime = 0

		// Shortest-angle yaw easing avoids a player spinning the long way around.
		let turn = e.targetRy - e.ry
		turn = Math.atan2(Math.sin(turn), Math.cos(turn))
		e.ry += turn * Math.min(1, dt * 12)
	}
}

function faceVertices(x0, y0, z0, x1, y1, z1) {
	return [
		// down, up, north, south, east, west
		[ [x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1] ],
		[ [x0,y1,z0], [x0,y1,z1], [x1,y1,z1], [x1,y1,z0] ],
		[ [x0,y0,z0], [x0,y1,z0], [x1,y1,z0], [x1,y0,z0] ],
		[ [x1,y0,z1], [x1,y1,z1], [x0,y1,z1], [x0,y0,z1] ],
		[ [x1,y0,z0], [x1,y1,z0], [x1,y1,z1], [x1,y0,z1] ],
		[ [x0,y0,z1], [x0,y1,z1], [x0,y1,z0], [x0,y0,z0] ],
	]
}

// Draw one axis-aligned box as part of a remote player. The box is rotated
// around the player's vertical axis and then around a limb pivot for walking.
function drawBox(baseX, baseY, baseZ, yaw, x0, y0, z0, x1, y1, z1, texture, pivotY, swing) {
	let u = texCoordsBuffers[textureMap[texture]]
	if (!u) return
	let cosY = Math.cos(yaw)
	let sinY = Math.sin(yaw)
	let cosS = pivotY === undefined ? 1 : Math.cos(swing || 0)
	let sinS = pivotY === undefined ? 0 : Math.sin(swing || 0)
	let faces = faceVertices(x0, y0, z0, x1, y1, z1)
	let positions = new Float32Array(6 * 4 * 3)
	let index = 0
	for (let face of faces) {
		for (let point of face) {
			let x = point[0], y = point[1], z = point[2]
			if (pivotY !== undefined) {
				let py = y - pivotY
				y = pivotY + py * cosS - z * sinS
				z = py * sinS + z * cosS
			}
			let wx = x * cosY - z * sinY
			let wz = x * sinY + z * cosY
			positions[index++] = baseX + wx
			positions[index++] = baseY + y
			positions[index++] = baseZ + wz
		}
	}
	if (!playerBoxBuffer) playerBoxBuffer = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, playerBoxBuffer)
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW)
	gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 0, 0)
	vertexAttribPointer("aTexture", program3D, "aTexture", 2, u)
	for (let i = 0; i < 6; i++) gl.drawArrays(gl.TRIANGLE_FAN, i * 4, 4)
}

function drawPlayer(e) {
	let baseY = e.y + (e.sneaking ? -0.12 : 0)
	let yaw = e.ry
	let walk = e.moving ? Math.sin(e.walkTime) : 0
	let armSwing = walk * 0.55
	let legSwing = walk * 0.6

	// Head, torso, arms and legs are sized to the same 1.8-block player
	// silhouette used by the first-person collision code.
	drawBox(e.x, baseY, e.z, yaw, -0.25, 1.35, -0.25, 0.25, 1.85, 0.25, "playerHeadSkin")
	drawBox(e.x, baseY, e.z, yaw, -0.25, 0.75, -0.125, 0.25, 1.35, 0.125, "playerBodySkin")
	drawBox(e.x, baseY, e.z, yaw, -0.45, 0.75, -0.125, -0.25, 1.35, 0.125, "playerArmSkin", 1.35, armSwing)
	drawBox(e.x, baseY, e.z, yaw, 0.25, 0.75, -0.125, 0.45, 1.35, 0.125, "playerArmSkin", 1.35, -armSwing)
	drawBox(e.x, baseY, e.z, yaw, -0.25, 0, -0.125, 0, 0.75, 0.125, "playerLegSkin", 0.75, -legSwing)
	drawBox(e.x, baseY, e.z, yaw, 0, 0, -0.125, 0.25, 0.75, 0.125, "playerLegSkin", 0.75, legSwing)
}

function renderRemotePlayers() {
	if (!remotePlayers.size || !blockFill || !gl || !p) return
	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, tex)
	uniformMatrix("view3d", program3D, "uView", false, p.getMatrix())
	let cull = gl.isEnabled(gl.CULL_FACE)
	if (cull) gl.disable(gl.CULL_FACE)
	let shadow = glCache.aShadow
	let shadowWasEnabled = shadow !== undefined && shadow !== -1 && gl.getVertexAttrib(shadow, gl.VERTEX_ATTRIB_ARRAY_ENABLED)
	if (shadow !== undefined && shadow !== -1) {
		gl.disableVertexAttribArray(shadow)
		gl.vertexAttrib1f(shadow, 1)
	}
	for (let e of remotePlayers.values()) {
		if (localPlayerId !== null && e.id === localPlayerId) continue
		drawPlayer(e)
	}
	if (shadowWasEnabled) gl.enableVertexAttribArray(shadow)
	if (cull) gl.enable(gl.CULL_FACE)
}

if (win) {
	win.remotePlayers = remotePlayers
	win.addRemotePlayer = addRemotePlayer
	win.updateRemotePlayer = updateRemotePlayer
	win.removeRemotePlayer = removeRemotePlayer
	win.clearRemotePlayers = clearRemotePlayers
	win.setLocalPlayerId = setLocalPlayerId
	win.updateRemotePlayers = updateRemotePlayers
}

export {
	addRemotePlayer, updateRemotePlayer, removeRemotePlayer, clearRemotePlayers,
	updateRemotePlayers, renderRemotePlayers, setLocalPlayerId, remotePlayers
}
