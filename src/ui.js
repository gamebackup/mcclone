import { blockData, BLOCK_COUNT, blockIds } from './blocks.js'
import {
	win, doc, gl, world, setWorld, p, p2, screen, setScreen, previousScreen, setPreviousScreen,
	gameMode, setGameMode, newWorldGameMode, setNewWorldGameMode,
	commandOpen, setCommandOpen, inventory, hitBox, invBg, setInvBg, invBgReady, setInvBgReady,
	generatedChunks, mouseX, mouseY, mouseDown, setMouseDown, width, height,
	updateHUD, setUpdateHUD, freezeFrame, setFreezeFrame, glCache, setMaxLoad, renderedChunks, setRenderedChunks,
	creativeScroll, setCreativeScroll, creativeSearch, setCreativeSearch,
	creativeSearchActive, setCreativeSearchActive, creativeDrag, setCreativeDrag,
	creativeIdsCache, setCreativeIdsCache, creativeIdsKey, setCreativeIdsKey,
	analytics, recipes, settings, setCurrentFov, holding, setHolding,
	sky, worlds, selectedWorld, setSelectedWorld, maxLoad,
	fluidsReady, setFluidsReady, superflat, setSuperflat,
	trees, setTrees, caves, setCaves, version, dirtbg
} from './state.js'
import {
	CUBE, SLAB, STAIR, FLIP, NORTH, SOUTH, EAST, WEST, ROTATION, BASE_MASK, STATE_MASK,
	DOOR_UPPER, DOOR_OPEN, DOOR_HINGE, DOOR_FACING, TRAPDOOR_BOTTOM, TRAPDOOR_OPEN, TRAPDOOR_FACING,
	TORCH_HANGING, LIGHT_MAX, LIGHT_LIFT, MAX_STACK, DAY_LENGTH,
	blockIcons, uniformMatrix, getPointer, releasePointer, use3d
} from './engine.js'
import { ITEM_ID_BASE, itemData, isItem, itemDef, itemTexture, idIsItem, idTexture, idStack, idAtlasSlot, idDrop, craftingResult, smeltResult, fuelValue } from './items.js'
import { showInCreative } from './creativeMenu.js'
import { drawStatusOverlay, drawStatusBars, drawDurabilityBar, drawArmorSlotGhost } from './hud.js'
import { BIOMES, biomeAt } from './noise.js'
import { saveToDB, deleteFromDB, defineWorld, save, clearPendingSave, World, sortChunks, initWorldsMenu } from './world.js'
import { updateDrops, updateTnts, updateFallingBlocks, updateArrows, updatePotionClouds, updateFireworks, updateFishingBobbers, updateVehicles, updateEndCrystals, tickFluids, placementMode, spawnDrop } from './features.js'
import { controls, runGravity, resolveContactsAndUpdatePosition, initModelView, FOV, timeString, updateMining, updateSurvival, respawnPlayer, hurt, updateArmorStats } from './player.js'
import { updateRemotePlayers } from './playerModel.js'

let canvas = typeof document !== "undefined" ? document.getElementById("overlay") : null
let ctx = canvas ? canvas.getContext("2d") : null
let savebox = typeof document !== "undefined" ? document.getElementById("savebox") : null
let boxCenterTop = typeof document !== "undefined" ? document.getElementById("boxcentertop") : null
let saveDirections = typeof document !== "undefined" ? document.getElementById("savedirections") : null
let message = typeof document !== "undefined" ? document.getElementById("message") : null
let worldsDom = typeof document !== "undefined" ? document.getElementById("worlds") : null
let quota = typeof document !== "undefined" ? document.getElementById("quota") : null
let hoverbox = typeof document !== "undefined" ? document.getElementById("onhover") : null

if (typeof window !== "undefined") {
	window.canvas = canvas
	window.ctx = ctx
	window.savebox = savebox
	window.boxCenterTop = boxCenterTop
	window.saveDirections = saveDirections
	window.message = message
	window.worlds = worldsDom
	window.quota = quota
	window.hoverbox = hoverbox
	if (canvas && ctx) {
		ctx.canvas.width = window.innerWidth
		ctx.canvas.height = window.innerHeight
	}
}

	let fill = function(r, g, b) {
		if (g === undefined) {
			g = r
			b = r
		}
		ctx.fillStyle = "rgb(" + r + ", " + g + ", " + b + ")"
	}
	let stroke = function(r, g, b) {
		if (g === undefined) {
			g = r
			b = r
		}
		ctx.strokeStyle = "rgb(" + r + ", " + g + ", " + b + ")"
	}
	let line = function(x1, y1, x2, y2) {
		ctx.moveTo(x1, y1)
		ctx.lineTo(x2, y2)
	}
	function text(txt, x, y, h) {
		h = h || 0

		let lines = txt.split("\n")
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], x, y + h * i)
		}
	}
	function textSize(size) {
		ctx.font = size + 'px Poppins' // VT323
	}
	let strokeWeight = function(num) {
		ctx.lineWidth = num
	}
	const ARROW = "arrow"
	const HAND = "pointer"
	const CROSS = "crosshair"
	let cursor = function(type) {
		canvas.style.cursor = type
	}


	let drawScreens = {
		"main menu": () => {},
		"options": () => {},
		"play": () => {},
		"pause": () => {},
		"creation menu": () => {},
		"inventory": () => {},
		"chest": () => {},
		"multiplayer menu": () => {},
		"comingsoon menu": () => {},
		"loadsave menu": () => {},
	}

	let menuBackground = typeof Image !== "undefined" ? new Image() : null
	if (menuBackground) {
		menuBackground.onload = () => {
			if (screen === "main menu") {
				drawScreens[screen]()
				Button.draw()
				Slider.draw()
			}
		}
		menuBackground.src = "background.jpg"
	}

	function startLoad() {
		p2.x = p.x; p2.y = p.y; p2.z = p.z
		setMaxLoad(world.loadFrom.length + 9)
	}

	let html = {
		pause: {
			enter: [window.message],
			exit: [window.savebox, window.saveDirections, window.message]
		},
		"loadsave menu": {
			enter: [window.worlds, window.boxCenterTop, window.quota],
			exit: [window.worlds, window.boxCenterTop, window.quota],
			onenter: () => {
				window.boxCenterTop.placeholder = "Enter Save String (Optional)"
				if (navigator && navigator.storage && navigator.storage.estimate) {
					navigator.storage.estimate().then(data => {
						window.quota.innerText = `${data.usage.toLocaleString()} / ${data.quota.toLocaleString()} bytes (${(100 * data.usage / data.quota).toLocaleString(undefined, { maximumSignificantDigits: 2 })}%) of your quota used`
					}).catch(console.error)
				}
				window.boxCenterTop.onmousedown = e => {
					let elem = document.getElementsByClassName("selected")
					if (elem && elem[0]) {
						elem[0].classList.remove("selected")
					}
					setSelectedWorld(0)
					Button.draw()
				}
			},
			onexit: () => {
				window.boxCenterTop.onmousedown = null
			}
		},
		"creation menu": {
			enter: [window.boxCenterTop],
			exit: [window.boxCenterTop],
			onenter: () => {
				window.boxCenterTop.placeholder = "Enter World Name"
				window.boxCenterTop.value = ""
			}
		},
		loading: {
			onenter: startLoad
		},
		editworld: {
			enter: [window.boxCenterTop],
			exit: [window.boxCenterTop],
			onenter: () => {
				window.boxCenterTop.placeholder = "Enter World Name"
				window.boxCenterTop.value = ""
			}
		}
	}

	function changeScene(newScene) {
		if (world && (newScene === "main menu" || newScene === "loadsave menu" || newScene === "creation menu" || newScene === "editworld")) {
			world.active = false
			clearPendingSave()
		}
		setInvBgReady(false)
		setCreativeSearchActive(false)
		setCreativeDrag(null)
		if (screen === "options") {
			saveToDB("settings", settings).catch(e => console.error(e))
		}

		if (html[screen] && html[screen].exit) {
			for (let element of html[screen].exit) {
				element.classList.add("hidden")
			}
		}

		if (html[newScene] && html[newScene].enter) {
			for (let element of html[newScene].enter) {
				element.classList.remove("hidden")
			}
		}

		if (html[newScene] && html[newScene].onenter) {
			html[newScene].onenter()
		}
		if (html[screen] && html[screen].onexit) {
			html[screen].onexit()
		}

		setPreviousScreen(screen)
		setScreen(newScene)
		setMouseDown(false)
		if (newScene === "play") {
			setFluidsReady(true)
		}
		drawScreens[screen]()
		Button.draw()
		Slider.draw()
	}

	function respawn() {
		respawnPlayer()
		play()
	}

	function play() {
		if (gameMode !== "creative") {
			if (inventory.cursor) {
				addItem(inventory.cursor.id, inventory.cursor.count)
				inventory.cursor = null
			}
			updateCraftResult()
			for (let i = 0; i < inventory.craft.length; i++) {
				if (inventory.craft[i]) {
					addItem(inventory.craft[i].id, inventory.craft[i].count)
					inventory.craft[i] = null
				}
			}
		}
		inventory.cursor = null
		updateHolding()
		canvas.onblur()
		p.lastBreak = Date.now()
		setUpdateHUD(true)
		use3d()
		gl.clearColor(sky[0], sky[1], sky[2], 1.0)
		getPointer()
		fill(255, 255, 255)
		textSize(10)
		changeScene("play")
	}



	class Slider {
		constructor(x, y, w, h, scenes, label, min, max, settingName, callback) {
			this.x = x
			this.y = y
			this.h = h
			this.w = Math.max(w, 350)
			this.name = settingName
			this.scenes = Array.isArray(scenes) ? scenes : [scenes]
			this.label = label
			this.min = min
			this.max = max
			this.sliding = false
			this.callback = callback
		}
		draw() {
			if (!this.scenes.includes(screen)) {
				return
			}
			let current = (settings[this.name] - this.min) / (this.max - this.min)

			// Outline
			ctx.beginPath()
			strokeWeight(2)
			stroke(0)
			fill(85)
			ctx.rect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h)
			ctx.stroke()
			ctx.fill()

			// Slider bar
			let value = Math.round(settings[this.name])
			ctx.beginPath()
			fill(130)
			let x = this.x - (this.w - 10) / 2 + (this.w - 10) * current - 5
			ctx.fillRect(x, this.y - this.h / 2, 10, this.h)

			//Label
			fill(255, 255, 255)
			textSize(16)
			ctx.textAlign = 'center'
			text(`${this.label}: ${value}`, this.x, this.y + this.h / 8)
		}
		click() {
			if (!mouseDown || !this.scenes.includes(screen)) {
				return false
			}

			if (mouseX > this.x - this.w / 2 && mouseX < this.x + this.w / 2 && mouseY > this.y - this.h / 2 && mouseY < this.y + this.h / 2) {
				let current = (mouseX - this.x + this.w / 2) / this.w
				if (current < 0) current = 0
				if (current > 1) current = 1
				this.sliding = true
				settings[this.name] = current * (this.max - this.min) + this.min
				this.callback(current * (this.max - this.min) + this.min)
				this.draw()
			}
		}
		drag() {
			if (!this.sliding || !this.scenes.includes(screen)) {
				return false
			}

			let current = (mouseX - this.x + this.w / 2) / this.w
			if (current < 0) current = 0
			if (current > 1) current = 1
			settings[this.name] = current * (this.max - this.min) + this.min
			this.callback(current * (this.max - this.min) + this.min)
		}
		release() {
			this.sliding = false
		}

		static draw() {
			for (let slider of Slider.all) {
				slider.draw()
			}
		}
		static click() {
			for (let slider of Slider.all) {
				slider.click()
			}
		}
		static release() {
			for (let slider of Slider.all) {
				slider.release()
			}
		}
		static drag() {
			if (mouseDown) {
				for (let slider of Slider.all) {
					slider.drag()
				}
			}
		}
		static add(x, y, w, h, scenes, label, min, max, defaut, callback) {
			Slider.all.push(new Slider(x, y, w, h, scenes, label, min, max, defaut, callback))
		}
	}
	Slider.all = []
	class Button {
		constructor(x, y, w, h, labels, scenes, callback, disabled, hoverText, fontSize) {
			this.x = x
			this.y = y
			this.h = h
			this.w = w
			this.index = 0
			this.disabled = disabled || (() => false)
			this.hoverText = !hoverText || typeof hoverText === "string" ? (() => hoverText) : hoverText
			this.scenes = Array.isArray(scenes) ? scenes : [scenes]
			this.labels = Array.isArray(labels) ? labels : [labels]
			this.callback = callback
			this.fontSize = fontSize || 16
		}

		mouseIsOver() {
			return mouseX >= this.x - this.w / 2 && mouseX <= this.x + this.w / 2 && mouseY >= this.y - this.h / 2 && mouseY <= this.y + this.h / 2
		}
		draw() {
			if (!this.scenes.includes(screen)) {
				return
			}
			let hovering = this.mouseIsOver()
			let disabled = this.disabled()
			let hoverText = this.hoverText()

			// Outline
			ctx.beginPath()
			if (hovering && !disabled) {
				strokeWeight(7)
				stroke(255)
				cursor(HAND)
			} else {
				strokeWeight(3)
				stroke(0)
			}
			if (disabled) {
				fill(60)
			} else {
				fill(120)
			}
			ctx.rect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h)
			ctx.stroke()
			ctx.fill()

			//Label
			fill(255)
			textSize(this.fontSize)
			ctx.textAlign = 'center'
			text(this.labels[this.index], this.x, this.y + this.h / 8)
			
			if (hovering && hoverText) {
				hoverbox.innerText = hoverText
				hoverbox.classList.remove("hidden")
				if (mouseY < height / 2) {
					hoverbox.style.bottom = ""
					hoverbox.style.top = mouseY + 10 + "px"
				} else {
					hoverbox.style.top = ""
					hoverbox.style.bottom = height - mouseY + 10 + "px"
				}
				if (mouseX < width / 2) {
					hoverbox.style.right = ""
					hoverbox.style.left = mouseX + 10 + "px"
				} else {
					hoverbox.style.left = ""
					hoverbox.style.right = width - mouseX + 10 + "px"
				}
			}
		}
		click() {
			if (this.disabled() || !mouseDown || !this.scenes.includes(screen)) {
				return false
			}

			if (this.mouseIsOver()) {
				this.index = (this.index + 1) % this.labels.length
				this.callback(this.labels[this.index])
				return true
			}
		}

		static draw() {
			hoverbox.classList.add("hidden")
			for (let button of Button.all) {
				button.draw()
			}
		}
		static click() {
			for (let button of Button.all) {
				if (button.click()) {
					Button.draw()
					break
				}
			}
		}
		static add(x, y, w, h, labels, scenes, callback, disabled, hoverText, fontSize) {
			let button = new Button(x, y, w, h, labels, scenes, callback, disabled, hoverText, fontSize)
			Button.all.push(button)
			return button
		}
	}
	Button.all = []

	var initEverything
	function initButtons() {
		Button.all = []
		Slider.all = []
		const nothing = () => false
		const always = () => true

		// Main menu buttons
		Button.add(width / 2, height / 2 - 20, 400, 40, "Singleplayer", "main menu", r => changeScene("loadsave menu"))
		Button.add(width / 2, height / 2 + 35, 400, 40, "Multiplayer", "main menu", nothing, always, "Multiplayer isn't possible at this time.")
		Button.add(width / 2, height / 2 + 90, 400, 40, "Settings", "main menu", r => changeScene("options"))

		// Creation menu buttons
		Button.add(width / 2, 135, 300, 40, ["World Type: Normal", "World Type: Superflat"], "creation menu", r => setSuperflat(r === "World Type: Superflat"))
		Button.add(width / 2, 185, 300, 40, ["Trees: On", "Trees: Off"], "creation menu", r => setTrees(r === "Trees: On"), function() {
			if (superflat) {
				this.index = 1
				setTrees(false)
			}
			return superflat
		})
		Button.add(width / 2, 235, 300, 40, ["Caves: On", "Caves: Off"], "creation menu", r => setCaves(r === "Caves: On"), function() {
			if (superflat) {
				this.index = 1
				setCaves(false)
			}
			return superflat
		})
		Button.add(width / 2, 285, 300, 40, ["Game Mode: Creative", "Game Mode: Survival"], "creation menu", r => setNewWorldGameMode(r === "Game Mode: Survival" ? "survival" : "creative"), nothing, "Choose the game mode for new worlds.\n\nCreative: unlimited blocks, breaking and placing never consumes items. Press E for the full block palette.\n\nSurvival: break blocks to collect them, place blocks to spend them, and craft in the inventory with E.\n\nYou can switch anytime in-game with /gamemode creative or /gamemode survival.")
		Button.add(width / 2, 335, 300, 40, "Difficulty: Peaceful", "creation menu", nothing, always, "Coming soon\n\nPlease stop asking for mobs. Adding them will take a very long time. I know a lot of people want them, so just be patient.")
		Button.add(width / 2, height - 90, 300, 40, "Create New World", "creation menu", r => {
			setWorld(new World())
			world.id = Date.now()
			setGameMode(newWorldGameMode)
			let name = boxCenterTop.value || "World"
			let number = ""
			while(true) {
				let match = false
				for (let id in worlds) {
					if (worlds[id].name === name + number) {
						match = true
						break
					}
				}
				if (match) {
					number = number ? number + 1 : 1
				} else {
					name = name + number
					break
				}
			}
			world.name = name.replace(/;/g, "\u037e")
			world.active = true
			win.world = world
			save()
			world.loadChunks()
			world.chunkGenQueue.sort(sortChunks)
			changeScene("loading")
		})
		Button.add(width / 2, height - 40, 300, 40, "Cancel", "creation menu", r => changeScene(previousScreen))

		// Loadsave menu buttons
		const selected = () => !selectedWorld || !worlds[selectedWorld]
		let w4 = Math.min(width / 4 - 10, 220)
		let x4 = w4 / 2 + 5
		let w2 = Math.min(width / 2 - 10, 450)
		let x2 = w2 / 2 + 5
		let mid = width / 2
		Button.add(mid - 3 * x4, height - 30, w4, 40, "Edit", "loadsave menu", r => changeScene("editworld"), () => (selected() || !worlds[selectedWorld].edited))
		Button.add(mid - x4, height - 30, w4, 40, "Delete", "loadsave menu", r => {
			if (worlds[selectedWorld] && confirm(`Are you sure you want to delete ${worlds[selectedWorld].name}?`)) {
				deleteFromDB(selectedWorld)
				window.worlds.removeChild(document.getElementById(selectedWorld))
				delete worlds[selectedWorld]
				setSelectedWorld(0)
			}
		}, () => (selected() || !worlds[selectedWorld].edited), "Delete the world forever.")
		Button.add(mid + x4, height - 30, w4, 40, "Export", "loadsave menu", r => {
			boxCenterTop.value = worlds[selectedWorld].code
		}, selected, "Export the save code into the text box above for copy/paste.")
		Button.add(mid + 3 * x4, height - 30, w4, 40, "Cancel", "loadsave menu", r => changeScene("main menu"))
		Button.add(mid - x2, height - 75, w2, 40, "Play Selected World", "loadsave menu", r => {
			setWorld(new World())
			win.world = world

			let code
			if (!selectedWorld) {
				code = boxCenterTop.value
			} else {
				let data = worlds[selectedWorld]
				if (data) {
					code = data.code
					world.id = data.id
					world.edited = data.edited
				}
			}
			
			if (code) {
				try {
					world.loadSave(code)
					world.id = world.id || Date.now()
					world.active = true
					save()
				}
				catch(e) {
					alert("Unable to load save")
					return
				}
				changeScene("loading")
			}
		}, () => !(!selectedWorld && boxCenterTop.value) && !worlds[selectedWorld])
		Button.add(mid + x2, height - 75, w2, 40, "Create New World", "loadsave menu", r => changeScene("creation menu"))

		Button.add(mid, height / 2, w2, 40, "Save", "editworld", r => {
			let w = worlds[selectedWorld]
			w.name = boxCenterTop.value.replace(/;/g, "\u037e")
			let split = w.code.split(";")
			split[0] = w.name
			w.code = split.join(";")
			saveToDB(w.id, w).then(success => {
				initWorldsMenu()
				changeScene("loadsave menu")
			}).catch(e => console.error(e))
		})
		Button.add(mid, height / 2 + 50, w2, 40, "Back", "editworld", r => changeScene(previousScreen))

		// Death screen buttons
		Button.add(width / 2, height / 2 + 30, 300, 40, "Respawn", "death", respawn)
		Button.add(width / 2, height / 2 + 80, 300, 40, "Title Screen", "death", r => { save(); changeScene("main menu") })

		// Pause buttons
		Button.add(width / 2, 225, 300, 40, "Resume", "pause", play)
		Button.add(width / 2, 275, 300, 40, "Settings", "pause", r => changeScene("options"))
		Button.add(width / 2, 325, 300, 40, "Save", "pause", save, nothing, () => `Save the world to your computer/browser. Doesn't work in incognito.\n\nLast saved ${timeString(Date.now() - world.edited)}.`)
		Button.add(width / 2, 375, 300, 40, "Get Save Code", "pause", r => {
			savebox.classList.remove("hidden")
			saveDirections.classList.remove("hidden")
			savebox.value = world.getSaveString()
		})
		Button.add(width / 2, 425, 300, 40, "Exit Without Saving", "pause", r => {
			savebox.value = world.getSaveString()
			initWorldsMenu()
			changeScene("main menu")
		})
		// Settings buttons
		Button.add(width / 2, 455, width / 3, 40, "Back", "options", r => changeScene(previousScreen))
		let viewBobbingButton = Button.add(width / 2, 410, width / 3, 40, [ "View Bobbing: On", "View Bobbing: Off" ], "options", r => settings.viewBobbing = r === "View Bobbing: On", nothing, "Toggle slight camera movement while walking.")
		viewBobbingButton.index = settings.viewBobbing ? 0 : 1
		
		// Comingsoon menu buttons
		Button.add(width / 2, 395, width / 3, 40, "Back", "comingsoon menu", r => changeScene(previousScreen))

		// Multiplayer buttons
		Button.add(width / 2, 395, width / 3, 40, "¯\\_(ツ)_/¯", "multiplayer menu", r => changeScene("main menu"))

		// Settings Sliders
		Slider.add(width/2, 245, width / 3, 40, "options", "Render Distance", 1, 32, "renderDistance", val => settings.renderDistance = Math.round(val))
		Slider.add(width/2, 305, width / 3, 40, "options", "FOV", 30, 110, "fov", val => {
			p.FOV(val)
			if (world) {
				p.setDirection()
				world.render()
			}
		})
		Slider.add(width/2, 365, width / 3, 40, "options", "Mouse Sensitivity", 30, 400, "mouseSense", val => settings.mouseSense = val)
	}


	function drawIcon(x, y, id) {
		id = id < 0x800 ? (id | placementMode(id)) : id
		let buffer = blockIcons[id]
		if (!buffer || !blockIcons.lengths[id]) return
		x =  x / (3 * height) - 0.1666 * width / height
		y = y / (3 * height) - 0.1666
		initModelView(null, x, y, 0, 0, 0)

		// Icons are flat/simple geometry; drawing both sides keeps a winding
		// mistake from making a texture disappear.
		let cull = gl.isEnabled(gl.CULL_FACE)
		if (cull) gl.disable(gl.CULL_FACE)
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
		gl.vertexAttribPointer(glCache.aVertex, 3, gl.FLOAT, false, 24, 0)
		gl.vertexAttribPointer(glCache.aTexture, 2, gl.FLOAT, false, 24, 12)
		gl.vertexAttribPointer(glCache.aShadow, 1, gl.FLOAT, false, 24, 20)
		gl.drawElements(gl.TRIANGLES, blockIcons.lengths[id], gl.UNSIGNED_INT, 0)
		if (cull) gl.enable(gl.CULL_FACE)
	}

	function heldStack() {
		return inventory.slots[inventory.hotbarSlot]
	}
	function updateHolding() {
		let st = heldStack()
		setHolding(st && st.count > 0 ? st.id : 0)
	}
	function addItem(id, count) {
		if (id && count > 0) {
			for (let i = 0; i < 36 && count > 0; i++) {
				let st = inventory.slots[i]
				if (st && st.id === id && st.count < MAX_STACK) {
					let add = Math.min(MAX_STACK - st.count, count)
					st.count += add
					count -= add
				}
			}
			for (let i = 0; i < 36 && count > 0; i++) {
				if (!inventory.slots[i]) {
					let add = Math.min(MAX_STACK, count)
					inventory.slots[i] = { id: id, count: add }
					count -= add
				}
			}
		}
		updateHolding()
		return count
	}
	// Middle-click picks the targeted block into the hotbar (creative-style).
	function pickBlock() {
		if (!hitBox.pos) return false
		let block = world.getBlock(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2]) & BASE_MASK
		if (!block) return false
		let found = -1
		for (let i = 0; i < 36; i++) {
			if (inventory.slots[i] && inventory.slots[i].id === block) {
				found = i
				break
			}
		}
		if (found >= 0) {
			if (found < 9) {
				inventory.hotbarSlot = found
			} else {
				let tmp = inventory.slots[inventory.hotbarSlot]
				inventory.slots[inventory.hotbarSlot] = inventory.slots[found]
				inventory.slots[found] = tmp
			}
		} else {
			inventory.slots[inventory.hotbarSlot] = { id: block, count: 1 }
		}
		updateHolding()
		setUpdateHUD(true)
		return true
	}
	function invCapacity(id) {
		let cap = 0
		for (let i = 0; i < 36; i++) {
			let st = inventory.slots[i]
			if (!st) cap += MAX_STACK
			else if (st.id === id) cap += MAX_STACK - st.count
		}
		return cap
	}
	function consumeHeld(count) {
		let st = heldStack()
		if (st) {
			st.count -= count
			if (st.count <= 0) {
				inventory.slots[inventory.hotbarSlot] = null
			}
		}
		updateHolding()
	}
	function blockDrop(block) {
		return idDrop(block)
	}


	function updateCraftResult() {
		inventory.result = craftingResult(inventory.craft, 2)
	}
	function consumeCraft() {
		for (let i = 0; i < inventory.craft.length; i++) {
			let c = inventory.craft[i]
			if (c) {
				c.count--
				if (c.count <= 0) {
					inventory.craft[i] = null
				}
			}
		}
	}
	function craftOnce() {
		updateCraftResult()
		let out = inventory.result
		if (!out) {
			return false
		}
		if (!inventory.cursor) {
			inventory.cursor = { id: out.id, count: out.count }
		} else if (inventory.cursor.id === out.id && inventory.cursor.count + out.count <= MAX_STACK) {
			inventory.cursor.count += out.count
		} else {
			return false
		}
		consumeCraft()
		updateCraftResult()
		return true
	}
	function itemName(id) {
		if (isItem(id)) {
			let d = itemDef(id)
			return d ? (d.display || d.name.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim()) : "Unknown"
		}
		let data = blockData[id & BASE_MASK]
		if (!data) return "Unknown"
		return data.name.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim()
	}
	function invLayout() {
		let s = inventory.size
		let pad = Math.round(s * 0.6)
		let gap = Math.round(s * 0.5)
		let panelW = 9 * s + 2 * pad
		// The armor column is four slots tall. The survival inventory has the
		// vanilla 2x2 crafting grid; the crafting table screen provides 3x3.
		let topH = 4 * s
		let panelH = pad + topH + gap + 3 * s + gap + s + pad
		let px = Math.round((width - panelW) / 2)
		let py = Math.round((height - panelH) / 2)
		let upperY = py + pad
		let groupW = 2 * s + gap + s
		let craftX = Math.round(px + (panelW - groupW) / 2)
		let craftY = upperY + Math.round((topH - 2 * s) / 2)
		return {
			s: s, pad: pad,
			panelX: px, panelY: py, panelW: panelW, panelH: panelH,
			craftX: craftX, craftY: craftY,
			armorX: px + pad, armorY: upperY,
			resultX: craftX + 2 * s + gap, resultY: craftY + Math.round(s / 2),
			mainX: px + pad, mainY: upperY + topH + gap,
			hotX: px + pad, hotY: upperY + topH + gap + 3 * s + gap,
		}
	}
	function slotPos(l, region, index) {
		if (region === "hotbar") {
			return { x: l.hotX + index * l.s, y: l.hotY }
		}
		if (region === "main") {
			return { x: l.mainX + (index % 9) * l.s, y: l.mainY + ((index / 9) | 0) * l.s }
		}
		if (region === "armor") {
			return { x: l.armorX, y: l.armorY + index * l.s }
		}
		if (region === "craft") {
			return { x: l.craftX + (index % 2) * l.s, y: l.craftY + ((index / 2) | 0) * l.s }
		}
		return { x: l.resultX, y: l.resultY }
	}
	function slotAt(mx, my) {
		let l = invLayout()
		let s = l.s
		let inside = (x, y) => mx >= x && mx < x + s && my >= y && my < y + s
		for (let i = 0; i < 9; i++) {
			if (inside(l.hotX + i * s, l.hotY)) return { region: "hotbar", index: i }
		}
		for (let i = 0; i < 27; i++) {
			let p = slotPos(l, "main", i)
			if (inside(p.x, p.y)) return { region: "main", index: i }
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "craft", i)
			if (inside(p.x, p.y)) return { region: "craft", index: i }
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "armor", i)
			if (inside(p.x, p.y)) return { region: "armor", index: i }
		}
		if (inside(l.resultX, l.resultY)) return { region: "result" }
		return null
	}
	function getStack(ref) {
		if (!ref) return null
		if (ref.region === "hotbar") return inventory.slots[ref.index]
		if (ref.region === "main") return inventory.slots[9 + ref.index]
		if (ref.region === "armor") return inventory.armor[ref.index]
		if (ref.region === "craft") return inventory.craft[ref.index]
		if (ref.region === "result") return inventory.result
		return null
	}
	function setStack(ref, stack) {
		if (!ref) return
		if (ref.region === "hotbar") inventory.slots[ref.index] = stack
		else if (ref.region === "main") inventory.slots[9 + ref.index] = stack
		else if (ref.region === "armor") inventory.armor[ref.index] = stack
		else if (ref.region === "craft") inventory.craft[ref.index] = stack
	}
	function stackIntoRange(id, count, start, end) {
		for (let i = start; i < end && count > 0; i++) {
			let st = inventory.slots[i]
			if (st && st.id === id && st.count < MAX_STACK) {
				let add = Math.min(MAX_STACK - st.count, count)
				st.count += add
				count -= add
			}
		}
		for (let i = start; i < end && count > 0; i++) {
			if (!inventory.slots[i]) {
				let add = Math.min(MAX_STACK, count)
				inventory.slots[i] = { id: id, count: add }
				count -= add
			}
		}
		return count
	}
	function quickMove(ref) {
		let stack = getStack(ref)
		if (!stack || ref.region === "result") return
		if (ref.region === "armor") {
			let left = stackIntoRange(stack.id, stack.count, 0, 36)
			if (left <= 0) setStack(ref, null)
			else stack.count = left
			return
		}
		if (ref.region === "craft") {
			let left = stackIntoRange(stack.id, stack.count, 0, 36)
			if (left <= 0) setStack(ref, null)
			else stack.count = left
			return
		}
		let left
		if (ref.region === "hotbar") {
			left = stackIntoRange(stack.id, stack.count, 9, 36)
		} else {
			left = stackIntoRange(stack.id, stack.count, 0, 9)
		}
		if (left <= 0) setStack(ref, null)
		else stack.count = left
	}
	function hotbar() {
		FOV(90)

		for(let i = 0; i < 9; i ++) {
			let st = inventory.slots[i]
			if(st) {
				let x = width / 2 - 9 / 2 * inventory.size + (i + 0.5) * inventory.size + 25
				let y = height - inventory.size
				drawIcon(x, y, st.id)
			}
		}
	}
	function hud() {
		if (p.spectator) {
			return
		}

		drawStatusOverlay(ctx)
		hotbar()

		let s = inventory.size
		let x = width / 2 + 0.5
		let y = height / 2 + 0.5

		// Crosshair
		if (!p.spectator) {
			ctx.lineWidth = 1
			ctx.strokeStyle = "white"
			ctx.beginPath()
			ctx.moveTo(x - 10, y)
			ctx.lineTo(x + 10, y)
			ctx.moveTo(x, y - 10)
			ctx.lineTo(x, y + 10)
			ctx.stroke()
		}

		//Hotbar
		x = width / 2 - 9 / 2 * s + 0.5 + 25
		y = height - s * 1.5 + 0.5

		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.beginPath()
		ctx.moveTo(x, y)
		ctx.lineTo(x + s * 9, y)
		ctx.moveTo(x, y + s)
		ctx.lineTo(x + s * 9, y + s)
		for(let i = 0; i <= 9; i++) {
			ctx.moveTo(x + i * s, y)
			ctx.lineTo(x + i * s, y + s)
		}
		ctx.stroke()

		ctx.strokeStyle = "white"
		ctx.lineWidth = 2
		ctx.beginPath()

		ctx.strokeRect(width / 2 - 9 / 2 * s + inventory.hotbarSlot * s + 25, height - s * 1.5, s, s)

		let str = "Average Frame Time: " + analytics.displayedFrameTime + "ms\n"
		+ "Worst Frame Time: " + analytics.displayedwFrameTime + "ms\n"
		+ "Render Time: " + analytics.displayedRenderTime + "ms\n"
		+ "Tick Time: " + analytics.displayedTickTime + "ms\n"
		+ "Rendered Chunks: " + renderedChunks.toLocaleString() + " / " + world.loaded.length + "\n"
		+ "Generated Chunks: " + generatedChunks.toLocaleString() + "\n"
		+ "FPS: " + analytics.fps

		ctx.textAlign = 'right'
		text(p2.x + ", " + p2.y + ", " + p2.z, width - 10, 15, 0)
		// The debug overlay lives at the top-left, like the vanilla F3 screen,
		// so it cannot cover the health and hunger bars above the hotbar.
		ctx.textAlign = 'left'
		text(str, 5, 20, 12)
		if (p.autoBreak) {
			text("Super breaker enabled", 5, 20 + (str.split("\n").length + 1) * 12, 12)
		}
		drawStatusBars(ctx)
	}
	// The hotbar icons are WebGL and get composited over the 2D canvas, so
	// stack counts must be painted afterwards or the icon covers them.
	function hotbarCounts() {
		if (p.spectator) return
		let s = inventory.size
		ctx.save()
		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.4)) + "px Poppins"
		for (let i = 0; i < 9; i++) {
			let st = inventory.slots[i]
			if (st && st.count > 1) {
				let tx = width / 2 - 9 / 2 * s + (i + 1) * s + 25 - 3
				let ty = height - s * 0.5 - 3
				ctx.strokeText(st.count, tx, ty)
				ctx.fillText(st.count, tx, ty)
			}
			let bx = width / 2 - 9 / 2 * s + i * s + 25 + 3
			let by = height - s * 0.5 - 5
			drawDurabilityBar(ctx, bx, by, s - 6, st)
		}
		ctx.restore()
	}
	function drawInv() {
		let l = invLayout()
		let s = l.s

		if (!invBgReady) {
			invBg.width = width
			invBg.height = height
			invBg.getContext("2d").drawImage(gl.canvas, 0, 0)
			setInvBgReady(true)
		}
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(invBg, 0, 0)
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(0, 0, width, height)

		updateCraftResult()

		let drawSlotBg = (x, y) => {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(x, y, s, s)
			ctx.fillStyle = "#373737"
			ctx.fillRect(x, y, s, 2)
			ctx.fillRect(x, y, 2, s)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(x, y + s - 2, s, 2)
			ctx.fillRect(x + s - 2, y, 2, s)
		}

		// Panel
		ctx.fillStyle = "#c6c6c6"
		ctx.fillRect(l.panelX, l.panelY, l.panelW, l.panelH)
		ctx.strokeStyle = "#ffffff"
		ctx.lineWidth = 2
		ctx.strokeRect(l.panelX + 1, l.panelY + 1, l.panelW - 2, l.panelH - 2)
		ctx.strokeStyle = "#555555"
		ctx.strokeRect(l.panelX + 0.5, l.panelY + 0.5, l.panelW - 1, l.panelH - 1)

		// Slots
		for (let i = 0; i < 9; i++) drawSlotBg(l.hotX + i * s, l.hotY)
		for (let i = 0; i < 27; i++) {
			let p = slotPos(l, "main", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "craft", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "armor", i)
			drawSlotBg(p.x, p.y)
			drawArmorSlotGhost(ctx, i, p.x, p.y, s)
		}
		drawSlotBg(l.resultX, l.resultY)

		// Craft arrow
		ctx.fillStyle = "#8b8b8b"
		let ax = l.craftX + 2 * s + Math.round(s * 0.16)
		let ay = l.craftY + s
		ctx.beginPath()
		ctx.moveTo(ax, ay - s * 0.18)
		ctx.lineTo(ax + s * 0.22, ay)
		ctx.lineTo(ax, ay + s * 0.18)
		ctx.closePath()
		ctx.fill()

		// Hover highlight
		let hover = slotAt(mouseX, mouseY)
		if (hover) {
			let p = slotPos(l, hover.region, hover.index)
			ctx.strokeStyle = "white"
			ctx.lineWidth = 2
			ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2)
		}

		// Icons (WebGL)
		use3d()
		FOV(90)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.disable(gl.DEPTH_TEST)
		for (let i = 0; i < 9; i++) {
			let st = inventory.slots[i]
			if (st) drawIcon(l.hotX + (i + 0.5) * s, l.hotY + s / 2, st.id)
		}
		for (let i = 0; i < 27; i++) {
			let st = inventory.slots[9 + i]
			if (st) {
				let p = slotPos(l, "main", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		for (let i = 0; i < 4; i++) {
			let st = inventory.armor[i]
			if (st) {
				let p = slotPos(l, "armor", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		for (let i = 0; i < 4; i++) {
			let st = inventory.craft[i]
			if (st) {
				let p = slotPos(l, "craft", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		if (inventory.result) drawIcon(l.resultX + s / 2, l.resultY + s / 2, inventory.result.id)
		if (inventory.cursor) drawIcon(mouseX, mouseY, inventory.cursor.id)
		gl.enable(gl.DEPTH_TEST)
		ctx.drawImage(gl.canvas, 0, 0)

		// Counts
		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.42)) + "px Poppins"
		let drawCount = (x, y, stack) => {
			if (stack && stack.count > 1) {
				ctx.strokeText(stack.count, x + s - 3, y + s - 4)
				ctx.fillText(stack.count, x + s - 3, y + s - 4)
			}
		}
		for (let i = 0; i < 9; i++) drawCount(l.hotX + i * s, l.hotY, inventory.slots[i])
		for (let i = 0; i < 27; i++) {
			let p = slotPos(l, "main", i)
			drawCount(p.x, p.y, inventory.slots[9 + i])
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "craft", i)
			drawCount(p.x, p.y, inventory.craft[i])
		}
		if (inventory.result) drawCount(l.resultX, l.resultY, inventory.result)
		if (inventory.cursor) drawCount(mouseX - s / 2, mouseY - s / 2, inventory.cursor)
		// Durability bars sit under the icons, like the vanilla item damage bar.
		for (let i = 0; i < 9; i++) drawDurabilityBar(ctx, l.hotX + i * s + 3, l.hotY + s - 5, s - 6, inventory.slots[i])
		for (let i = 0; i < 27; i++) {
			let p = slotPos(l, "main", i)
			drawDurabilityBar(ctx, p.x + 3, p.y + s - 5, s - 6, inventory.slots[9 + i])
		}
		for (let i = 0; i < 4; i++) {
			let p = slotPos(l, "armor", i)
			drawDurabilityBar(ctx, p.x + 3, p.y + s - 5, s - 6, inventory.armor[i])
		}

		// Tooltip
		let tip = hover ? getStack(hover) : null
		if (tip) {
			ctx.textAlign = "left"
			ctx.font = Math.max(12, Math.round(s * 0.4)) + "px Poppins"
			let name = itemName(tip.id)
			let tw = ctx.measureText(name).width
			ctx.fillStyle = "rgba(16, 0, 16, 0.94)"
			ctx.fillRect(mouseX + 8, mouseY + 4, tw + 10, 22)
			ctx.fillStyle = "white"
			ctx.fillText(name, mouseX + 13, mouseY + 20)
		}
		ctx.textAlign = "left"
	}
	const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"]
	function armorSlotIndex(id) {
		if (!isItem(id)) return -1
		let def = itemDef(id)
		if (!def || def.behavior !== "armor") return -1
		return ARMOR_SLOTS.indexOf(def.armorSlot)
	}
	function equipArmorStack(ref) {
		let stack = getStack(ref)
		if (!stack) return false
		let index = armorSlotIndex(stack.id)
		if (index < 0) return false
		let old = inventory.armor[index]
		inventory.armor[index] = { id: stack.id, count: 1, damage: stack.damage || 0 }
		if (stack.count > 1) {
			stack.count--
			if (old) addItem(old.id, old.count)
		} else {
			setStack(ref, old || null)
		}
		updateArmorStats()
		return true
	}
	function clickInv(button, shift) {
		updateCraftResult()
		let ref = slotAt(mouseX, mouseY)
		if (!ref) {
			if (button === 0 && inventory.cursor) {
				addItem(inventory.cursor.id, inventory.cursor.count)
				inventory.cursor = null
			}
			drawScreens.inventory()
			return
		}
		if (ref.region === "result") {
			if (!inventory.result) {
				drawScreens.inventory()
				return
			}
			if (shift) {
				while (inventory.result && invCapacity(inventory.result.id) >= inventory.result.count) {
					let out = inventory.result
					addItem(out.id, out.count)
					consumeCraft()
					updateCraftResult()
				}
			} else {
				craftOnce()
			}
			drawScreens.inventory()
			return
		}
		if (shift) {
			let moved = getStack(ref)
			if (ref.region !== "armor" && moved && armorSlotIndex(moved.id) >= 0) equipArmorStack(ref)
			else quickMove(ref)
			updateHolding()
			drawScreens.inventory()
			return
		}
		let stack = getStack(ref)
		if (ref.region === "armor") {
			let index = ref.index
			let equipped = inventory.armor[index]
			if (button === 0) {
				if (inventory.cursor) {
					if (armorSlotIndex(inventory.cursor.id) !== index) {
						drawScreens.inventory()
						return
					}
					inventory.armor[index] = inventory.cursor
					inventory.cursor = equipped || null
				} else if (equipped) {
					inventory.cursor = equipped
					inventory.armor[index] = null
				}
			} else if (button === 2 && inventory.cursor && armorSlotIndex(inventory.cursor.id) === index && !equipped) {
				inventory.armor[index] = { id: inventory.cursor.id, count: 1, damage: inventory.cursor.damage || 0 }
				inventory.cursor.count--
				if (inventory.cursor.count <= 0) inventory.cursor = null
			}
			updateArmorStats()
			drawScreens.inventory()
			return
		}
		if (button === 2 && !inventory.cursor && stack && armorSlotIndex(stack.id) >= 0) {
			equipArmorStack(ref)
			updateHolding()
			drawScreens.inventory()
			return
		}
		if (button === 0) {
			if (inventory.cursor) {
				if (!stack) {
					setStack(ref, inventory.cursor)
					inventory.cursor = null
				} else if (stack.id === inventory.cursor.id) {
					let add = Math.min(MAX_STACK - stack.count, inventory.cursor.count)
					stack.count += add
					inventory.cursor.count -= add
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else {
					setStack(ref, inventory.cursor)
					inventory.cursor = stack
				}
			} else if (stack) {
				inventory.cursor = stack
				setStack(ref, null)
			}
		} else if (button === 2) {
			if (inventory.cursor) {
				if (!stack) {
					setStack(ref, { id: inventory.cursor.id, count: 1 })
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else if (stack.id === inventory.cursor.id && stack.count < MAX_STACK) {
					stack.count++
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				}
			} else if (stack) {
				let half = Math.ceil(stack.count / 2)
				inventory.cursor = { id: stack.id, count: half }
				stack.count -= half
				if (stack.count <= 0) setStack(ref, null)
			}
		}
		updateHolding()
		drawScreens.inventory()
	}

	// Dragging a held stack over slots places one item in each newly visited
	// cell. This is the vanilla inventory drag behavior and is shared by every
	// container screen.
	let itemDrag = null
	function dragSlotAt(mx, my) {
		if (screen === "inventory") {
			return gameMode === "creative" ? creativeSlotAt(mx, my, creativeLayout()) : slotAt(mx, my)
		}
		if (screen === "crafting") return tableSlotAt(mx, my)
		if (screen === "chest") return chestSlotAt(mx, my)
		if (screen === "furnace") return furnaceSlotAt(mx, my)
		return null
	}
	function dragGet(ref) {
		if (!ref) return null
		if (screen === "inventory") return getStack(ref)
		if (screen === "crafting") return tableGet(ref)
		if (screen === "chest") return chestGet(ref)
		if (screen === "furnace") return furnaceGet(ref)
		return null
	}
	function dragSet(ref, stack) {
		if (!ref) return
		if (screen === "inventory") setStack(ref, stack)
		else if (screen === "crafting") tableSet(ref, stack)
		else if (screen === "chest") chestSet(ref, stack)
		else if (screen === "furnace") furnaceSet(ref, stack)
	}
	function dragKey(ref) {
		return screen + ":" + ref.region + ":" + (ref.index === undefined ? "" : ref.index)
	}
	function beginItemDrag(button) {
		if (button !== 0 && button !== 2) return
		if (!inventory.cursor || inventory.cursor.count <= 0) return
		let ref = dragSlotAt(mouseX, mouseY)
		if (!ref) return
		itemDrag = { screen: screen, seen: new Set([dragKey(ref)]) }
	}
	function updateItemDrag(mx, my) {
		if (!itemDrag) return
		if (itemDrag.screen !== screen || !mouseDown || !inventory.cursor) {
			itemDrag = null
			return
		}
		let ref = dragSlotAt(mx, my)
		if (!ref) return
		// Results are output-only, armor uses its own equip rules, and the
		// creative palette is a source rather than a drop target.
		if (ref.region === "result" || ref.region === "armor" || ref.region === "palette") return
		let key = dragKey(ref)
		if (itemDrag.seen.has(key)) return
		itemDrag.seen.add(key)
		let stack = dragGet(ref)
		let cursor = inventory.cursor
		if (!stack) {
			dragSet(ref, { id: cursor.id, count: 1 })
			cursor.count--
		} else if (stack.id === cursor.id && stack.count < MAX_STACK) {
			stack.count++
			cursor.count--
		} else {
			return
		}
		if (cursor.count <= 0) {
			inventory.cursor = null
			itemDrag = null
		}
		updateHolding()
	}
	function endItemDrag() {
		itemDrag = null
	}
	function slotAtScreen(mx, my) {
		return dragSlotAt(mx, my)
	}
	// Double-click gathering: move every matching stack from the active
	// inventory/container into the cursor, stopping at the stack limit.
	function collectMatchingItems(id) {
		if (!id) return false
		if (inventory.cursor && inventory.cursor.id !== id) return false
		let hadCursor = !!inventory.cursor
		if (!inventory.cursor) inventory.cursor = { id: id, count: 0 }
		let cursor = inventory.cursor
		let moved = false
		let take = (stack, index, array) => {
			if (!stack || stack.id !== id || stack.count <= 0 || cursor.count >= MAX_STACK) return
			let add = Math.min(MAX_STACK - cursor.count, stack.count)
			if (add <= 0) return
			stack.count -= add
			cursor.count += add
			moved = true
			if (stack.count <= 0) array[index] = null
		}
		let takeFrom = (array, start, end) => {
			if (!array) return
			for (let i = start; i < end && cursor.count < MAX_STACK; i++) take(array[i], i, array)
		}
		if (screen === "inventory") {
			if (gameMode === "creative") {
				takeFrom(inventory.slots, 0, 9)
			} else {
				takeFrom(inventory.slots, 0, 36)
				takeFrom(inventory.craft, 0, 4)
			}
		} else if (screen === "crafting") {
			takeFrom(tableCraft, 0, 9)
			takeFrom(inventory.slots, 0, 36)
		} else if (screen === "chest") {
			takeFrom(chestSlots, 0, 27)
			takeFrom(inventory.slots, 0, 36)
		} else if (screen === "furnace") {
			takeFrom(furnaceState && furnaceState.slots, 0, 3)
			takeFrom(inventory.slots, 0, 36)
		}
		if (!hadCursor && !moved) inventory.cursor = null
		if (moved) updateHolding()
		return moved
	}

	// Crafting tables use a temporary 3x3 grid. The table is not a block entity
	// in this clone, so closing the screen returns the grid and cursor contents
	// to the player (spawning any overflow at their feet).
	let tableCraft = null
	let tableResult = null
	function tableLayout() {
		let s = inventory.size
		let pad = Math.round(s * 0.6)
		let gap = Math.round(s * 0.6)
		let titleH = Math.round(s * 1.1)
		let panelW = 9 * s + 2 * pad
		let topH = 4 * s
		let panelH = pad + titleH + topH + gap + 3 * s + gap + s + pad
		let px = Math.round((width - panelW) / 2)
		let py = Math.round((height - panelH) / 2)
		let topY = py + pad + titleH
		let groupW = 3 * s + gap + s
		let craftX = Math.round(px + (panelW - groupW) / 2)
		let craftY = topY + Math.round((topH - 3 * s) / 2)
		return {
			s: s, pad: pad, gap: gap, titleH: titleH,
			panelX: px, panelY: py, panelW: panelW, panelH: panelH,
			craftX: craftX, craftY: craftY,
			resultX: craftX + 3 * s + gap, resultY: craftY + s,
			mainX: px + pad, mainY: topY + topH + gap,
			hotX: px + pad, hotY: topY + topH + gap + 3 * s + gap,
		}
	}
	function tableSlotPos(l, region, index) {
		if (region === "craft") {
			return { x: l.craftX + (index % 3) * l.s, y: l.craftY + ((index / 3) | 0) * l.s }
		}
		if (region === "main") {
			return { x: l.mainX + (index % 9) * l.s, y: l.mainY + ((index / 9) | 0) * l.s }
		}
		if (region === "hotbar") return { x: l.hotX + index * l.s, y: l.hotY }
		return { x: l.resultX, y: l.resultY }
	}
	function tableSlotAt(mx, my) {
		let l = tableLayout()
		let s = l.s
		let inside = (x, y) => mx >= x && mx < x + s && my >= y && my < y + s
		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "craft", i)
			if (inside(p.x, p.y)) return { region: "craft", index: i }
		}
		if (inside(l.resultX, l.resultY)) return { region: "result" }
		for (let i = 0; i < 27; i++) {
			let p = tableSlotPos(l, "main", i)
			if (inside(p.x, p.y)) return { region: "main", index: i }
		}
		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "hotbar", i)
			if (inside(p.x, p.y)) return { region: "hotbar", index: i }
		}
		return null
	}
	function tableGet(ref) {
		if (!ref || !tableCraft) return null
		if (ref.region === "craft") return tableCraft[ref.index]
		if (ref.region === "result") return tableResult
		return getStack(ref)
	}
	function tableSet(ref, stack) {
		if (!ref || !tableCraft) return
		if (ref.region === "craft") tableCraft[ref.index] = stack
		else if (ref.region === "result") tableResult = stack
		else setStack(ref, stack)
	}
	function updateTableResult() {
		tableResult = tableCraft ? craftingResult(tableCraft, 3) : null
	}
	function consumeTableCraft() {
		for (let i = 0; i < 9; i++) {
			let stack = tableCraft[i]
			if (!stack) continue
			stack.count--
			if (stack.count <= 0) tableCraft[i] = null
		}
	}
	function tableCraftOnce() {
		updateTableResult()
		let out = tableResult
		if (!out) return false
		if (!inventory.cursor) {
			inventory.cursor = { id: out.id, count: out.count }
		} else if (inventory.cursor.id === out.id && inventory.cursor.count + out.count <= MAX_STACK) {
			inventory.cursor.count += out.count
		} else {
			return false
		}
		consumeTableCraft()
		updateTableResult()
		return true
	}
	function tableQuickMove(ref) {
		let stack = tableGet(ref)
		if (!stack || ref.region === "result") return
		let left
		if (ref.region === "craft") {
			left = stackIntoRange(stack.id, stack.count, 0, 36)
		} else if (ref.region === "hotbar") {
			left = stackIntoRange(stack.id, stack.count, 9, 36)
		} else {
			left = stackIntoRange(stack.id, stack.count, 0, 9)
		}
		if (left <= 0) tableSet(ref, null)
		else stack.count = left
	}
	function returnTableGrid() {
		if (tableCraft) {
			for (let i = 0; i < tableCraft.length; i++) {
				let stack = tableCraft[i]
				if (!stack || stack.count <= 0) continue
				let left = addItem(stack.id, stack.count)
				if (left > 0) spawnDrop(stack.id, left)
				tableCraft[i] = null
			}
		}
		tableCraft = null
		tableResult = null
	}
	function openCraftingTable() {
		if (screen !== "play") return
		tableCraft = new Array(9).fill(null)
		tableResult = null
		releasePointer()
		changeScene("crafting")
	}
	function closeCraftingTable() {
		if (screen !== "crafting") return
		if (inventory.cursor) {
			let left = addItem(inventory.cursor.id, inventory.cursor.count)
			if (left > 0) spawnDrop(inventory.cursor.id, left)
			inventory.cursor = null
		}
		returnTableGrid()
		play()
	}
	function drawCraftingTable() {
		if (!tableCraft) return
		updateTableResult()
		let l = tableLayout()
		let s = l.s

		if (!invBgReady) {
			invBg.width = width
			invBg.height = height
			invBg.getContext("2d").drawImage(gl.canvas, 0, 0)
			setInvBgReady(true)
		}
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(invBg, 0, 0)
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(0, 0, width, height)

		let drawSlotBg = (x, y) => {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(x, y, s, s)
			ctx.fillStyle = "#373737"
			ctx.fillRect(x, y, s, 2)
			ctx.fillRect(x, y, 2, s)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(x, y + s - 2, s, 2)
			ctx.fillRect(x + s - 2, y, 2, s)
		}

		ctx.fillStyle = "#c6c6c6"
		ctx.fillRect(l.panelX, l.panelY, l.panelW, l.panelH)
		ctx.strokeStyle = "#ffffff"
		ctx.lineWidth = 2
		ctx.strokeRect(l.panelX + 1, l.panelY + 1, l.panelW - 2, l.panelH - 2)
		ctx.strokeStyle = "#555555"
		ctx.strokeRect(l.panelX + 0.5, l.panelY + 0.5, l.panelW - 1, l.panelH - 1)

		ctx.fillStyle = "#404040"
		ctx.textAlign = "left"
		ctx.font = Math.round(s * 0.42) + "px Poppins"
		ctx.fillText("Crafting", l.panelX + l.pad, l.panelY + l.pad + Math.round(l.titleH * 0.65))

		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "craft", i)
			drawSlotBg(p.x, p.y)
		}
		drawSlotBg(l.resultX, l.resultY)
		for (let i = 0; i < 27; i++) {
			let p = tableSlotPos(l, "main", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "hotbar", i)
			drawSlotBg(p.x, p.y)
		}

		// Crafting arrow between the grid and the result slot.
		ctx.fillStyle = "#8b8b8b"
		let ax = l.craftX + 3 * s + Math.round(s * 0.16)
		let ay = l.craftY + Math.round(1.5 * s)
		ctx.beginPath()
		ctx.moveTo(ax, ay - s * 0.18)
		ctx.lineTo(ax + s * 0.22, ay)
		ctx.lineTo(ax, ay + s * 0.18)
		ctx.closePath()
		ctx.fill()

		let hover = tableSlotAt(mouseX, mouseY)
		if (hover) {
			let p = tableSlotPos(l, hover.region, hover.index)
			ctx.strokeStyle = "white"
			ctx.lineWidth = 2
			ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2)
		}

		use3d()
		FOV(90)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.disable(gl.DEPTH_TEST)
		for (let i = 0; i < 9; i++) {
			let stack = tableCraft[i]
			if (stack) {
				let p = tableSlotPos(l, "craft", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		for (let i = 0; i < 27; i++) {
			let stack = inventory.slots[9 + i]
			if (stack) {
				let p = tableSlotPos(l, "main", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		for (let i = 0; i < 9; i++) {
			let stack = inventory.slots[i]
			if (stack) {
				let p = tableSlotPos(l, "hotbar", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		if (tableResult) drawIcon(l.resultX + s / 2, l.resultY + s / 2, tableResult.id)
		if (inventory.cursor) drawIcon(mouseX, mouseY, inventory.cursor.id)
		gl.enable(gl.DEPTH_TEST)
		ctx.drawImage(gl.canvas, 0, 0)

		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.42)) + "px Poppins"
		let drawCount = (x, y, stack) => {
			if (stack && stack.count > 1) {
				ctx.strokeText(stack.count, x + s - 3, y + s - 4)
				ctx.fillText(stack.count, x + s - 3, y + s - 4)
			}
		}
		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "craft", i)
			drawCount(p.x, p.y, tableCraft[i])
		}
		for (let i = 0; i < 27; i++) {
			let p = tableSlotPos(l, "main", i)
			drawCount(p.x, p.y, inventory.slots[9 + i])
		}
		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "hotbar", i)
			drawCount(p.x, p.y, inventory.slots[i])
		}
		if (tableResult) drawCount(l.resultX, l.resultY, tableResult)
		if (inventory.cursor) drawCount(mouseX - s / 2, mouseY - s / 2, inventory.cursor)

		for (let i = 0; i < 9; i++) {
			let p = tableSlotPos(l, "hotbar", i)
			drawDurabilityBar(ctx, p.x + 3, p.y + s - 5, s - 6, inventory.slots[i])
		}
		for (let i = 0; i < 27; i++) {
			let p = tableSlotPos(l, "main", i)
			drawDurabilityBar(ctx, p.x + 3, p.y + s - 5, s - 6, inventory.slots[9 + i])
		}

		let tip = hover ? tableGet(hover) : null
		if (tip) {
			ctx.textAlign = "left"
			ctx.font = Math.max(12, Math.round(s * 0.4)) + "px Poppins"
			let name = itemName(tip.id)
			let tw = ctx.measureText(name).width
			ctx.fillStyle = "rgba(16, 0, 16, 0.94)"
			ctx.fillRect(mouseX + 8, mouseY + 4, tw + 10, 22)
			ctx.fillStyle = "white"
			ctx.fillText(name, mouseX + 13, mouseY + 20)
		}
		ctx.textAlign = "left"
	}
	function clickCraftingTable(button, shift) {
		updateTableResult()
		let ref = tableSlotAt(mouseX, mouseY)
		if (!ref) {
			if (button === 0 && inventory.cursor) {
				let left = addItem(inventory.cursor.id, inventory.cursor.count)
				if (left > 0) spawnDrop(inventory.cursor.id, left)
				inventory.cursor = null
			}
			drawCraftingTable()
			return
		}
		if (ref.region === "result") {
			if (!tableResult) {
				drawCraftingTable()
				return
			}
			if (shift) {
				while (tableResult && invCapacity(tableResult.id) >= tableResult.count) {
					let out = tableResult
					addItem(out.id, out.count)
					consumeTableCraft()
					updateTableResult()
				}
			} else {
				tableCraftOnce()
			}
			updateHolding()
			drawCraftingTable()
			return
		}
		if (shift) {
			tableQuickMove(ref)
			updateHolding()
			drawCraftingTable()
			return
		}
		let stack = tableGet(ref)
		if (button === 0) {
			if (inventory.cursor) {
				if (!stack) {
					tableSet(ref, inventory.cursor)
					inventory.cursor = null
				} else if (stack.id === inventory.cursor.id) {
					let add = Math.min(MAX_STACK - stack.count, inventory.cursor.count)
					stack.count += add
					inventory.cursor.count -= add
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else {
					tableSet(ref, inventory.cursor)
					inventory.cursor = stack
				}
			} else if (stack) {
				inventory.cursor = stack
				tableSet(ref, null)
			}
		} else if (button === 2) {
			if (inventory.cursor) {
				if (!stack) {
					tableSet(ref, { id: inventory.cursor.id, count: 1 })
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else if (stack.id === inventory.cursor.id && stack.count < MAX_STACK) {
					stack.count++
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				}
			} else if (stack) {
				let half = Math.ceil(stack.count / 2)
				inventory.cursor = { id: stack.id, count: half }
				stack.count -= half
				if (stack.count <= 0) tableSet(ref, null)
			}
		}
		updateHolding()
		drawCraftingTable()
	}

	// Chest storage uses the same slot and cursor rules as the survival
	// inventory, but with a 3x9 container above the player's 3x9 + hotbar.
	let chestSlots = null
	let chestTitle = "Chest"
	function chestLayout() {
		let s = inventory.size
		let pad = Math.round(s * 0.6)
		let gap = Math.round(s * 0.6)
		let titleH = Math.round(s * 1.1)
		let panelW = 9 * s + 2 * pad
		let panelH = pad + titleH + 3 * s + gap + 3 * s + gap + s + pad
		let px = Math.round((width - panelW) / 2)
		let py = Math.round((height - panelH) / 2)
		return {
			s: s, pad: pad, gap: gap, titleH: titleH,
			panelX: px, panelY: py, panelW: panelW, panelH: panelH,
			chestX: px + pad, chestY: py + pad + titleH,
			mainX: px + pad, mainY: py + pad + titleH + 3 * s + gap,
			hotX: px + pad, hotY: py + pad + titleH + 3 * s + gap + 3 * s + gap,
		}
	}
	function chestSlotPos(l, region, index) {
		if (region === "chest") return { x: l.chestX + (index % 9) * l.s, y: l.chestY + ((index / 9) | 0) * l.s }
		if (region === "main") return { x: l.mainX + (index % 9) * l.s, y: l.mainY + ((index / 9) | 0) * l.s }
		return { x: l.hotX + index * l.s, y: l.hotY }
	}
	function chestSlotAt(mx, my) {
		let l = chestLayout()
		let s = l.s
		let inside = (x, y) => mx >= x && mx < x + s && my >= y && my < y + s
		for (let i = 0; i < 27; i++) {
			let p = chestSlotPos(l, "chest", i)
			if (inside(p.x, p.y)) return { region: "chest", index: i }
		}
		for (let i = 0; i < 27; i++) {
			let p = chestSlotPos(l, "main", i)
			if (inside(p.x, p.y)) return { region: "main", index: i }
		}
		for (let i = 0; i < 9; i++) {
			let p = chestSlotPos(l, "hotbar", i)
			if (inside(p.x, p.y)) return { region: "hotbar", index: i }
		}
		return null
	}
	function chestGet(ref) {
		if (!ref) return null
		if (ref.region === "chest") return chestSlots[ref.index]
		return getStack(ref)
	}
	function chestSet(ref, stack) {
		if (!ref) return
		if (ref.region === "chest") chestSlots[ref.index] = stack
		else setStack(ref, stack)
	}
	function chestInto(id, count, start, end) {
		for (let i = start; i < end && count > 0; i++) {
			let st = chestSlots[i]
			if (st && st.id === id && st.count < MAX_STACK) {
				let add = Math.min(MAX_STACK - st.count, count)
				st.count += add
				count -= add
			}
		}
		for (let i = start; i < end && count > 0; i++) {
			if (!chestSlots[i]) {
				let add = Math.min(MAX_STACK, count)
				chestSlots[i] = { id: id, count: add }
				count -= add
			}
		}
		return count
	}
	function chestQuickMove(ref) {
		let stack = chestGet(ref)
		if (!stack) return
		let left
		if (ref.region === "chest") {
			left = stackIntoRange(stack.id, stack.count, 9, 36)
			if (left > 0) left = stackIntoRange(stack.id, left, 0, 9)
		} else {
			left = chestInto(stack.id, stack.count, 0, 27)
		}
		if (left <= 0) chestSet(ref, null)
		else stack.count = left
	}
	function openChest(x, y, z) {
		if (!world || !world.getChest) return
		chestSlots = world.getChest(x, y, z)
		chestTitle = (world.getBlock(x, y, z) & BASE_MASK) === blockIds.barrel ? "Barrel" : "Chest"
		if (screen !== "play") return
		releasePointer()
		changeScene("chest")
	}
	function closeChest() {
		if (screen !== "chest") return
		if (inventory.cursor) {
			addItem(inventory.cursor.id, inventory.cursor.count)
			inventory.cursor = null
		}
		chestSlots = null
		play()
	}

	// Furnaces keep their three slots in the world so cooking continues while
	// the screen is closed. The UI only holds a reference to that block entity.
	let furnaceState = null
	function furnaceLayout() {
		let s = inventory.size
		let pad = Math.round(s * 0.6)
		let gap = Math.round(s * 0.6)
		let titleH = Math.round(s * 1.1)
		let panelW = 9 * s + 2 * pad
		let topH = 4 * s
		let panelH = pad + titleH + topH + gap + 3 * s + gap + s + pad
		let px = Math.round((width - panelW) / 2)
		let py = Math.round((height - panelH) / 2)
		let topY = py + pad + titleH
		let groupW = 3 * s + gap + s
		let inputX = Math.round(px + (panelW - groupW) / 2)
		return {
			s: s, pad: pad, gap: gap, titleH: titleH,
			panelX: px, panelY: py, panelW: panelW, panelH: panelH,
			inputX: inputX, inputY: topY,
			fuelX: inputX, fuelY: topY + 2 * s,
			resultX: inputX + 3 * s + gap, resultY: topY + s,
			mainX: px + pad, mainY: topY + topH + gap,
			hotX: px + pad, hotY: topY + topH + gap + 3 * s + gap,
		}
	}
	function furnaceSlotPos(l, region, index) {
		if (region === "input") return { x: l.inputX, y: l.inputY }
		if (region === "fuel") return { x: l.fuelX, y: l.fuelY }
		if (region === "result") return { x: l.resultX, y: l.resultY }
		if (region === "main") return { x: l.mainX + (index % 9) * l.s, y: l.mainY + ((index / 9) | 0) * l.s }
		return { x: l.hotX + index * l.s, y: l.hotY }
	}
	function furnaceSlotAt(mx, my) {
		let l = furnaceLayout()
		let s = l.s
		let inside = (x, y) => mx >= x && mx < x + s && my >= y && my < y + s
		if (inside(l.inputX, l.inputY)) return { region: "input", index: 0 }
		if (inside(l.fuelX, l.fuelY)) return { region: "fuel", index: 1 }
		if (inside(l.resultX, l.resultY)) return { region: "result", index: 2 }
		for (let i = 0; i < 27; i++) {
			let p = furnaceSlotPos(l, "main", i)
			if (inside(p.x, p.y)) return { region: "main", index: i }
		}
		for (let i = 0; i < 9; i++) {
			let p = furnaceSlotPos(l, "hotbar", i)
			if (inside(p.x, p.y)) return { region: "hotbar", index: i }
		}
		return null
	}
	function furnaceGet(ref) {
		if (!ref || !furnaceState) return null
		if (ref.region === "input") return furnaceState.slots[0]
		if (ref.region === "fuel") return furnaceState.slots[1]
		if (ref.region === "result") return furnaceState.slots[2]
		return getStack(ref)
	}
	function furnaceSet(ref, stack) {
		if (!ref || !furnaceState) return
		if (ref.region === "input") furnaceState.slots[0] = stack
		else if (ref.region === "fuel") furnaceState.slots[1] = stack
		else if (ref.region === "result") furnaceState.slots[2] = stack
		else setStack(ref, stack)
	}
	function furnaceMoveInto(id, count, index) {
		let stack = furnaceState.slots[index]
		if (stack && stack.id === id && stack.count < MAX_STACK) {
			let add = Math.min(MAX_STACK - stack.count, count)
			stack.count += add
			count -= add
		}
		if (!furnaceState.slots[index] && count > 0) {
			let add = Math.min(MAX_STACK, count)
			furnaceState.slots[index] = { id: id, count: add }
			count -= add
		}
		return count
	}
	function furnaceQuickMove(ref) {
		let stack = furnaceGet(ref)
		if (!stack) return
		if (ref.region === "input" || ref.region === "fuel" || ref.region === "result") {
			let left = stackIntoRange(stack.id, stack.count, 0, 36)
			if (left <= 0) furnaceSet(ref, null)
			else stack.count = left
			return
		}
		let dest = smeltResult(stack.id) ? 0 : (fuelValue(stack.id) > 0 ? 1 : -1)
		if (dest < 0) {
			quickMove(ref)
			return
		}
		let left = furnaceMoveInto(stack.id, stack.count, dest)
		if (left <= 0) furnaceSet(ref, null)
		else stack.count = left
	}
	function openFurnace(x, y, z) {
		if (!world || !world.getFurnace) return
		furnaceState = world.getFurnace(x, y, z)
		if (screen !== "play") return
		releasePointer()
		changeScene("furnace")
	}
	function closeFurnace() {
		if (screen !== "furnace") return
		if (inventory.cursor) {
			addItem(inventory.cursor.id, inventory.cursor.count)
			inventory.cursor = null
		}
		furnaceState = null
		play()
	}
	function drawFurnace() {
		if (!furnaceState) return
		let l = furnaceLayout()
		let s = l.s

		if (!invBgReady) {
			invBg.width = width
			invBg.height = height
			invBg.getContext("2d").drawImage(gl.canvas, 0, 0)
			setInvBgReady(true)
		}
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(invBg, 0, 0)
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(0, 0, width, height)

		let drawSlotBg = (x, y) => {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(x, y, s, s)
			ctx.fillStyle = "#373737"
			ctx.fillRect(x, y, s, 2)
			ctx.fillRect(x, y, 2, s)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(x, y + s - 2, s, 2)
			ctx.fillRect(x + s - 2, y, 2, s)
		}

		ctx.fillStyle = "#c6c6c6"
		ctx.fillRect(l.panelX, l.panelY, l.panelW, l.panelH)
		ctx.strokeStyle = "#ffffff"
		ctx.lineWidth = 2
		ctx.strokeRect(l.panelX + 1, l.panelY + 1, l.panelW - 2, l.panelH - 2)
		ctx.strokeStyle = "#555555"
		ctx.strokeRect(l.panelX + 0.5, l.panelY + 0.5, l.panelW - 1, l.panelH - 1)

		ctx.fillStyle = "#404040"
		ctx.textAlign = "left"
		ctx.font = Math.round(s * 0.42) + "px Poppins"
		ctx.fillText("Furnace", l.panelX + l.pad, l.panelY + l.pad + Math.round(l.titleH * 0.65))

		drawSlotBg(l.inputX, l.inputY)
		drawSlotBg(l.fuelX, l.fuelY)
		drawSlotBg(l.resultX, l.resultY)
		for (let i = 0; i < 27; i++) {
			let p = furnaceSlotPos(l, "main", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 9; i++) {
			let p = furnaceSlotPos(l, "hotbar", i)
			drawSlotBg(p.x, p.y)
		}

		// Burn flame bar between the input and fuel slots.
		let fx = l.inputX - Math.round(s * 0.6)
		let fy = l.inputY + Math.round(s * 1.45)
		let fh = Math.round(s * 0.8)
		let burn = furnaceState.burnTotal > 0 ? Math.max(0, Math.min(1, furnaceState.burnTime / furnaceState.burnTotal)) : 0
		ctx.fillStyle = "#6b6b6b"
		ctx.fillRect(fx, fy - fh, Math.max(4, Math.round(s * 0.24)), fh)
		ctx.fillStyle = "#e89b32"
		ctx.fillRect(fx, fy - Math.round(fh * burn), Math.max(4, Math.round(s * 0.24)), Math.round(fh * burn))

		// Cook progress bar between the input column and the result slot.
		let px = l.inputX + 3 * s + Math.round(s * 0.08)
		let py = l.resultY + Math.round(s * 0.42)
		let pw = Math.max(8, Math.round(s * 0.44))
		let progress = Math.max(0, Math.min(1, furnaceState.cookTime / 200))
		ctx.fillStyle = "#6b6b6b"
		ctx.fillRect(px, py, pw, 8)
		ctx.fillStyle = "#e89b32"
		ctx.fillRect(px, py, Math.round(pw * progress), 8)

		let hover = furnaceSlotAt(mouseX, mouseY)
		if (hover) {
			let p = furnaceSlotPos(l, hover.region, hover.index)
			ctx.strokeStyle = "white"
			ctx.lineWidth = 2
			ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2)
		}

		use3d()
		FOV(90)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.disable(gl.DEPTH_TEST)
		for (let i = 0; i < 3; i++) {
			let stack = furnaceState.slots[i]
			if (stack) {
				let p = furnaceSlotPos(l, i === 0 ? "input" : i === 1 ? "fuel" : "result", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		for (let i = 0; i < 27; i++) {
			let stack = inventory.slots[9 + i]
			if (stack) {
				let p = furnaceSlotPos(l, "main", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		for (let i = 0; i < 9; i++) {
			let stack = inventory.slots[i]
			if (stack) {
				let p = furnaceSlotPos(l, "hotbar", i)
				drawIcon(p.x + s / 2, p.y + s / 2, stack.id)
			}
		}
		if (inventory.cursor) drawIcon(mouseX, mouseY, inventory.cursor.id)
		gl.enable(gl.DEPTH_TEST)
		ctx.drawImage(gl.canvas, 0, 0)

		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.42)) + "px Poppins"
		let drawCount = (x, y, stack) => {
			if (stack && stack.count > 1) {
				ctx.strokeText(stack.count, x + s - 3, y + s - 4)
				ctx.fillText(stack.count, x + s - 3, y + s - 4)
			}
		}
		for (let i = 0; i < 3; i++) {
			let stack = furnaceState.slots[i]
			let p = furnaceSlotPos(l, i === 0 ? "input" : i === 1 ? "fuel" : "result", i)
			drawCount(p.x, p.y, stack)
		}
		for (let i = 0; i < 27; i++) {
			let p = furnaceSlotPos(l, "main", i)
			drawCount(p.x, p.y, inventory.slots[9 + i])
		}
		for (let i = 0; i < 9; i++) {
			let p = furnaceSlotPos(l, "hotbar", i)
			drawCount(p.x, p.y, inventory.slots[i])
		}
		if (inventory.cursor) drawCount(mouseX - s / 2, mouseY - s / 2, inventory.cursor)

		let tip = hover ? furnaceGet(hover) : null
		if (tip) {
			ctx.textAlign = "left"
			ctx.font = Math.max(12, Math.round(s * 0.4)) + "px Poppins"
			let name = itemName(tip.id)
			let tw = ctx.measureText(name).width
			ctx.fillStyle = "rgba(16, 0, 16, 0.94)"
			ctx.fillRect(mouseX + 8, mouseY + 4, tw + 10, 22)
			ctx.fillStyle = "white"
			ctx.fillText(name, mouseX + 13, mouseY + 20)
		}
		ctx.textAlign = "left"
	}
	function clickFurnace(button, shift) {
		let ref = furnaceSlotAt(mouseX, mouseY)
		if (!ref) {
			if (button === 0 && inventory.cursor) {
				addItem(inventory.cursor.id, inventory.cursor.count)
				inventory.cursor = null
			}
			drawFurnace()
			return
		}
		if (shift) {
			furnaceQuickMove(ref)
			updateHolding()
			drawFurnace()
			return
		}
		let stack = furnaceGet(ref)
		if (ref.region === "result") {
			if (!stack) {
				drawFurnace()
				return
			}
			if (button === 0) {
				if (!inventory.cursor) {
					inventory.cursor = stack
					furnaceState.slots[2] = null
				} else if (inventory.cursor.id === stack.id && inventory.cursor.count + stack.count <= MAX_STACK) {
					inventory.cursor.count += stack.count
					furnaceState.slots[2] = null
				}
			} else if (button === 2) {
				let half = Math.ceil(stack.count / 2)
				if (!inventory.cursor) {
					inventory.cursor = { id: stack.id, count: half }
					stack.count -= half
					if (stack.count <= 0) furnaceState.slots[2] = null
				} else if (inventory.cursor.id === stack.id && inventory.cursor.count + half <= MAX_STACK) {
					inventory.cursor.count += half
					stack.count -= half
					if (stack.count <= 0) furnaceState.slots[2] = null
				}
			}
			updateHolding()
			drawFurnace()
			return
		}
		if (button === 0) {
			if (inventory.cursor) {
				if (!stack) {
					furnaceSet(ref, inventory.cursor)
					inventory.cursor = null
				} else if (stack.id === inventory.cursor.id) {
					let add = Math.min(MAX_STACK - stack.count, inventory.cursor.count)
					stack.count += add
					inventory.cursor.count -= add
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else {
					furnaceSet(ref, inventory.cursor)
					inventory.cursor = stack
				}
			} else if (stack) {
				inventory.cursor = stack
				furnaceSet(ref, null)
			}
		} else if (button === 2) {
			if (inventory.cursor) {
				if (!stack) {
					furnaceSet(ref, { id: inventory.cursor.id, count: 1 })
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else if (stack.id === inventory.cursor.id && stack.count < MAX_STACK) {
					stack.count++
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				}
			} else if (stack) {
				let half = Math.ceil(stack.count / 2)
				inventory.cursor = { id: stack.id, count: half }
				stack.count -= half
				if (stack.count <= 0) furnaceSet(ref, null)
			}
		}
		updateHolding()
		drawFurnace()
	}

	// Signs keep four editable lines. Text is written to the world on every
	// keystroke so closing the editor (or reloading the save) never loses it.
	let signEditor = null
	function persistSign() {
		if (!signEditor || !world || !world.setSign) return
		world.setSign(signEditor.x, signEditor.y, signEditor.z, signEditor.lines)
	}
	function openSign(x, y, z) {
		if (screen !== "play" || !world || !world.getSign) return
		let lines = world.getSign(x, y, z)
		signEditor = { x: x, y: y, z: z, lines: lines, row: 0, col: lines[0].length }
		releasePointer()
		changeScene("sign")
	}
	function closeSign() {
		if (screen !== "sign") return
		persistSign()
		signEditor = null
		play()
	}
	function signMoveRow(row) {
		if (!signEditor) return
		signEditor.row = Math.max(0, Math.min(3, row))
		signEditor.col = Math.min(signEditor.col, signEditor.lines[signEditor.row].length)
	}
	function handleSignKey(e) {
		if (!signEditor) return
		let line = signEditor.lines[signEditor.row]
		if (e.key === "Escape") {
			closeSign()
			return
		}
		if (e.key === "Enter" || e.key === "Tab") {
			if (signEditor.row < 3) {
				signMoveRow(signEditor.row + 1)
				signEditor.col = signEditor.lines[signEditor.row].length
			} else {
				closeSign()
				return
			}
		} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
			signMoveRow(signEditor.row + (e.key === "ArrowUp" ? -1 : 1))
		} else if (e.key === "ArrowLeft") {
			signEditor.col = Math.max(0, signEditor.col - 1)
		} else if (e.key === "ArrowRight") {
			signEditor.col = Math.min(line.length, signEditor.col + 1)
		} else if (e.key === "Home") {
			signEditor.col = 0
		} else if (e.key === "End") {
			signEditor.col = line.length
		} else if (e.key === "Backspace") {
			if (signEditor.col > 0) {
				signEditor.lines[signEditor.row] = line.slice(0, signEditor.col - 1) + line.slice(signEditor.col)
				signEditor.col--
			}
		} else if (e.key === "Delete") {
			if (signEditor.col < line.length) {
				signEditor.lines[signEditor.row] = line.slice(0, signEditor.col) + line.slice(signEditor.col + 1)
			}
		} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			if (line.length + e.key.length <= 15) {
				signEditor.lines[signEditor.row] = line.slice(0, signEditor.col) + e.key + line.slice(signEditor.col)
				signEditor.col += e.key.length
			}
		} else {
			return
		}
		persistSign()
		drawSignEditor()
	}
	function drawSignEditor() {
		if (!signEditor) return
		ctx.clearRect(0, 0, width, height)
		if (gl && gl.canvas) ctx.drawImage(gl.canvas, 0, 0)
		ctx.fillStyle = "rgba(10, 7, 4, 0.62)"
		ctx.fillRect(0, 0, width, height)

		let pw = Math.min(600, width - 36)
		let ph = Math.min(440, height - 36)
		let px = Math.round((width - pw) / 2)
		let py = Math.round((height - ph) / 2)
		let scale = Math.min(pw / 600, ph / 440)
		let pad = Math.round(28 * scale)
		let titleH = Math.round(48 * scale)
		let footerH = Math.round(36 * scale)
		let rowH = (ph - pad * 2 - titleH - footerH) / 4

		// Oak-colored panel with simple plank seams, in the spirit of the
		// vanilla sign editor.
		let wood = ctx.createLinearGradient(0, py, 0, py + ph)
		wood.addColorStop(0, "#c5965f")
		wood.addColorStop(0.5, "#b07b45")
		wood.addColorStop(1, "#99663a")
		ctx.fillStyle = wood
		ctx.fillRect(px, py, pw, ph)
		ctx.strokeStyle = "#54341b"
		ctx.lineWidth = Math.max(3, Math.round(5 * scale))
		ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2)
		ctx.strokeStyle = "rgba(84, 52, 27, 0.45)"
		ctx.lineWidth = 1
		for (let i = 1; i < 4; i++) {
			let y = Math.round(py + ph * i / 4)
			ctx.beginPath()
			ctx.moveTo(px + 8, y)
			ctx.lineTo(px + pw - 8, y)
			ctx.stroke()
		}

		ctx.textAlign = "center"
		ctx.textBaseline = "middle"
		ctx.fillStyle = "#35200f"
		ctx.font = "bold " + Math.max(16, Math.round(24 * scale)) + "px Poppins, sans-serif"
		ctx.fillText("Edit Sign", width / 2, py + pad + titleH * 0.35)

		let font = Math.max(15, Math.min(30, Math.round(rowH * 0.52)))
		ctx.font = "bold " + font + "px Poppins, sans-serif"
		let rowsTop = py + pad + titleH
		for (let i = 0; i < 4; i++) {
			let top = rowsTop + i * rowH
			if (i === signEditor.row) {
				ctx.fillStyle = "rgba(255, 244, 214, 0.20)"
				ctx.fillRect(px + pad, top + 2, pw - pad * 2, rowH - 4)
			}
			let line = signEditor.lines[i]
			let cy = top + rowH / 2
			ctx.fillStyle = "#2a1809"
			ctx.fillText(line, width / 2, cy)
			if (i === signEditor.row) {
				let before = ctx.measureText(line.slice(0, signEditor.col)).width
				let total = ctx.measureText(line).width
				let cx = width / 2 - total / 2 + before
				ctx.fillStyle = "#2a1809"
				ctx.fillRect(Math.round(cx), Math.round(cy - font * 0.58), Math.max(2, Math.round(2 * scale)), Math.round(font * 1.16))
			}
		}

		ctx.fillStyle = "rgba(53, 32, 15, 0.82)"
		ctx.font = Math.max(11, Math.round(14 * scale)) + "px Poppins, sans-serif"
		ctx.fillText(signEditor.row < 3 ? "Enter: next line    Esc: done" : "Enter: done    Esc: done", width / 2, py + ph - pad - footerH * 0.28)
		ctx.textAlign = "left"
		ctx.textBaseline = "alphabetic"
	}
	function drawChest() {
		if (!chestSlots) return
		let l = chestLayout()
		let s = l.s

		if (!invBgReady) {
			invBg.width = width
			invBg.height = height
			invBg.getContext("2d").drawImage(gl.canvas, 0, 0)
			setInvBgReady(true)
		}
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(invBg, 0, 0)
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(0, 0, width, height)

		let drawSlotBg = (x, y) => {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(x, y, s, s)
			ctx.fillStyle = "#373737"
			ctx.fillRect(x, y, s, 2)
			ctx.fillRect(x, y, 2, s)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(x, y + s - 2, s, 2)
			ctx.fillRect(x + s - 2, y, 2, s)
		}

		ctx.fillStyle = "#c6c6c6"
		ctx.fillRect(l.panelX, l.panelY, l.panelW, l.panelH)
		ctx.strokeStyle = "#ffffff"
		ctx.lineWidth = 2
		ctx.strokeRect(l.panelX + 1, l.panelY + 1, l.panelW - 2, l.panelH - 2)
		ctx.strokeStyle = "#555555"
		ctx.strokeRect(l.panelX + 0.5, l.panelY + 0.5, l.panelW - 1, l.panelH - 1)

		ctx.fillStyle = "#404040"
		ctx.textAlign = "left"
		ctx.font = Math.round(s * 0.42) + "px Poppins"
		ctx.fillText(chestTitle, l.panelX + l.pad, l.panelY + l.pad + Math.round(l.titleH * 0.65))

		for (let i = 0; i < 27; i++) {
			let p = chestSlotPos(l, "chest", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 27; i++) {
			let p = chestSlotPos(l, "main", i)
			drawSlotBg(p.x, p.y)
		}
		for (let i = 0; i < 9; i++) {
			let p = chestSlotPos(l, "hotbar", i)
			drawSlotBg(p.x, p.y)
		}

		let hover = chestSlotAt(mouseX, mouseY)
		if (hover) {
			let p = chestSlotPos(l, hover.region, hover.index)
			ctx.strokeStyle = "white"
			ctx.lineWidth = 2
			ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2)
		}

		use3d()
		FOV(90)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.disable(gl.DEPTH_TEST)
		for (let i = 0; i < 27; i++) {
			let st = chestSlots[i]
			if (st) {
				let p = chestSlotPos(l, "chest", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		for (let i = 0; i < 27; i++) {
			let st = inventory.slots[9 + i]
			if (st) {
				let p = chestSlotPos(l, "main", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		for (let i = 0; i < 9; i++) {
			let st = inventory.slots[i]
			if (st) {
				let p = chestSlotPos(l, "hotbar", i)
				drawIcon(p.x + s / 2, p.y + s / 2, st.id)
			}
		}
		if (inventory.cursor) drawIcon(mouseX, mouseY, inventory.cursor.id)
		gl.enable(gl.DEPTH_TEST)
		ctx.drawImage(gl.canvas, 0, 0)

		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.42)) + "px Poppins"
		let drawCount = (x, y, stack) => {
			if (stack && stack.count > 1) {
				ctx.strokeText(stack.count, x + s - 3, y + s - 4)
				ctx.fillText(stack.count, x + s - 3, y + s - 4)
			}
		}
		for (let i = 0; i < 27; i++) drawCount(l.chestX + (i % 9) * s, l.chestY + ((i / 9) | 0) * s, chestSlots[i])
		for (let i = 0; i < 27; i++) {
			let p = chestSlotPos(l, "main", i)
			drawCount(p.x, p.y, inventory.slots[9 + i])
		}
		for (let i = 0; i < 9; i++) drawCount(l.hotX + i * s, l.hotY, inventory.slots[i])
		if (inventory.cursor) drawCount(mouseX - s / 2, mouseY - s / 2, inventory.cursor)

		let tip = hover ? chestGet(hover) : null
		if (tip) {
			ctx.textAlign = "left"
			ctx.font = Math.max(12, Math.round(s * 0.4)) + "px Poppins"
			let name = itemName(tip.id)
			let tw = ctx.measureText(name).width
			ctx.fillStyle = "rgba(16, 0, 16, 0.94)"
			ctx.fillRect(mouseX + 8, mouseY + 4, tw + 10, 22)
			ctx.fillStyle = "white"
			ctx.fillText(name, mouseX + 13, mouseY + 20)
		}
		ctx.textAlign = "left"
	}
	function clickChest(button, shift) {
		let ref = chestSlotAt(mouseX, mouseY)
		if (!ref) {
			if (button === 0 && inventory.cursor) {
				addItem(inventory.cursor.id, inventory.cursor.count)
				inventory.cursor = null
			}
			drawChest()
			return
		}
		if (shift) {
			chestQuickMove(ref)
			updateHolding()
			drawChest()
			return
		}
		let stack = chestGet(ref)
		if (button === 0) {
			if (inventory.cursor) {
				if (!stack) {
					chestSet(ref, inventory.cursor)
					inventory.cursor = null
				} else if (stack.id === inventory.cursor.id) {
					let add = Math.min(MAX_STACK - stack.count, inventory.cursor.count)
					stack.count += add
					inventory.cursor.count -= add
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else {
					chestSet(ref, inventory.cursor)
					inventory.cursor = stack
				}
			} else if (stack) {
				inventory.cursor = stack
				chestSet(ref, null)
			}
		} else if (button === 2) {
			if (inventory.cursor) {
				if (!stack) {
					chestSet(ref, { id: inventory.cursor.id, count: 1 })
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				} else if (stack.id === inventory.cursor.id && stack.count < MAX_STACK) {
					stack.count++
					inventory.cursor.count--
					if (inventory.cursor.count <= 0) inventory.cursor = null
				}
			} else if (stack) {
				let half = Math.ceil(stack.count / 2)
				inventory.cursor = { id: stack.id, count: half }
				stack.count -= half
				if (stack.count <= 0) chestSet(ref, null)
			}
		}
		updateHolding()
		drawChest()
	}

	// Creative inventory: compact survival-style panel with a scrollable, searchable block and tool list
	function creativeIds() {
		let q = creativeSearch.trim().toLowerCase().replace(/\s+/g, "")
		if (q === creativeIdsKey && creativeIdsCache) return creativeIdsCache
		let list = []
		for (let id = 1; id < BLOCK_COUNT; id++) {
			if (blockData[id].hidden) continue
			if (!showInCreative(blockData[id])) continue
			if (q === "" || itemName(id).toLowerCase().replace(/\s+/g, "").includes(q)) list.push(id)
		}
		// Every registered item is available in creative mode. This includes
		// tools, armor, food, projectiles, potions, vehicles and utility items;
		// their behaviors are resolved when the held stack is used.
		for (let i = 0; i < itemData.length; i++) {
			let id = ITEM_ID_BASE + i
			if (q === "" || itemName(id).toLowerCase().replace(/\s+/g, "").includes(q)) list.push(id)
		}
		setCreativeIdsKey(q)
		setCreativeIdsCache(list)
		return list
	}
	function creativeLayout() {
		let s = inventory.size
		let pad = Math.round(s * 0.6)
		let gap = Math.round(s * 0.5)
		let perRow = 9
		let visibleRows = 5
		let searchH = Math.round(s * 0.8)
		let ids = creativeIds()
		let rows = Math.max(1, Math.ceil(ids.length / perRow))
		let panelW = 9 * s + 2 * pad
		let panelH = pad + searchH + gap + visibleRows * s + gap + s + pad
		let px = Math.round((width - panelW) / 2)
		let py = Math.round((height - panelH) / 2)
		let scrollMax = Math.max(0, rows - visibleRows)
		setCreativeScroll(Math.max(0, Math.min(scrollMax, creativeScroll)))
		return {
			s: s, pad: pad, gap: gap, perRow: perRow, rows: rows, visibleRows: visibleRows,
			ids: ids,
			panelX: px, panelY: py, panelW: panelW, panelH: panelH,
			searchX: px + pad, searchY: py + pad, searchW: panelW - 2 * pad, searchH: searchH,
			gridX: px + pad, gridY: py + pad + searchH + gap,
			hotX: px + pad, hotY: py + pad + searchH + gap + visibleRows * s + gap,
			scrollMax: scrollMax,
		}
	}
	function creativeScrollbar(cl) {
		let s = cl.s
		let trackX = cl.gridX + cl.perRow * s + Math.round(s * 0.16)
		let trackY = cl.gridY
		let trackH = cl.visibleRows * s
		let trackW = Math.max(4, Math.round(s * 0.3))
		let thumbH = cl.scrollMax > 0
			? Math.max(Math.round(s * 0.7), Math.round(trackH * cl.visibleRows / cl.rows))
			: trackH
		let thumbY = cl.scrollMax > 0
			? trackY + Math.round((trackH - thumbH) * creativeScroll / cl.scrollMax)
			: trackY
		return { trackX: trackX, trackY: trackY, trackW: trackW, trackH: trackH, thumbY: thumbY, thumbH: thumbH }
	}
	function creativeSlotAt(mx, my, cl) {
		let s = cl.s
		let inside = (x, y) => mx >= x && mx < x + s && my >= y && my < y + s
		for (let i = 0; i < 9; i++) {
			if (inside(cl.hotX + i * s, cl.hotY)) return { region: "hotbar", index: i }
		}
		let top = Math.round(creativeScroll)
		for (let j = 0; j < cl.visibleRows; j++) {
			for (let i = 0; i < cl.perRow; i++) {
				let idx = (top + j) * cl.perRow + i
				if (idx >= cl.ids.length) break
				let x = cl.gridX + i * s
				let y = cl.gridY + j * s
				if (inside(x, y)) return { region: "palette", id: cl.ids[idx], x: x, y: y }
			}
		}
		return null
	}
	function drawCreative() {
		let cl = creativeLayout()
		let s = cl.s
		let top = Math.round(creativeScroll)

		if (!invBgReady) {
			invBg.width = width
			invBg.height = height
			invBg.getContext("2d").drawImage(gl.canvas, 0, 0)
			setInvBgReady(true)
		}
		ctx.clearRect(0, 0, width, height)
		ctx.drawImage(invBg, 0, 0)
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(0, 0, width, height)

		let drawSlotBg = (x, y) => {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(x, y, s, s)
			ctx.fillStyle = "#373737"
			ctx.fillRect(x, y, s, 2)
			ctx.fillRect(x, y, 2, s)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(x, y + s - 2, s, 2)
			ctx.fillRect(x + s - 2, y, 2, s)
		}

		ctx.fillStyle = "#c6c6c6"
		ctx.fillRect(cl.panelX, cl.panelY, cl.panelW, cl.panelH)
		ctx.strokeStyle = "#ffffff"
		ctx.lineWidth = 2
		ctx.strokeRect(cl.panelX + 1, cl.panelY + 1, cl.panelW - 2, cl.panelH - 2)
		ctx.strokeStyle = "#555555"
		ctx.strokeRect(cl.panelX + 0.5, cl.panelY + 0.5, cl.panelW - 1, cl.panelH - 1)

		// Search bar
		ctx.fillStyle = "#373737"
		ctx.fillRect(cl.searchX, cl.searchY, cl.searchW, cl.searchH)
		ctx.strokeStyle = creativeSearchActive ? "#ffffff" : "#555555"
		ctx.lineWidth = 2
		ctx.strokeRect(cl.searchX + 1, cl.searchY + 1, cl.searchW - 2, cl.searchH - 2)
		ctx.save()
		ctx.beginPath()
		ctx.rect(cl.searchX + 4, cl.searchY, cl.searchW - 8, cl.searchH)
		ctx.clip()
		ctx.textAlign = "left"
		ctx.textBaseline = "middle"
		ctx.font = Math.round(cl.searchH * 0.52) + "px Poppins"
		let ty = cl.searchY + cl.searchH / 2
		if (creativeSearch) {
			ctx.fillStyle = "#ffffff"
			ctx.fillText(creativeSearch, cl.searchX + 8, ty)
			if (creativeSearchActive && Math.floor(Date.now() / 500) % 2 === 0) {
				let w = ctx.measureText(creativeSearch).width
				ctx.fillRect(cl.searchX + 9 + w, cl.searchY + cl.searchH * 0.22, 2, cl.searchH * 0.56)
			}
		} else {
			ctx.fillStyle = "#9a9a9a"
			ctx.fillText("Search blocks or items...", cl.searchX + 8, ty)
			if (creativeSearchActive && Math.floor(Date.now() / 500) % 2 === 0) {
				ctx.fillStyle = "#ffffff"
				ctx.fillRect(cl.searchX + 8, cl.searchY + cl.searchH * 0.22, 2, cl.searchH * 0.56)
			}
		}
		ctx.restore()
		ctx.textBaseline = "alphabetic"

		for (let j = 0; j < cl.visibleRows; j++) {
			for (let i = 0; i < cl.perRow; i++) {
				let idx = (top + j) * cl.perRow + i
				if (idx >= cl.ids.length) break
				drawSlotBg(cl.gridX + i * s, cl.gridY + j * s)
			}
		}
		for (let i = 0; i < 9; i++) {
			drawSlotBg(cl.hotX + i * s, cl.hotY)
		}

		if (cl.ids.length === 0) {
			ctx.fillStyle = "#555555"
			ctx.textAlign = "center"
			ctx.textBaseline = "middle"
			ctx.font = Math.round(s * 0.45) + "px Poppins"
			ctx.fillText("No items found", cl.gridX + 4.5 * s, cl.gridY + cl.visibleRows * s / 2)
			ctx.textBaseline = "alphabetic"
			ctx.textAlign = "left"
		}

		// Scrollbar
		let sb = creativeScrollbar(cl)
		ctx.fillStyle = "#373737"
		ctx.fillRect(sb.trackX, sb.trackY, sb.trackW, sb.trackH)
		if (cl.scrollMax > 0) {
			ctx.fillStyle = "#8b8b8b"
			ctx.fillRect(sb.trackX, sb.thumbY, sb.trackW, sb.thumbH)
			ctx.fillStyle = "#ffffff"
			ctx.fillRect(sb.trackX, sb.thumbY, sb.trackW, 2)
			ctx.fillStyle = "#373737"
			ctx.fillRect(sb.trackX, sb.thumbY + sb.thumbH - 2, sb.trackW, 2)
		}

		let hit = creativeSlotAt(mouseX, mouseY, cl)
		if (hit) {
			let p = hit.region === "hotbar"
				? { x: cl.hotX + hit.index * s, y: cl.hotY }
				: { x: hit.x, y: hit.y }
			ctx.strokeStyle = "white"
			ctx.lineWidth = 2
			ctx.strokeRect(p.x + 1, p.y + 1, s - 2, s - 2)
		}

		use3d()
		FOV(90)
		gl.clearColor(0, 0, 0, 0)
		gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
		gl.disable(gl.DEPTH_TEST)
		for (let j = 0; j < cl.visibleRows; j++) {
			for (let i = 0; i < cl.perRow; i++) {
				let idx = (top + j) * cl.perRow + i
				if (idx >= cl.ids.length) break
				drawIcon(cl.gridX + (i + 0.5) * s, cl.gridY + (j + 0.5) * s, cl.ids[idx])
			}
		}
		for (let i = 0; i < 9; i++) {
			let st = inventory.slots[i]
			if (st) drawIcon(cl.hotX + (i + 0.5) * s, cl.hotY + s / 2, st.id)
		}
		if (inventory.cursor) drawIcon(mouseX, mouseY, inventory.cursor.id)
		gl.enable(gl.DEPTH_TEST)
		ctx.drawImage(gl.canvas, 0, 0)

		// The creative palette draws no slot counts by default, but hotbar
		// stacks and a held stack still need their counts while dragging.
		ctx.textAlign = "right"
		ctx.fillStyle = "white"
		ctx.strokeStyle = "black"
		ctx.lineWidth = 2
		ctx.font = Math.max(10, Math.round(s * 0.42)) + "px Poppins"
		for (let i = 0; i < 9; i++) {
			let stack = inventory.slots[i]
			if (stack && stack.count > 1) {
				ctx.strokeText(stack.count, cl.hotX + (i + 1) * s - 3, cl.hotY + s - 4)
				ctx.fillText(stack.count, cl.hotX + (i + 1) * s - 3, cl.hotY + s - 4)
			}
		}
		if (inventory.cursor && inventory.cursor.count > 1) {
			ctx.strokeText(inventory.cursor.count, mouseX + s / 2 - 3, mouseY + s / 2 - 4)
			ctx.fillText(inventory.cursor.count, mouseX + s / 2 - 3, mouseY + s / 2 - 4)
		}

		if (hit && hit.region === "palette") {
			ctx.textAlign = "left"
			ctx.font = Math.max(12, Math.round(s * 0.4)) + "px Poppins"
			let name = itemName(hit.id)
			let tw = ctx.measureText(name).width
			ctx.fillStyle = "rgba(16, 0, 16, 0.94)"
			ctx.fillRect(mouseX + 8, mouseY + 4, tw + 10, 22)
			ctx.fillStyle = "white"
			ctx.fillText(name, mouseX + 13, mouseY + 20)
		}
		ctx.textAlign = "left"
	}
	function clickCreative(button, shift) {
		let cl = creativeLayout()
		let hit = creativeSlotAt(mouseX, mouseY, cl)
		if (!hit) {
			inventory.cursor = null
		} else if (hit.region === "palette") {
			inventory.cursor = { id: hit.id, count: 1 }
		} else {
			let ref = { region: "hotbar", index: hit.index }
			let stack = getStack(ref)
			if (inventory.cursor) {
				setStack(ref, inventory.cursor)
				inventory.cursor = stack
			} else if (stack) {
				inventory.cursor = stack
				setStack(ref, null)
			}
		}
		updateHolding()
		drawScreens.inventory()
	}

	function openCommand() {
		if (commandOpen) return
		setCommandOpen(true)
		canvas.onblur()
		releasePointer()
		boxCenterTop.classList.add("command-box")
		boxCenterTop.classList.remove("hidden")
		boxCenterTop.value = "/"
		boxCenterTop.focus()
		try { boxCenterTop.setSelectionRange(1, 1) } catch (e) {}
	}
	function closeCommand() {
		if (!commandOpen) return
		setCommandOpen(false)
		boxCenterTop.classList.remove("command-box")
		boxCenterTop.classList.add("hidden")
		boxCenterTop.value = ""
		// A command such as /kill can switch to the death screen while the
		// command box closes; do not steal the cursor back in that case.
		if (screen !== "death") getPointer()
	}
	function runCommand(str) {
		let parts = str.trim().replace(/^\/+/, "").split(/\s+/)
		if (!parts[0]) return
		let cmd = parts[0].toLowerCase()
		let reply = ""
		if (cmd === "gamemode" || cmd === "gm") {
			let mode = (parts[1] || "").toLowerCase()
			if (mode === "creative" || mode === "c" || mode === "1") {
				setGameMode("creative")
			} else if (mode === "survival" || mode === "s" || mode === "0") {
				setGameMode("survival")
			} else {
				setGameMode(gameMode === "creative" ? "survival" : "creative")
			}
			if (gameMode === "survival") {
				p.flying = false
				p.spectator = false
			}
			setUpdateHUD(true)
			reply = "Game mode set to " + gameMode
		} else if (cmd === "time") {
			let names = { dawn: 0, morning: 1500, noon: 3000, day: 3000, dusk: 6000, evening: 6000, night: 7500, midnight: 9000 }
			let ticks = (DAY_LENGTH * 1000 / 50)
			let sub = (parts[1] || "").toLowerCase()
			if (sub === "set" && parts[2] !== undefined) {
				let v = names[parts[2].toLowerCase()]
				if (v === undefined) v = parseFloat(parts[2])
				if (!isNaN(v)) world.time = ((v * 50) % (DAY_LENGTH * 1000) + DAY_LENGTH * 1000) % (DAY_LENGTH * 1000)
			} else if (sub === "add" && parts[2] !== undefined) {
				let v = parseFloat(parts[2])
				if (!isNaN(v)) world.time = ((world.time + v * 50) % (DAY_LENGTH * 1000) + DAY_LENGTH * 1000) % (DAY_LENGTH * 1000)
			}
			reply = "Time set to " + (Math.round(world.time / 50) % ticks) + "/" + ticks + " ticks"
		} else if (cmd === "kill") {
			hurt(1000, "generic", true)
			reply = "Killed player"
		} else if (cmd === "biome") {
			let biome = BIOMES[biomeAt(Math.floor(p.x), Math.floor(p.z))]
			reply = "Biome: " + biome.name
		} else if (cmd === "help") {
			reply = "Commands: /gamemode creative | /gamemode survival | /time set dawn|noon|dusk|night | /time add <ticks> | /biome | /kill"
		} else {
			reply = "Unknown command: " + cmd
		}
		window.message.innerText = reply
		window.message.classList.remove("hidden")
		clearTimeout(runCommand.msgTimer)
		runCommand.msgTimer = setTimeout(() => window.message.classList.add("hidden"), 2000)
	}
	if (boxCenterTop) {
		boxCenterTop.onkeydown = function(e) {
			if (!commandOpen) return
			e.stopPropagation()
			if (e.key === "Enter") {
				runCommand(boxCenterTop.value)
				closeCommand()
			} else if (e.key === "Escape") {
				closeCommand()
			}
		}
	}


		function title() {
			let title = "MCClone"
			let subtext = "MINECRAFT IN JAVASCRIPT"
			let font = "Poppins"
			strokeWeight(1)
			ctx.textAlign = 'center'

			ctx.font = "bold 120px " + font
			fill(30)
			text(title, width / 2, 158)
			fill(40)
			text(title, width / 2, 155)
			ctx.font = "bold 121px " + font
			fill(50)
			text(title, width / 2, 152)
			fill(70)
			text(title, width / 2, 150)
			fill(90)
			ctx.font = "bold 122px " + font
			text(title, width / 2, 148)
			fill(110)
			text(title, width / 2, 145)

			ctx.font = "bold 32px " + font
			fill(50)
			text(subtext, width / 2-1, 180)
			text(subtext, width / 2+1, 180)
			text(subtext, width / 2, 179)
			text(subtext, width / 2, 181)
			ctx.font = "bold 32px " + font
			fill(150)
			text(subtext, width / 2, 180)
		}
		const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height)
		const dirt = () => { if (dirtbg) ctx.putImageData(dirtbg, 0, 0) }
		function drawMenuBackground() {
			// Keep the old generated scene out of the menu entirely. This blank
			// frame stays up until the real backdrop has decoded.
			ctx.fillStyle = "#000"
			ctx.fillRect(0, 0, width, height)
			if (menuBackground && menuBackground.complete && menuBackground.naturalWidth) {
				// Cover the viewport without stretching the landscape.
				let scale = Math.max(width / menuBackground.naturalWidth, height / menuBackground.naturalHeight)
				let w = menuBackground.naturalWidth * scale
				let h = menuBackground.naturalHeight * scale
				ctx.drawImage(menuBackground, (width - w) / 2, (height - h) / 2, w, h)
			}
		}

		drawScreens["main menu"] = () => {
			drawMenuBackground()
			title()
			fill(220)
			ctx.font = "20px Poppins"
			ctx.textAlign = 'left'
			text("JSCraft " + version, width - (width - 2), height - 2)
		}

		drawScreens.play = () => {
			controls()
			runGravity()
			resolveContactsAndUpdatePosition()
			updateMining()
			updateDrops()
			updateTnts()
			updateFallingBlocks()
			updateArrows()
			updatePotionClouds()
			updateFireworks()
			updateFishingBobbers()
			updateVehicles()
			updateEndCrystals()
			updateRemotePlayers()
			tickFluids()
			updateSurvival()
			if (screen !== "play") return

			if (updateHUD) {
				clear()
				gl.clearColor(0, 0, 0, 0)
				gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)
				hud()
				ctx.drawImage(gl.canvas, 0, 0)
				hotbarCounts()
				setUpdateHUD(false)
				setFreezeFrame(false)

				gl.clearColor(sky[0], sky[1], sky[2], 1.0)
			}
			defineWorld()
		}

		drawScreens.loading = () => {
			// This is really stupid, but it basically works by teleporting the player around to each chunk I'd like to load.
			// If chunks loaded from a save aren't generated, they're deleted from the save, so this loads them all.

			let sub = maxLoad - world.loadFrom.length - 9
			let standing = true
			if (world.loadFrom.length) {
				let load = world.loadFrom[0]
				p.x = load.x * 16
				p.y = load.y * 16
				p.z = load.z * 16
				standing = false
			} else {
				p.x = p2.x
				p.y = p2.y
				p.z = p2.z

				let cx = p.x >> 4
				let cz = p.z >> 4

				for (let x = cx - 1; x <= cx + 1; x++) {
					for (let z = cz - 1; z <= cz + 1; z++) {
						if (!world.chunks[x] || !world.chunks[x][z] || !world.chunks[x][z].buffer) {
							standing = false
						} else {
							sub++
						}
					}
				}
			}

			if (standing) {
				play()
				return
			}

			world.tick()

			let progress = Math.round(100 * sub / maxLoad)
			dirt()
			fill(255)
			textSize(30)
			ctx.textAlign = "center"
			text(`Loading... ${progress}% complete (${sub} / ${maxLoad})`, width / 2, height / 2)
		}

		drawScreens.inventory = () => {
			if (gameMode === "creative") {
				drawCreative()
			} else {
				drawInv()
			}
		}

		drawScreens.chest = drawChest
		drawScreens.furnace = drawFurnace
		drawScreens.crafting = drawCraftingTable
		drawScreens.sign = drawSignEditor

		drawScreens.pause = () => {
			strokeWeight(1)
			clear()
			ctx.drawImage(gl.canvas, 0, 0)

			textSize(60)
			fill(0, 0, 0)
			ctx.textAlign = 'center'
			text("Paused", width / 2, 60)
		}

		drawScreens.death = () => {
			if (gl && gl.canvas) ctx.drawImage(gl.canvas, 0, 0)
			ctx.fillStyle = "rgba(90, 0, 0, 0.62)"
			ctx.fillRect(0, 0, width, height)
			ctx.fillStyle = "rgba(0, 0, 0, 0.28)"
			ctx.fillRect(0, 0, width, height)
			ctx.textAlign = 'center'
			fill(255)
			textSize(Math.max(32, Math.min(60, Math.round(width / 15))))
			text("You Died!", width / 2, height / 2 - 84)
			textSize(16)
			ctx.fillStyle = "rgba(255, 255, 255, 0.82)"
			text(p.deathMessage || "You died", width / 2, height / 2 - 52)
			textSize(14)
			text("Score: " + (p.deathScore || 0), width / 2, height / 2 - 30)
		}

		drawScreens.options = () => {
			clear()
		}
		drawScreens["creation menu"] = () => {
			dirt()
			ctx.textAlign = 'center'
			textSize(20)
			fill(255)
			text("Create New World", width / 2, 20)
		}
		drawScreens["loadsave menu"] = () => {
			dirt()
			ctx.textAlign = 'center'
			textSize(20)
			fill(255)
			text("Select World", width / 2, 20)
		}
		drawScreens.editworld = dirt

	// Give the font time to load and redraw the homescreen
	setTimeout(e => {
		drawScreens[screen]()
		Button.draw()
		Slider.draw()
	}, 100)



export {
	fill, stroke, line, text, textSize, strokeWeight, cursor,
	Slider, Button, initButtons,
	drawIcon, heldStack, updateHolding, addItem, pickBlock, invCapacity, consumeHeld, blockDrop,
	updateCraftResult, consumeCraft, craftOnce,
	invLayout, slotPos, slotAt, getStack, setStack, stackIntoRange, quickMove,
	beginItemDrag, updateItemDrag, endItemDrag, slotAtScreen, collectMatchingItems,
	hotbar, hud, drawInv, clickInv,
	openChest, closeChest, drawChest, clickChest,
	openFurnace, closeFurnace, drawFurnace, clickFurnace,
	openCraftingTable, closeCraftingTable, drawCraftingTable, clickCraftingTable,
	openSign, closeSign, handleSignKey, drawSignEditor,
	creativeIds, creativeLayout, creativeScrollbar, creativeSlotAt, drawCreative, clickCreative,
	openCommand, closeCommand, runCommand,
	drawScreens, changeScene, play, title
}
