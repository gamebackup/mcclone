import { blockData, BLOCK_COUNT, blockIds } from './blocks.js'
import {
	win, doc, gl, world, setWorld, p, setP, p2, setP2, screen, setScreen,
	previousScreen, setPreviousScreen, hitBox, setHitBox, holding, setHolding,
	gameMode, setGameMode, newWorldGameMode, setNewWorldGameMode,
	commandOpen, setCommandOpen, Key, modelView, glCache, worlds, selectedWorld, setSelectedWorld,
	freezeFrame, setFreezeFrame, move, place, setPlace,
	inventory, invBg, setInvBg, invBgReady, setInvBgReady,
	currentFov, setCurrentFov, settings, locked, setLocked, setLoadString,
	generatedChunks, setGeneratedChunks, mouseX, mouseY, setMouse,
	mouseDown, setMouseDown, width, height, setDimensions,
	generator, maxHeight, blockOutlines, setBlockOutlines, blockFill, setBlockFill,
	updateHUD, setUpdateHUD, blockMode, setBlockMode, drops, dropLastFrame, dropStats,
	tnts, tntLastFrame, fluidCellList, fluidCellSeen, fluidLastTick, fluidsReady, setFluidsReady,
	creativeScroll, setCreativeScroll, creativeSearch, setCreativeSearch,
	creativeSearchActive, setCreativeSearchActive, creativeDrag, setCreativeDrag,
	creativeIdsCache, setCreativeIdsCache, creativeIdsKey, setCreativeIdsKey,
	analytics, caveNoise, setCaveNoise, worldSeed, setWorldSeed,
	currentRandom, setCurrentRandom, atlasCanvas, atlasCtxRef,
	celestialImg, celestialTex, animatedStrips, animatedReady, animTemp, animTempCtx, animationTimer,
	sideEdgeBuffers, indexBuffer, matrix, projection, defaultModelView,
	program3D, program2D, programSky, skyCache, maxLoad, setMaxLoad,
	unpauseDelay, setUnpauseDelay, debugMenu, setDebugMenu, recipes, sphere,
	textures, blockImages, texturesPending, setTexturesPending, setPixel, getPixels,
	tex, textureMap, dirtBuffer, dirtTexture, textureCoords, texCoordsBuffers,
	dirtbg, bigArray, superflat, setSuperflat, trees, setTrees, caves, setCaves, version
} from './state.js'

import {
	seedHash, hash, Marsaglia, randomSeed, random,
	noiseSeed, noise, openSimplexNoise, PVector
} from './noise.js'

import {
	ITEM_ID_BASE, itemData, itemIds, defineItem, isItem, itemDef, itemName,
	itemTexture, itemStack, idIsItem, idTexture, idStack, idAtlasSlot, blockDrops, idDrop
} from './items.js'

import {
	CUBE, SLAB, STAIR, FLIP, NORTH, SOUTH, EAST, WEST, ROTATION, BASE_MASK, STATE_MASK,
	DOOR_UPPER, DOOR_OPEN, DOOR_HINGE, DOOR_FACING, TRAPDOOR_BOTTOM, TRAPDOOR_OPEN, TRAPDOOR_FACING,
	TORCH_HANGING, LIGHT_MAX, LIGHT_LIFT, MAX_STACK,
	ATLAS_TILES, ATLAS_MASK, ATLAS_SHIFT, ATLAS_SCALE,
	initShapes, genIcons, createProgramObject, objectify, compareArr,
	uniformMatrix, vertexAttribPointer,
	initBackgrounds, use2d, use3d, initWebgl,
	skySmoothstep, computeSky, renderSkybox, getPointer, releasePointer
} from './engine.js'

import { loadBlockImages, loadAnimatedTextures, loadCelestialTexture } from './textures.js'
import { chunkDist, sortChunks, fillReqs, maxDist, renderFilter, debug, fogDist, World, defineWorld, loadFromDB, initWorldsMenu } from './world.js'
import { getBlock, hideFace, getShadows, interpolateShadows, Section, emptySection, fullSection, Chunk } from './chunk.js'
import {
	Matrix, Plane, Camera, rayTrace, runRayTrace, lookingAt,
	inBox, onBox, collided, contacts, sprintWallHit,
	resolveContactsAndUpdatePosition, runGravity, outlinePasses,
	box2, block2, changeWorldBlock, newWorldBlock, useHeld, isCave, carveSphere,
	controls, mouseS, initPlayer, releaseHeld
} from './player.js'
import { startMining, stopMining } from './player.js'

import {
	spawnDrop, dropHeld, isDropSolid, updateDrops, drawDropCube, renderDrops,
	isTntBlock, primeTnt, drawTntCube, renderTnts, updateTnts, explodeTnt,
	isSupporter, isTorchSupport, placementMode, isDoorState, isTrapState,
	toggleDoor, placeDoor, facingFromYaw, facingToPlayer, toggleTrapdoor, placeTrapdoor, inCobweb,
	markFluid, fluidWakeAround, fluidMaxLevel, collectFluidComponent, settleFluid,
	tickFluids, fluidAt, playerFluid, bucketUse, isFenceConnectable, updateFence, refreshFences
} from './features.js'

import {
	fill, stroke, line, text, textSize, strokeWeight, cursor,
	Slider, Button, initButtons, drawIcon, heldStack, updateHolding, addItem, pickBlock, invCapacity, consumeHeld, blockDrop,
	updateCraftResult, consumeCraft, craftOnce,
	invLayout, slotPos, slotAt, getStack, setStack, stackIntoRange, quickMove,
	beginItemDrag, updateItemDrag, endItemDrag, slotAtScreen, collectMatchingItems,
	hotbar, hud, drawInv, clickInv,
	closeChest, clickChest, closeFurnace, clickFurnace, handleSignKey,
	closeCraftingTable, clickCraftingTable,
	creativeIds, creativeLayout, creativeScrollbar, creativeSlotAt, drawCreative, clickCreative,
	openCommand, closeCommand, runCommand, drawScreens, changeScene, play, title
} from './ui.js'

// Setup canvas and DOM globals
if (typeof window !== "undefined") {
	window.canvas = document.getElementById("overlay")
	if (window.canvas) {
		window.ctx = window.canvas.getContext("2d")
		window.canvas.width = window.innerWidth
		window.canvas.height = window.innerHeight
	}
	window.savebox = document.getElementById("savebox")
	window.boxCenterTop = document.getElementById("boxcentertop")
	window.saveDirections = document.getElementById("savedirections")
	window.message = document.getElementById("message")
	window.worlds = document.getElementById("worlds")
	window.quota = document.getElementById("quota")
}

// index.html keeps the classic-script `loadString` hook used by embeds.
if (typeof window !== "undefined") {
	setLoadString(window.loadString || "")
}

randomSeed(Math.random() * 100000000 | 0)

function startLoad() {
	p2.x = p.x; p2.y = p.y; p2.z = p.z
	setMaxLoad(world.loadFrom.length + 9)
}

function initEverything() {
	console.log("Initializing world.")

	let seed = Math.random() * 2000000000 | 0
	setWorldSeed(seed)
	seedHash(seed)
	setCaveNoise(openSimplexNoise(seed))
	noiseSeed(seed)

	setGeneratedChunks(0)

	initPlayer()
	initWebgl()

	initBackgrounds()
	
	drawScreens[screen]()
	Button.draw()
	Slider.draw()

	p.FOV(settings.fov)
	initWorldsMenu()
	initButtons()
	// Buttons are registered after the first menu frame, so draw them once more
	// after setup (an async background image can otherwise leave the menu bare).
	Button.draw()
	Slider.draw()
}

// Pointer Lock change listener
if (typeof document !== "undefined") {
	document.addEventListener("pointerlockchange", function() {
		if (document.pointerLockElement === canvas) {
			setLocked(true)
		} else {
			setLocked(false)
			// Escaping pointer lock (or the browser dropping it) pauses the game
			// instead of leaving it running with no mouse look.
			if (screen === "play" && !freezeFrame && !commandOpen) {
				changeScene("pause")
				setUnpauseDelay(Date.now() + 1000)
			}
		}
	})
	document.addEventListener("pointerlockerror", function() {
		setLocked(false)
	})
}

// While the player is actively in the game, stop the browser from handling
// gameplay keys as shortcuts (space scrolling, quick-find, Ctrl+S, etc.).
// Text-entry screens and the command bar must keep normal keyboard behavior.
if (typeof window !== "undefined") {
	window.addEventListener("keydown", function(e) {
		if (screen !== "play" || commandOpen || !locked) return
		if (e.key === "Escape") return
		let target = e.target
		if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
		e.preventDefault()
	}, true)
}

// Mouse movement
function mmoved(e) {
	if (screen !== "play" || !locked) return
	let mx = e.movementX || 0
	let my = e.movementY || 0
	p.ry += mx * settings.mouseSense / 300000
	p.rx -= my * settings.mouseSense / 300000
	p.rx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.rx))
	while (p.ry < 0) p.ry += Math.PI * 2
	while (p.ry > Math.PI * 2) p.ry -= Math.PI * 2
}

function trackMouse(e) {
	if (commandOpen) return
	setMouse(e.clientX, e.clientY)
	if (screen === "play" && locked) {
		mmoved(e)
		return
	}
	if (screen === "inventory" && gameMode === "creative" && creativeDrag) {
		let cl = creativeLayout()
		let sb = creativeScrollbar(cl)
		let span = Math.max(1, sb.trackH - sb.thumbH)
		setCreativeScroll(Math.max(0, Math.min(cl.scrollMax, (e.clientY - creativeDrag.grab - sb.trackY) / span * cl.scrollMax)))
		drawScreens.inventory()
		return
	}
	updateItemDrag(e.clientX, e.clientY)
	cursor("")
		drawScreens[screen]()
	Button.draw()
	Slider.draw()
	Slider.drag()
}

if (typeof document !== "undefined") {
	document.onmousemove = trackMouse
}

let lastInventoryClick = null
function inventoryScreen() {
	return screen === "inventory" || screen === "crafting" || screen === "chest" || screen === "furnace"
}
function inventoryClickKey(ref) {
	if (ref.region === "palette") return screen + ":palette:" + ref.id + ":" + ref.x + ":" + ref.y
	return screen + ":" + ref.region + ":" + (ref.index === undefined ? "" : ref.index)
}
function consumeInventoryDoubleClick(button) {
	if (button !== 0 || !inventoryScreen()) return false
	let ref = slotAtScreen(mouseX, mouseY)
	if (!ref) return false
	let now = Date.now()
	let key = inventoryClickKey(ref)
	let repeated = lastInventoryClick && lastInventoryClick.screen === screen && lastInventoryClick.key === key && now - lastInventoryClick.time < 400
	if (!repeated || !inventory.cursor) return false
	endItemDrag()
	collectMatchingItems(inventory.cursor.id)
	lastInventoryClick = null
	drawScreens[screen]()
	return true
}
function rememberInventoryClick(button) {
	lastInventoryClick = null
	if (button !== 0 || !inventoryScreen() || !inventory.cursor) return
	let ref = slotAtScreen(mouseX, mouseY)
	if (!ref) return
	lastInventoryClick = { screen: screen, key: inventoryClickKey(ref), time: Date.now() }
}

if (typeof canvas !== "undefined" && canvas) {
	canvas.onmousedown = function(e) {
		setMouseDown(true)
		setMouse(e.clientX, e.clientY)
		if (consumeInventoryDoubleClick(e.button)) return
		if (screen === "sign") return
		if (screen === "play") {
			if (!locked) {
				getPointer()
				return
			}
			if (e.button === 0) {
				Key.leftMouse = true
				if (Key.control) {
					newWorldBlock()
				} else if (gameMode === "creative") {
					changeWorldBlock(0)
				} else {
					startMining()
				}
			} else if (e.button === 1) {
				e.preventDefault()
				pickBlock()
			} else if (e.button === 2) {
				Key.rightMouse = true
				// Reset the interaction latch, then let useHeld() set it again if
				// this press toggled a door/trapdoor or used a bucket/flint.
				p.interactHold = false
				useHeld()
			}
		} else if (screen === "inventory") {
			if (gameMode === "creative") {
				// The creative palette has a search box and a scrollbar that sit
				// outside the slot grid, so handle those before slot clicks.
				let cl = creativeLayout()
				let inSearch = e.clientX >= cl.searchX && e.clientX < cl.searchX + cl.searchW && e.clientY >= cl.searchY && e.clientY < cl.searchY + cl.searchH
				if (inSearch) {
					setCreativeSearchActive(true)
					drawScreens.inventory()
					return
				}
				setCreativeSearchActive(false)
				let sb = creativeScrollbar(cl)
				let overTrack = e.clientX >= sb.trackX - 2 && e.clientX < sb.trackX + sb.trackW + 2 && e.clientY >= sb.trackY && e.clientY < sb.trackY + sb.trackH
				if (overTrack && cl.scrollMax > 0) {
					if (e.clientY < sb.thumbY || e.clientY > sb.thumbY + sb.thumbH) {
						setCreativeScroll(Math.max(0, Math.min(cl.scrollMax, (e.clientY - sb.trackY - sb.thumbH / 2) / Math.max(1, sb.trackH - sb.thumbH) * cl.scrollMax)))
					}
					setCreativeDrag({ grab: e.clientY - creativeScrollbar(cl).thumbY })
					drawScreens.inventory()
					return
				}
				clickCreative(e.button, e.shiftKey)
			} else {
				clickInv(e.button, e.shiftKey)
			}
		} else if (screen === "chest") {
			clickChest(e.button, e.shiftKey)
		} else if (screen === "furnace") {
			clickFurnace(e.button, e.shiftKey)
		} else if (screen === "crafting") {
			clickCraftingTable(e.button, e.shiftKey)
		} else {
			Button.click()
			Slider.click()
		}
		beginItemDrag(e.button)
		rememberInventoryClick(e.button)
	}

	canvas.onmouseup = function(e) {
		setMouseDown(false)
		endItemDrag()
		setCreativeDrag(null)
		Slider.release()
		if (e.button === 0) {
			Key.leftMouse = false
			stopMining()
		}
		if (e.button === 2) {
			Key.rightMouse = false
			releaseHeld()
			p.interactHold = false
		}
	}

	canvas.onkeydown = function(e) {
		// Browser shortcuts (Ctrl/Cmd/Alt + key) should not also trigger
		// gameplay actions such as dropping an item or opening the inventory.
		// Keep the modifier key itself so Ctrl+click and the unload guard work.
		let modifierKey = e.key === "Control" || e.key === "Meta" || e.key === "Alt"
		if ((e.ctrlKey || e.metaKey || e.altKey) && !modifierKey) return
		let k = e.key.toLowerCase()
		// The sign editor owns every key while it is open. In particular,
		// letters must type into the sign instead of moving the player or
		// running hotbar/command shortcuts.
		if (screen === "sign") {
			e.preventDefault()
			e.stopPropagation()
			handleSignKey(e)
			return
		}
		// Held keys fire keydown repeatedly; only a fresh press counts as a tap
		// (otherwise auto-repeat would instantly trigger a sprint).
		let freshPress = !e.repeat && !Key[k]
		Key[k] = true
		if (screen === "play") {
			if (commandOpen) return
			if (k === "/") {
				openCommand("/")
				e.preventDefault()
				return
			}
			if (k === "t") {
				openCommand("")
				e.preventDefault()
				return
			}
			if (k === "w" && freshPress) {
				let tap = Date.now()
				if (tap - p.lastForwardTap < 350) {
					p.sprintRequest = tap
				}
				p.lastForwardTap = tap
			}
			if (k === "p") { releasePointer(); changeScene("pause") }
			if (k === "b") { p.autoBreak = !p.autoBreak; setUpdateHUD(true) }
			if (k === " " && freshPress && !p.spectator && gameMode === "creative") {
				if (Date.now() < p.lastJump + 400) { p.flying ^= true } else { p.lastJump = Date.now() }
			}
			if (k === "z") { p.FOV(10, 300) }
			if (k === "shift" && !p.flying) {
				p.sneaking = true
				if (p.sprinting) { p.FOV(settings.fov, 100) }
				p.sprinting = false; p.speed = 0.03; p.bottomH = 1.32
			}
			if (k === "l" && gameMode === "creative") { p.spectator = !p.spectator; p.flying = true; p.onGround = false; setUpdateHUD(true) }
			if (k === "e" && freshPress) { changeScene("inventory"); releasePointer() }
			if (k === ";") { releasePointer(); setFreezeFrame(true) }
			if (Number(k)) { inventory.hotbarSlot = Number(k) - 1; updateHolding(); setUpdateHUD(true) }
			if (k === "q") { dropHeld() }
		} else if (screen === "pause") {
			if (k === "p") { play() }
		} else if (screen === "inventory") {
			if (gameMode === "creative" && creativeSearchActive) {
				if (k === "escape") { setCreativeSearchActive(false); setCreativeSearch(""); setCreativeScroll(0) }
				else if (k === "backspace") { setCreativeSearch(creativeSearch.slice(0, -1)); setCreativeScroll(0) }
				else if (k === "enter") { setCreativeSearchActive(false) }
				else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { setCreativeSearch(creativeSearch + e.key); setCreativeScroll(0) }
				drawScreens.inventory()
				return
			}
			if (k === "e") { play() }
			if (k === "enter") { drawScreens.inventory() }
		} else if (screen === "chest") {
			if (k === "e" || k === "escape") { closeChest() }
		} else if (screen === "furnace") {
			if (k === "e" || k === "escape") { closeFurnace() }
		} else if (screen === "crafting") {
			if (k === "e" || k === "escape") { closeCraftingTable() }
		}
	}

	canvas.onkeyup = function(e) {
		let k = e.key.toLowerCase()
		Key[k] = false
		if (screen === "sign") return
		if (k === "escape" && (screen === "pause" || screen === "inventory" || screen === "options" && previousScreen === "pause") && Date.now() > unpauseDelay) { play() }
		if (screen === "play") {
			if (k === "z") { p.FOV(settings.fov, 300) }
			if (k === "shift" && p.sneaking) { p.sneaking = false; p.speed = 0.075; p.bottomH = 1.62 }
		}
	}

	canvas.onblur = function() {
		for (let key in Key) { Key[key] = false }
		Key.leftMouse = false
		Key.rightMouse = false
		if (p) {
			p.interactHold = false
			if (p.bowCharge || p.blocking) releaseHeld()
		}
		setMouseDown(false)
		Slider.release()
	}

	canvas.oncontextmenu = function(e) { e.preventDefault() }

	canvas.onwheel = function(e) {
		e.preventDefault(); e.stopPropagation()
		if (screen === "sign") return
		if (screen === "inventory" && gameMode === "creative") {
			let cl = creativeLayout()
			let d = e.deltaY / 200; d = Math.max(-1, Math.min(1, d))
			setCreativeScroll(Math.max(0, Math.min(cl.scrollMax, creativeScroll + d)))
			drawScreens.inventory()
			return
		}
		if (screen === "chest" || screen === "furnace" || screen === "crafting") return
		if (e.deltaY > 0) { inventory.hotbarSlot++ } else if (e.deltaY < 0) { inventory.hotbarSlot-- }
		if (inventory.hotbarSlot > 8) { inventory.hotbarSlot = 0 } else if (inventory.hotbarSlot < 0) { inventory.hotbarSlot = 8 }
		setUpdateHUD(true); updateHolding()
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("mouseup", function() { endItemDrag(); if (p && (p.bowCharge || p.blocking || p.drinking)) releaseHeld() })
	window.onbeforeunload = function(e) {
		if (screen === "play" && Key.control) {
			releasePointer(); e.preventDefault()
			e.returnValue = "Double-tap W to sprint; Ctrl + W closes the page."
			return true
		}
	}

	window.onresize = function() {
		let w = window.innerWidth, h = window.innerHeight
		setDimensions(w, h)
		if (canvas) { canvas.height = h; canvas.width = w }
		if (gl && gl.canvas) {
			gl.canvas.height = h; gl.canvas.width = w
			gl.viewport(0, 0, w, h)
		}
		if (!gl || !p) return
		initButtons(); initBackgrounds()
		inventory.size = 40 * Math.min(w, h) / 600
		setInvBgReady(false); genIcons(); use3d()
		if (p) p.FOV(currentFov + 0.0001)
		if (screen === "play") { play() } else { drawScreens[screen](); Button.draw(); Slider.draw() }
	}
}

// Game loop
let lastFurnaceDraw = 0
function gameLoop() {
	let frameStart = (win.performance || performance).now()
	// Tabs created in the background can report a 0x0 viewport at load.
	if (gl && canvas && (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight)) {
		window.onresize()
	}
	if (!gl) { initEverything(); releasePointer() }
	// Furnaces tick even while a container screen is open, because world.tick()
	// only runs during the play screen. The accumulator makes this safe to call
	// every frame.
	if (world && world.active && world.tickFurnaces) world.tickFurnaces()
	if (world && world.active && world.tickCrops) world.tickCrops()
	if (screen === "furnace") {
		let furnaceNow = (win.performance || performance).now()
		if (furnaceNow - lastFurnaceDraw > 100) {
			lastFurnaceDraw = furnaceNow
			drawScreens.furnace()
		}
	} else if (screen === "play" || screen === "loading") {
		drawScreens[screen]()
	}
	if (Date.now() - analytics.lastUpdate > 500 && analytics.frames) {
		analytics.displayedTickTime = (analytics.totalTickTime / analytics.frames).toFixed(1)
		analytics.displayedRenderTime = (analytics.totalRenderTime / analytics.frames).toFixed(1)
		analytics.displayedFrameTime = (analytics.totalFrameTime / analytics.frames).toFixed(1)
		analytics.fps = Math.round(analytics.frames * 1000 / (Date.now() - analytics.lastUpdate))
		analytics.displayedwFrameTime = analytics.worstFrameTime.toFixed(1)
		analytics.frames = 0; analytics.totalRenderTime = 0; analytics.totalTickTime = 0
		analytics.totalFrameTime = 0; analytics.worstFrameTime = 0; analytics.lastUpdate = Date.now()
		setUpdateHUD(true)
	}
	analytics.frames++
	let now = (win.performance || performance).now()
	analytics.totalFrameTime += now - frameStart
	analytics.worstFrameTime = Math.max(now - frameStart, analytics.worstFrameTime)
	win.raf = requestAnimationFrame(gameLoop)
}

// Start texture loading and initialization
if (typeof window !== "undefined") {
	loadAnimatedTextures()
	loadCelestialTexture()
	loadBlockImages()
	if (win.raf) {
		window.cancelAnimationFrame(win.raf)
	}
	win.raf = requestAnimationFrame(gameLoop)
}

export { initEverything, gameLoop }
