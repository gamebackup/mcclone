import { seedHash, openSimplexNoise, noiseSeed, noise, BIOMES, biomeClimateAt, biomeSample } from './noise.js'
import { blockData, BLOCK_COUNT, blockIds } from './blocks.js'
import { TerrainProvider } from './TerrainProvider.js'
import { smeltResult, fuelValue } from './items.js'
import {
	win, doc, world, setWorld, p, p2, gl, screen, hitBox, gameMode, setGameMode, Key, glCache,
	settings, generatedChunks, setGeneratedChunks, height, generator, maxHeight,
	blockOutlines, setBlockOutlines, blockFill, setBlockFill, drops, analytics,
	caveNoise, setCaveNoise, worldSeed, setWorldSeed, matrix,
	worlds, selectedWorld, setSelectedWorld, superflat, setSuperflat,
	trees, setTrees, caves, setCaves, version,
	renderedChunks, setRenderedChunks, loadString, inventory
} from './state.js'
import { Button, addItem, blockDrop } from './ui.js'
import { Chunk, emptySection, fullSection } from './chunk.js'
import {
	BASE_MASK, STATE_MASK, TORCH_HANGING, LANTERN_HANGING, use3d, computeSky, renderSkybox, DAY_LENGTH, MAX_STACK
} from './engine.js'
import { block2, initModelView, changeWorldBlock, newWorldBlock, renderMining, resetSurvival } from './player.js'
import { isSupporter, isTorchSupport, fluidWakeAround, renderDrops, renderTnts, renderFallingBlocks, renderArrows, renderPotionClouds, renderFireworks, renderFishingBobbers, renderVehicles, renderEndCrystals, renderDecorations, renderPoplarLeaves, renderCampfires, checkFallingAt } from './features.js'
import { renderSignTexts } from './signs.js'
import { renderRemotePlayers } from './playerModel.js'
import { NETHER_ORIGIN, NETHER_SKY, isNetherChunkPosition, netherFloorHeight, netherCeilingHeight, portalExitNear } from './nether.js'

	let databasePromise = null
	function createDatabase() {
		if (databasePromise) return databasePromise
		databasePromise = new Promise((resolve, reject) => {
			let request
			try {
				request = window.indexedDB.open("MineKhan", 1)
			} catch (e) {
				reject(e)
				return
			}

			request.onupgradeneeded = function(event) {
				let DB = event.target.result
				
				let store = DB.createObjectStore("worlds", { keyPath: "id" })
				store.createIndex("id", "id", { unique: true })
				store.createIndex("data", "data", { unique: false })
			}

			request.onsuccess = function() {
				let db = request.result
				db.onversionchange = function() {
					db.close()
					databasePromise = null
				}
				resolve(db)
			}

			request.onerror = function(e) {
				console.error(e)
				reject(e)
			}
		})
		// Don't cache a failed open; a later save can try again.
		databasePromise.catch(() => { databasePromise = null })
		return databasePromise
	}
	async function loadFromDB(id) {
		let db = await createDatabase()
		return new Promise(resolve => {
			let trans = db.transaction("worlds", "readonly")
			let store = trans.objectStore("worlds")
			let req = id ? store.get(id) : store.getAll()
			req.onsuccess = function() {
				resolve(req.result)
			}
			req.onerror = function() {
				resolve(null)
			}
		})
	}
	async function saveToDB(id, data) {
		let db = await createDatabase()
		return new Promise((resolve, reject) => {
			let trans = db.transaction("worlds", "readwrite")
			let store = trans.objectStore("worlds")
			let req = store.put({ id: id, data: data })
			req.onerror = function(e) {
				reject(e)
			}
			trans.oncomplete = function() {
				resolve(req.result)
			}
			trans.onerror = function(e) {
				reject(trans.error || e)
			}
			trans.onabort = function(e) {
				reject(trans.error || e)
			}
		})
	}
	async function deleteFromDB(id) {
		let db = await createDatabase()
		return new Promise((resolve, reject) => {
			let trans = db.transaction("worlds", "readwrite")
			let store = trans.objectStore("worlds")
			let req = store.delete(id)
			req.onerror = function(e) {
				reject(e)
			}
			trans.oncomplete = function() {
				resolve(req.result)
			}
			trans.onerror = function(e) {
				reject(trans.error || e)
			}
			trans.onabort = function(e) {
				reject(trans.error || e)
			}
		})
	}

	const PENDING_SAVE_KEY = "MineKhan.pendingSave"
	function getSaveData() {
		if (!world || !world.id) return null
		let code
		try {
			code = world.getSaveString()
		} catch (e) {
			console.error(e)
			return null
		}
		return {
			id: world.id,
			edited: Date.now(),
			name: world.name,
			version: version,
			code: code
		}
	}
	function save() {
		let data = getSaveData()
		if (!data) return
		saveToDB(data.id, data).then(() => world.edited = data.edited).catch(e => console.error(e))
	}
	function savePending(data) {
		try {
			win.localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(data))
		} catch (e) {
			// IndexedDB autosave is the fallback when localStorage is full.
			console.error(e)
		}
	}
	function clearPendingSave() {
		try {
			win.localStorage.removeItem(PENDING_SAVE_KEY)
		} catch (e) {}
	}
	function readPendingSave() {
		try {
			let raw = win.localStorage.getItem(PENDING_SAVE_KEY)
			if (!raw) return null
			let data = JSON.parse(raw)
			if (!data || data.id == null || typeof data.code !== "string") {
				win.localStorage.removeItem(PENDING_SAVE_KEY)
				return null
			}
			return data
		} catch (e) {
			clearPendingSave()
			return null
		}
	}
	async function restorePendingSave() {
		let pending = readPendingSave()
		if (!pending) return
		try {
			let existing = await loadFromDB(pending.id)
			if (existing && existing.data && existing.data.edited >= pending.edited) {
				clearPendingSave()
				return
			}
			await saveToDB(pending.id, pending)
			clearPendingSave()
		} catch (e) {
			// Leave the snapshot in place so the next load can retry it.
			console.error(e)
		}
	}
	function saveOnPageHide() {
		if (!world || !world.active || !world.id) return
		let data = getSaveData()
		if (!data) return
		// localStorage is synchronous, so this snapshot survives a refresh even
		// if the browser ends the page before the IndexedDB transaction commits.
		savePending(data)
		saveToDB(data.id, data).then(() => world.edited = data.edited).catch(e => console.error(e))
	}
	// Persist when the page is refreshed or closed. Registering this at module
	// load means it does not depend on WebGL initialization completing.
	win.addEventListener("pagehide", saveOnPageHide)

	
	win.saveToDB = saveToDB
	win.loadFromDB = loadFromDB
	win.createDatabase = createDatabase
	win.deleteFromDB = deleteFromDB



	function chunkDist(c) {
		let dx = p.x - c.x
		let dz = p.z - c.z
		if (dx > 16) {
			dx -= 16
		} else if (dx > 0) {
			dx = 0
		}
		if (dz > 16) {
			dz -= 16
		} else if (dz > 0) {
			dz = 0
		}
		return Math.sqrt(dx * dx + dz * dz)
	}
	function sortChunks(c1, c2) { //Sort the list of chunks based on distance from the player
		let dx1 = p.x - c1.x - 8
		let dy1 = p.z - c1.z - 8
		let dx2 = p.x - c2.x - 8
		let dy2 = p.z - c2.z - 8
		return dx1 * dx1 + dy1 * dy1 - (dx2 * dx2 + dy2 * dy2)
	}
	function fillReqs(x, z) {
		// Chunks must all be loaded first.
		var done = true
		for (let i = x - 2; i <= x + 2; i++) {
			for (let j = z - 2; j <= z + 2; j++) {
				let chunk = world.loaded[(i + world.offsetX) * world.lwidth + j + world.offsetZ]
				if (!chunk) {
					// Outside the loaded area: nothing to wait for.
					continue
				}
				if (!chunk.generated) {
					// Fill requests run every tick for the same neighbours, so avoid
					// piling duplicate entries onto the queues.
					if (!world.generateQueue.includes(chunk)) {
						world.generateQueue.push(chunk)
					}
					done = false
				}
				if (!chunk.populated && i >= x - 1 && i <= x + 1 && j >= z - 1 && j <= z + 1) {
					if (!world.populateQueue.includes(chunk)) {
						world.populateQueue.push(chunk)
					}
					done = false
				}
			}
		}
		return done
	}
	function maxDist(x, z, x2, z2) {
		let ax = Math.abs(x2 - x)
		let az = Math.abs(z2 - z)
		return Math.max(ax, az)
	}
	function renderFilter(chunk) {
		return maxDist(chunk.x >> 4, chunk.z >> 4, p.cx, p.cz) <= settings.renderDistance
	}

	function debug(message) {
		let ellapsed = performance.now() - debug.start
		if (ellapsed > 30) {
			console.log(message, ellapsed.toFixed(2), "milliseconds")
		}
	}

	let fogDist = 16
	class World {
		constructor() {
			setGeneratedChunks(0)
			fogDist = 16
			p.x = 8
			p.z = 8
			p.previousX = p.x
			p.previousZ = p.z
			p.y = superflat ? 6 : (Math.round(noise(8 * generator.smooth, 8 * generator.smooth) * generator.height) + 2 + generator.extra)
			resetSurvival()
			inventory.slots = []
			inventory.armor = [null, null, null, null]
			inventory.craft = new Array(4).fill(null)
			inventory.result = null
			inventory.cursor = null
			inventory.hotbarSlot = 0

			//Initialize the world's arrays
			this.chunks = []
			this.loaded = []
			this.sortedChunks = []
			this.offsetX = 0
			this.offsetZ = 0
			this.lwidth = 0
			this.chunkGenQueue = []
			this.populateQueue = []
			this.generateQueue = []
			this.meshQueue = []
			this.loadFrom = []
			this.chests = {}
			this.signs = {}
			this.furnaces = {}
			// The terrain provider owns the climate/density/surface pipeline.
			// It reads the live noise profile, so it keeps working after a save
			// rewrites the world seed.
			this.terrainProvider = new TerrainProvider()
			this.furnaceLastTick = 0
			this.furnaceAccum = 0
			this.crops = {}
			this.cropLastTick = 0
			this.cropAccum = 0
			this.dimension = "overworld"
			this.portalLinks = []
			this.pendingPortalSite = null
			this.lastChunk = ","
			this.time = 150000 // Time of day in milliseconds (150s = noon)
			this.lastRender = 0
		}
		genChunk(chunk) {
			let trueX = chunk.x
			let trueZ = chunk.z

			if (chunk.generated) {
				return false
			}
			// Pick the generator from the chunk's position rather than the
			// player's current dimension. Loading a save with edited chunks from
			// both dimensions must not turn nether chunks into overworld ones
			// (or the reverse) while the loading screen visits each edit.
			if (isNetherChunkPosition(trueX, trueZ)) {
				this.genNetherChunk(chunk)
			} else {
				for (let i = 0; i < 16; i++) {
					for (let k = 0; k < 16; k++) {
						let wx = trueX + i
						let wz = trueZ + k
						let column = this.terrainProvider.sampleColumn(wx, wz)
						this.terrainProvider.fillColumn(chunk, i, k, column)
					}
				}
			}
			chunk.generated = true
			this.buildPendingPortal(chunk)
		}
		genNetherChunk(chunk) {
			let baseX = chunk.x
			let baseZ = chunk.z
			let seed = (Math.imul(baseX, 374761393) ^ Math.imul(baseZ, 668265263) ^ worldSeed) >>> 0
			let rnd = function() {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed / 4294967296
			}

			// Solid netherrack floor and roof with a broad open cavern between
			// them. Lava fills the lowest part, and noise creates the overhangs,
			// stalactites and pillars that make the space read as the Nether.
			for (let i = 0; i < 16; i++) {
				for (let k = 0; k < 16; k++) {
					let wx = baseX + i
					let wz = baseZ + k
					let floor = netherFloorHeight(wx, wz)
					let ceiling = netherCeilingHeight(wx, wz)
					let lavaTop = Math.min(30, floor - 3)
					chunk.tops[k * 16 + i] = floor
					chunk.setBlock(i, 0, k, blockIds.bedrock)
					for (let y = 1; y <= lavaTop; y++) chunk.setBlock(i, y, k, blockIds.lava)
					for (let y = lavaTop + 1; y <= floor; y++) chunk.setBlock(i, y, k, blockIds.netherrack)

					if (noise(wx * 0.09 + 52.1, wz * 0.09 - 17.7) > 0.68) {
						chunk.setBlock(i, floor, k, blockIds.soulSand)
					}

					let hangNoise = noise(wx * 0.16 + 13.7, 9.5, wz * 0.16 - 61.3)
					if (hangNoise > 0.65) {
						let hang = 1 + Math.floor((hangNoise - 0.65) * 40)
						for (let y = ceiling - 1; y >= ceiling - hang && y > floor + 2; y--) {
							chunk.setBlock(i, y, k, blockIds.netherrack)
						}
					}

					let pillarNoise = noise(wx * 0.12 - 7.1, 3.2, wz * 0.12 + 33.9)
					if (pillarNoise > 0.73) {
						let top = Math.min(ceiling - 3, floor + 2 + Math.floor((pillarNoise - 0.73) * 45))
						for (let y = floor + 1; y <= top; y++) chunk.setBlock(i, y, k, blockIds.netherrack)
					}

					for (let y = ceiling; y <= Math.min(maxHeight, 160); y++) {
						chunk.setBlock(i, y, k, blockIds.netherrack)
					}

					if (noise(wx * 0.21 + 4.1, wz * 0.21 - 8.4) > 0.77) {
						chunk.setBlock(i, ceiling - 1, k, blockIds.glowstone)
						if (i < 15) chunk.setBlock(i + 1, ceiling - 1, k, blockIds.glowstone)
					}
				}
			}

			// Small ore pockets inside the netherrack. Quartz is common, gold
			// is uncommon, and ancient debris stays deep near the lava.
			for (let i = 0; i < 26; i++) {
				let lx = rnd() * 16 | 0
				let lz = rnd() * 16 | 0
				let floor = netherFloorHeight(baseX + lx, baseZ + lz)
				let y = 32 + Math.floor(rnd() * Math.max(1, floor - 32))
				if (y >= floor) y = floor - 1
				if (chunk.getBlock(lx, y, lz) !== blockIds.netherrack) continue
				let ore = i < 18 ? blockIds.netherQuartzOre : i < 24 ? blockIds.netherGoldOre : blockIds.ancientDebris
				if (ore === blockIds.ancientDebris && y > 36) ore = blockIds.netherGoldOre
				chunk.setBlock(lx, y, lz, ore)
			}

			chunk.caves = true
			chunk.populated = true
		}
		netherSiteFor(px, pz) {
			let nx = NETHER_ORIGIN + Math.floor(px / 8)
			let nz = NETHER_ORIGIN + Math.floor(pz / 8)
			let x = (nx >> 4) * 16 + 8
			let z = (nz >> 4) * 16 + 8
			return { kind: "nether", x: x, z: z, baseY: netherFloorHeight(x, z) + 1 }
		}
		netherSiteFromLink(link) {
			let x = Math.floor((link.nX - 1) / 16) * 16 + 8
			let z = Math.floor(link.nZ / 16) * 16 + 8
			return { kind: "nether", x: x, z: z, baseY: netherFloorHeight(x, z) + 1 }
		}
		overworldSiteFor(nx, nz) {
			let wx = Math.round((nx - NETHER_ORIGIN) * 8)
			let wz = Math.round((nz - NETHER_ORIGIN) * 8)
			let x = Math.floor(wx / 16) * 16 + 8
			let z = Math.floor(wz / 16) * 16 + 8
			let baseY = this.terrainProvider.sampleColumn(x, z).height + 1
			return { kind: "overworld", x: x, z: z, baseY: baseY }
		}
		buildPendingPortal(chunk) {
			let site = this.pendingPortalSite
			if (!site || site.built) return
			if ((site.x >> 4) !== (chunk.x >> 4) || (site.z >> 4) !== (chunk.z >> 4)) return
			let nether = isNetherChunkPosition(chunk.x, chunk.z)
			if (site.kind === "nether" && !nether) return
			if (site.kind === "overworld" && nether) return
			this.buildPortalSite(chunk, site)
		}
		buildPortalSite(chunk, site) {
			let lx = site.x - chunk.x
			let lz = site.z - chunk.z
			let baseY = site.baseY
			if (lx < 3 || lx > 11 || lz < 3 || lz > 12 || baseY < 2) return
			if (chunk.getBlock(lx, baseY, lz) === blockIds.netherPortal) {
				site.built = true
				return
			}
			let floorBlock = site.kind === "nether" ? blockIds.netherrack : blockIds.stone
			for (let dx = -3; dx <= 4; dx++) {
				for (let dz = -3; dz <= 3; dz++) {
					for (let y = baseY; y <= Math.min(maxHeight, baseY + 5); y++) {
						chunk.setBlock(lx + dx, y, lz + dz, 0, false, true)
					}
					chunk.setBlock(lx + dx, baseY - 1, lz + dz, floorBlock, false, true)
					chunk.setBlock(lx + dx, baseY - 2, lz + dz, floorBlock, false, true)
					if (lx + dx >= 0 && lx + dx < 16 && lz + dz >= 0 && lz + dz < 16) {
						chunk.tops[(lz + dz) * 16 + lx + dx] = baseY - 1
					}
				}
			}
			// Bottom and top of the frame, then the two side pillars.
			for (let u = -1; u <= 2; u++) {
				chunk.setBlock(lx + u, baseY - 1, lz, blockIds.obsidian, false, true)
				chunk.setBlock(lx + u, baseY + 3, lz, blockIds.obsidian, false, true)
			}
			for (let y = baseY; y <= baseY + 2; y++) {
				chunk.setBlock(lx - 1, y, lz, blockIds.obsidian, false, true)
				chunk.setBlock(lx + 2, y, lz, blockIds.obsidian, false, true)
			}
			for (let u = 0; u <= 1; u++) {
				for (let y = baseY; y <= baseY + 2; y++) {
					chunk.setBlock(lx + u, y, lz, blockIds.netherPortal, false, true)
				}
			}
			site.built = true
		}
		schedulePortalSite(site) {
			this.pendingPortalSite = site
			let chunk = this.chunks[site.x >> 4] && this.chunks[site.x >> 4][site.z >> 4]
			if (chunk && chunk.generated) {
				this.buildPortalSite(chunk, site)
				if (chunk.buffer && gl) {
					gl.deleteBuffer(chunk.buffer)
					chunk.buffer = null
				}
				chunk.optimized = false
			}
		}
		travelTo(x, y, z) {
			p.x = x
			p.y = y
			p.z = z
			p.previousX = x
			p.previousY = y
			p.previousZ = z
			p.velocity.x = 0
			p.velocity.y = 0
			p.velocity.z = 0
			p.fallDistance = 0
			p.fireTicks = 0
			p.inLava = false
			p.portalCooldown = Date.now() + 2500
			p.portalEntered = 0
			p2.x = x
			p2.y = y
			p2.z = z
		}
		enterNether() {
			if (this.dimension === "nether") return false
			let sourceExit = portalExitNear(this, p.x, p.y, p.z)
			let link = this.portalLinks.find(l => {
				let dx = l.owX - p.x, dy = l.owY - p.y, dz = l.owZ - p.z
				if (dx * dx + dy * dy + dz * dz <= 9) return true
				let ex = l.owExitX - p.x, ey = l.owExitY - p.y, ez = l.owExitZ - p.z
				return ex * ex + ey * ey + ez * ez <= 9
			})
			let target
			if (link) {
				target = { x: link.nExitX, y: link.nExitY, z: link.nExitZ }
				this.schedulePortalSite(this.netherSiteFromLink(link))
			} else {
				let site = this.netherSiteFor(p.x, p.z)
				let existing = this.portalLinks.find(l => Math.abs(l.nX - (site.x + 1)) < 0.01 && Math.abs(l.nZ - site.z) < 0.01)
				if (existing) {
					target = { x: existing.nExitX, y: existing.nExitY, z: existing.nExitZ }
				} else {
					target = { x: site.x + 1, y: site.baseY + p.bottomH + 0.08, z: site.z + 1.5 }
					this.schedulePortalSite(site)
				}
				this.portalLinks.push({
					owX: p.x, owY: p.y, owZ: p.z,
					owExitX: sourceExit.x, owExitY: sourceExit.y, owExitZ: sourceExit.z,
					nX: site.x + 1, nY: site.baseY + 1, nZ: site.z,
					nExitX: target.x, nExitY: target.y, nExitZ: target.z
				})
			}
			this.dimension = "nether"
			this.travelTo(target.x, target.y, target.z)
			this.loadChunks()
			return true
		}
		enterOverworld() {
			if (this.dimension !== "nether") return false
			let link = this.portalLinks.find(l => {
				let dx = l.nX - p.x, dy = l.nY - p.y, dz = l.nZ - p.z
				if (dx * dx + dy * dy + dz * dz <= 9) return true
				let ex = l.nExitX - p.x, ey = l.nExitY - p.y, ez = l.nExitZ - p.z
				return ex * ex + ey * ey + ez * ez <= 9
			})
			let target
			if (link) {
				target = { x: link.owExitX, y: link.owExitY, z: link.owExitZ }
			} else {
				let site = this.overworldSiteFor(p.x, p.z)
				target = { x: site.x + 1, y: site.baseY + p.bottomH + 0.08, z: site.z + 1.5 }
				let exit = portalExitNear(this, p.x, p.y, p.z)
				this.portalLinks.push({
					owX: target.x, owY: target.y, owZ: target.z,
					owExitX: target.x, owExitY: target.y, owExitZ: target.z,
					nX: p.x, nY: p.y, nZ: p.z,
					nExitX: exit.x, nExitY: exit.y, nExitZ: exit.z
				})
				this.schedulePortalSite(site)
			}
			this.dimension = "overworld"
			this.travelTo(target.x, target.y, target.z)
			this.loadChunks()
			return true
		}
		getAdjacentSubchunks(x, y, z) {
			let minChunkX = x - 16 >> 4
			let maxChunkX = x + 16 >> 4
			let minChunkY = y - 16 >> 4
			let maxChunkY = y + 16 >> 4
			let minChunkZ = z - 16 >> 4
			let maxChunkZ = z + 16 >> 4
			let section = null
			let ret = []
			for (x = minChunkX; x <= maxChunkX; x++) {
				for (let y = minChunkY; y <= maxChunkY; y++) {
					for (z = minChunkZ; z <= maxChunkZ; z++) {
						if (y < 0) {
							ret.push(fullSection.blocks)
						} else if (this.chunks[x] && this.chunks[x][z]) {
							section = this.chunks[x][z].sections[y] || emptySection
							ret.push(section.blocks)
						} else {
							ret.push(emptySection.blocks)
						}
					}
				}
			}
			return ret
		}
		updateBlock(x, y, z, lazy) {
			let chunk = this.chunks[x >> 4] && this.chunks[x >> 4][z >> 4]
			if (chunk && chunk.buffer) {
				chunk.updateBlock(x & 15, y, z & 15, this, lazy)
			}
		}
		getWorldBlock(x, y, z) {
			if (!this.chunks[x >> 4] || !this.chunks[x >> 4][z >> 4]) {
				return blockIds.air
			}
			return this.chunks[x >> 4][z >> 4].getBlock(x & 15, y, z & 15)
		}
		chestKey(x, y, z) {
			return x + "," + y + "," + z
		}
		getChest(x, y, z) {
			let key = this.chestKey(x, y, z)
			if (!this.chests[key]) this.chests[key] = new Array(27).fill(null)
			return this.chests[key]
		}
		deleteChest(x, y, z) {
			delete this.chests[this.chestKey(x, y, z)]
		}
		getFurnace(x, y, z) {
			let key = this.chestKey(x, y, z)
			if (!this.furnaces[key]) {
				this.furnaces[key] = { x: x, y: y, z: z, slots: [null, null, null], burnTime: 0, burnTotal: 0, cookTime: 0 }
			}
			return this.furnaces[key]
		}
		deleteFurnace(x, y, z) {
			let key = this.chestKey(x, y, z)
			let furnace = this.furnaces[key] || null
			delete this.furnaces[key]
			return furnace
		}
		tickFurnaces() {
			let now = win.performance.now()
			if (!this.furnaceLastTick) {
				this.furnaceLastTick = now
				this.furnaceAccum = 0
				return
			}
			let delta = now - this.furnaceLastTick
			this.furnaceLastTick = now
			if (delta > 1000) delta = 1000
			this.furnaceAccum = (this.furnaceAccum || 0) + delta
			let steps = 0
			while (this.furnaceAccum >= 50 && steps < 20) {
				this.furnaceAccum -= 50
				steps++
				this.tickFurnaceStep()
			}
		}
		registerCropsInChunk(chunk) {
			if (!chunk || !chunk.tops || !this.crops) return
			for (let x = 0; x < 16; x++) {
				for (let z = 0; z < 16; z++) {
					let top = chunk.tops[z * 16 + x]
					let minY = Math.max(0, top - 1)
					let maxY = Math.min(maxHeight, top + 2)
					for (let y = minY; y <= maxY; y++) {
						let state = chunk.getBlock(x, y, z)
						let data = blockData[state]
						if (data && data.crop) {
							let wx = chunk.x + x, wz = chunk.z + z
							this.crops[wx + "," + y + "," + wz] = [ wx, y, wz ]
						}
					}
				}
			}
		}
		tickCrops() {
			let now = win.performance.now()
			if (!this.cropLastTick) {
				this.cropLastTick = now
				this.cropAccum = 0
				return
			}
			let delta = now - this.cropLastTick
			this.cropLastTick = now
			if (delta > 500) delta = 500
			this.cropAccum = (this.cropAccum || 0) + delta
			let steps = 0
			while (this.cropAccum >= 50 && steps < 4) {
				this.cropAccum -= 50
				steps++
				this.tickCropStep()
			}
		}
		waterNear(x, y, z) {
			for (let dx = -4; dx <= 4; dx++) {
				for (let dz = -4; dz <= 4; dz++) {
					for (let dy = 0; dy <= 1; dy++) {
						let data = blockData[this.getBlock(x + dx, y + dy, z + dz) & BASE_MASK]
						if (data && data.liquid === "water") return true
					}
				}
			}
			return false
		}
		tickCropStep() {
			if (!this.crops) this.crops = {}
			let keys = Object.keys(this.crops)
			for (let i = 0; i < keys.length; i++) {
				let key = keys[i]
				let pos = this.crops[key]
				if (!Array.isArray(pos) || pos.length < 3) {
					delete this.crops[key]
					continue
				}
				let x = pos[0], y = pos[1], z = pos[2]
				let state = this.getBlock(x, y, z)
				let data = blockData[state]
				if (!data || !data.crop) {
					delete this.crops[key]
					continue
				}
				if (y <= 0 || y >= maxHeight) {
					delete this.crops[key]
					continue
				}
				if ((data.cropAge || 0) >= (data.maxAge || 0)) continue
				let below = this.getBlock(x, y - 1, z)
				let belowData = blockData[below & BASE_MASK]
				if (!belowData || !belowData.farmland) {
					this.setBlock(x, y, z, 0)
					delete this.crops[key]
					continue
				}
				let wet = this.waterNear(x, y - 1, z)
				let moisture = belowData.moisture || 0
				if (wet && moisture < 7) {
					this.setBlock(x, y - 1, z, blockIds.farmland | (7 << 11))
					moisture = 7
				} else if (!wet && moisture) {
					this.setBlock(x, y - 1, z, blockIds.farmland)
					moisture = 0
				}
				// Hydrated farmland roughly triples the growth rate. The check is
				// per 50 ms game tick, so a stage takes a few seconds to a minute.
				if (Math.random() >= (moisture ? 0.02 : 0.006)) continue
				let nextAge = (data.cropAge || 0) + 1
				let next = (state & BASE_MASK) | (nextAge << 11)
				if (blockData[next]) this.setBlock(x, y, z, next)
			}
		}
		tickFurnaceStep() {
			for (let key in this.furnaces) {
				let furnace = this.furnaces[key]
				if (!furnace || !furnace.slots) continue
				let input = furnace.slots[0]
				let fuel = furnace.slots[1]
				let output = furnace.slots[2]
				let result = input && input.count > 0 ? smeltResult(input.id) : 0
				let canSmelt = result && (!output || (output.id === result && output.count < MAX_STACK))
				if (furnace.burnTime > 0) furnace.burnTime--
				if (furnace.burnTime <= 0 && canSmelt && fuel && fuel.count > 0) {
					let value = fuelValue(fuel.id)
					if (value > 0) {
						furnace.burnTime = value
						furnace.burnTotal = value
						fuel.count--
						if (fuel.count <= 0) furnace.slots[1] = null
					}
				}
				if (furnace.burnTime > 0 && canSmelt) {
					furnace.cookTime++
					if (furnace.cookTime >= 200) {
						furnace.cookTime = 0
						input.count--
						if (input.count <= 0) furnace.slots[0] = null
						if (output) output.count++
						else furnace.slots[2] = { id: result, count: 1 }
					}
				} else {
					furnace.cookTime = 0
				}
			}
		}
		signKey(x, y, z) {
			return x + "," + y + "," + z
		}
		getSign(x, y, z) {
			let lines = this.signs && this.signs[this.signKey(x, y, z)]
			let out = [ "", "", "", "" ]
			if (lines) for (let i = 0; i < 4; i++) out[i] = String(lines[i] || "")
			return out
		}
		setSign(x, y, z, lines) {
			if (!this.signs) this.signs = {}
			let out = []
			for (let i = 0; i < 4; i++) {
				let line = lines && lines[i] !== undefined ? String(lines[i]) : ""
				out.push(line.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 15))
			}
			if (!out.some(Boolean)) {
				delete this.signs[this.signKey(x, y, z)]
			} else {
				this.signs[this.signKey(x, y, z)] = out
			}
		}
		deleteSign(x, y, z) {
			if (this.signs) delete this.signs[this.signKey(x, y, z)]
		}
		getBlock(x, y, z) {
			let X = (x >> 4) + this.offsetX
			let Z = (z >> 4) + this.offsetZ
			if (y > maxHeight) {
				return blockIds.air
			} else if (y < 0) {
				return blockIds.bedrock
			} else if (X < 0 || X >= this.lwidth || Z < 0 || Z >= this.lwidth) {
				let state = this.getWorldBlock(x, y, z)
				return blockData[state] ? state : blockIds.air
			}
			let state = this.loaded[X * this.lwidth + Z].getBlock(x & 15, y, z & 15)
			// A stale save can contain state bits with no block behind them.
			// Never let one reach collision, ticking or placement code.
			return blockData[state] ? state : blockIds.air
		}
		setBlock(x, y, z, blockID, lazy) {
			if (!this.chunks[x >> 4] || !this.chunks[x >> 4][z >> 4]) {
				return
			}
			// Replacing or removing a sign must also remove its text. This also
			// catches signs destroyed by explosions or other non-player edits.
			if (this.signs) {
				let key = this.signKey(x, y, z)
				if (this.signs[key]) {
					let next = blockID ? blockData[blockID & BASE_MASK] : null
					if (!next || !next.sign) delete this.signs[key]
				}
			}
			let chunk = this.chunks[x >> 4][z >> 4]

			let prevBlock = this.getBlock(x, y, z)
			if (!this.crops) this.crops = {}
			let prevData = blockData[prevBlock & STATE_MASK]
			let nextData = blockID ? blockData[blockID & STATE_MASK] : null
			let cropKey = x + "," + y + "," + z
			if (prevData && prevData.crop) delete this.crops[cropKey]
			if (nextData && nextData.crop) this.crops[cropKey] = [ x, y, z ]
			let xm = x & 15
			let zm = z & 15
			if (blockID) {
				chunk.setBlock(xm, y, zm, blockID, false, !lazy)
			} else {
				chunk.deleteBlock(xm, y, zm, !lazy)
			}

			if (lazy) {
				return
			}

			//Update the 6 adjacent blocks and 1 changed block
			if (xm && xm !== 15 && zm && zm !== 15) {
				chunk.updateBlock(xm - 1, y, zm, this, lazy)
				chunk.updateBlock(xm + 1, y, zm, this, lazy)
				chunk.updateBlock(xm, y - 1, zm, this, lazy)
				chunk.updateBlock(xm, y + 1, zm, this, lazy)
				chunk.updateBlock(xm, y, zm - 1, this, lazy)
				chunk.updateBlock(xm, y, zm + 1, this, lazy)
			}
			else {
				this.updateBlock(x - 1, y, z, lazy)
				this.updateBlock(x + 1, y, z, lazy)
				this.updateBlock(x, y - 1, z, lazy)
				this.updateBlock(x, y + 1, z, lazy)
				this.updateBlock(x, y, z - 1, lazy)
				this.updateBlock(x, y, z + 1, lazy)
			}

			chunk.updateBlock(xm, y, zm, this, lazy)

			// Update the diagonal chunks so shadows near section corners update too.
			if (xm === 0 && zm === 0) { this.updateBlock(x - 1, y, z - 1, lazy); }
			if (xm === 15 && zm === 0) { this.updateBlock(x + 1, y, z - 1, lazy); }
			if (xm === 0 && zm === 15) { this.updateBlock(x - 1, y, z + 1, lazy); }
			if (xm === 15 && zm === 15) { this.updateBlock(x + 1, y, z + 1, lazy); }

			// Pop off plants (and torches) that just lost their support. In
			// survival the displaced block drops its item.
			let above = this.getBlock(x, y + 1, z)
			let aboveData = blockData[above & STATE_MASK]
			if (aboveData && aboveData.support && !isSupporter(blockID & STATE_MASK)) {
				if (gameMode !== "creative") { addItem(blockDrop(above & BASE_MASK), 1) }
				this.setBlock(x, y + 1, z, 0)
			} else if (aboveData && aboveData.torch && !(above & TORCH_HANGING) && !isTorchSupport(blockID)) {
				// Standing torch whose floor was removed.
				if (gameMode !== "creative") { addItem(blockDrop(above & BASE_MASK), 1) }
				this.setBlock(x, y + 1, z, 0)
			} else if (aboveData && aboveData.lantern && !(above & LANTERN_HANGING) && !isTorchSupport(blockID)) {
				// Standing lantern whose floor was removed.
				if (gameMode !== "creative") { addItem(blockDrop(above & BASE_MASK), 1) }
				this.setBlock(x, y + 1, z, 0)
			}
			let below = this.getBlock(x, y - 1, z)
			let belowData = blockData[below & STATE_MASK]
			if (belowData && belowData.torch && (below & TORCH_HANGING) && !isTorchSupport(blockID)) {
				// Hanging torch whose ceiling was removed.
				if (gameMode !== "creative") { addItem(blockDrop(below & BASE_MASK), 1) }
				this.setBlock(x, y - 1, z, 0)
			} else if (belowData && belowData.lantern && (below & LANTERN_HANGING) && !isTorchSupport(blockID)) {
				// Hanging lantern whose ceiling was removed.
				if (gameMode !== "creative") { addItem(blockDrop(below & BASE_MASK), 1) }
				this.setBlock(x, y - 1, z, 0)
			}
			if (prevBlock !== blockID) {
				fluidWakeAround(x, y, z)
				// A newly placed gravity block may be floating, and removing the
				// support under one makes it fall on the next update.
				checkFallingAt(x, y, z)
				checkFallingAt(x, y + 1, z)
			}
		}
		spawnBlock(x, y, z, blockID) {
			//Sets a block anywhere without causing block updates around it. Only to be used in world gen.

			let chunkX = x >> 4
			let chunkZ = z >> 4
			if (!this.chunks[chunkX]) {
				this.chunks[chunkX] = []
			}
			let chunk = this.chunks[chunkX][chunkZ]
			if (!chunk) {
				chunk = new Chunk(chunkX * 16, chunkZ * 16)
				this.chunks[chunkX][chunkZ] = chunk
			}
			if (chunk.buffer) {
				//Only used if spawning a block post-gen
				this.setBlock(x, y, z, blockID, true)
			} else if (!chunk.getBlock(x & 15, y, z & 15)) {
				chunk.setBlock(x & 15, y, z & 15, blockID, false)
			}
		}
		tick() {
			let tickStart = win.performance.now()
			let maxChunkX = (p.x >> 4) + settings.renderDistance
			let maxChunkZ = (p.z >> 4) + settings.renderDistance
			let chunk = maxChunkX + "," + maxChunkZ
			if (chunk !== this.lastChunk) {
				this.lastChunk = chunk
				this.loadChunks()
				this.chunkGenQueue.sort(sortChunks)
			}

			if (screen === "play" && gameMode === "creative" && Key.leftMouse && !Key.control && p.lastBreak < Date.now() - 250) {
				changeWorldBlock(0)
			}
			if (screen === "play" && !p.interactHold && (Key.rightMouse || Key.leftMouse && Key.control) && p.lastPlace < Date.now() - 250) {
				newWorldBlock()
			}
			if (screen === "play" && gameMode === "creative" && Key.leftMouse && p.autoBreak && !Key.control) {
				changeWorldBlock(0)
			}

			for (let i = 0; i < this.sortedChunks.length; i++) {
				this.sortedChunks[i].tick()
			}

			do {
				let doneWork = false
				debug.start = performance.now()
				if (this.meshQueue.length) {
					// Update all chunk meshes.
					let len = this.meshQueue.length - 1
					do {
						this.meshQueue.pop().genMesh()
					} while(this.meshQueue.length)
					doneWork = true
					debug("Meshes")
				}

				if (this.generateQueue.length && !doneWork) {
					let chunk = this.generateQueue.pop()
					this.genChunk(chunk)
					doneWork = true
				}
				if (this.populateQueue.length && !doneWork) {
					// Drop entries that were already finished. Leaving one of those on
					// top used to block the whole queue forever, which froze chunk
					// generation and made the world turn into empty sky.
					while (this.populateQueue.length && this.populateQueue[this.populateQueue.length - 1].populated) {
						this.populateQueue.pop()
					}
					if (this.populateQueue.length) {
						let chunk = this.populateQueue[this.populateQueue.length - 1]
						if (!chunk.caves) {
							chunk.carveCaves()
							debug("Carve caves")
						} else {
							chunk.populate()
							// Remove every copy of this chunk, not just the top one.
							this.populateQueue = this.populateQueue.filter(c => c !== chunk)
						}
					}
					doneWork = true
				}

				if (this.chunkGenQueue.length && !doneWork) {
					let chunk = this.chunkGenQueue[0]
					if (!fillReqs(chunk.x >> 4, chunk.z >> 4)) {}
					else if (!chunk.loaded) {
						chunk.load()
					} else if (!chunk.optimized) {
						chunk.optimize(this)
						debug("Optimize")
					} else if (!chunk.buffer) {
						chunk.genMesh()
						debug("Initial mesh")
					} else {
						this.chunkGenQueue.shift()
						setGeneratedChunks(generatedChunks + 1)
					}
					doneWork = true
				}
				if (!doneWork) {
					break
				}
			} while(win.performance.now() - tickStart < 5)
		}
		render() {
			// Advance the day/night clock by the real time since the last frame.
			let now = win.performance.now()
			if (!this.lastRender) this.lastRender = now
			let delta = now - this.lastRender
			this.lastRender = now
			if (delta > 100) delta = 0
			this.time = ((this.time + delta) % (DAY_LENGTH * 1000) + DAY_LENGTH * 1000) % (DAY_LENGTH * 1000)

			let nether = this.dimension === "nether"
			const sky = nether ? NETHER_SKY : computeSky(this.time / 1000)
			initModelView(p)
			gl.clearColor(sky.fogColor[0], sky.fogColor[1], sky.fogColor[2], 1.0)
			gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT)

			use3d()
			gl.uniform3f(glCache.uSky, sky.fogColor[0], sky.fogColor[1], sky.fogColor[2])
			gl.uniform3f(glCache.uSun, sky.sun[0], sky.sun[1], sky.sun[2])
			gl.uniform1f(glCache.uSkyBrightness, sky.brightness)

			p2.x = Math.round(p.x)
			p2.y = Math.round(p.y)
			p2.z = Math.round(p.z)

			setRenderedChunks(0)

			let dist = (settings.renderDistance) * 16
			if (this.chunkGenQueue.length) {
				this.chunkGenQueue.sort(sortChunks)
				let chunk = this.chunkGenQueue[0]
				dist = Math.min(dist, chunkDist(chunk))
			}
			if (dist !== fogDist) {
				if (fogDist < dist - 0.1) fogDist += (dist - fogDist) / 120
				else if (fogDist > dist + 0.1) fogDist += (dist - fogDist) / 30
				else fogDist = dist
			}
			gl.uniform3f(glCache.uPos, p.x, p.y, p.z)
			gl.uniform1f(glCache.uDist, fogDist)

			let c = this.sortedChunks
			for (let chunk of c) {
				chunk.render()
			}
			renderDrops()
			renderTnts()
			renderFallingBlocks()
			renderArrows()
			renderPotionClouds()
			renderFireworks()
			renderFishingBobbers()
			renderVehicles()
			renderEndCrystals()
			renderDecorations()
			renderCampfires()
			renderPoplarLeaves()
			renderRemotePlayers()
			renderMining()
			renderSignTexts()

			if (!nether) renderSkybox(this.time / 1000, matrix)
			use3d()

			gl.uniform3f(glCache.uPos, 0, 0, 0)

			if(hitBox.pos) {
				setBlockOutlines(true)
				setBlockFill(false)
				block2(hitBox.pos[0], hitBox.pos[1], hitBox.pos[2], 0, p)
				setBlockOutlines(false)
				setBlockFill(true)
			}
		}
		loadChunks() {
			let renderDistance = settings.renderDistance + 2
			let cx = p.x >> 4
			let cz = p.z >> 4
			p.cx = cx
			p.cz = cz
			let minChunkX = cx - renderDistance
			let maxChunkX = cx + renderDistance
			let minChunkZ = cz - renderDistance
			let maxChunkZ = cz + renderDistance

			this.offsetX = -minChunkX
			this.offsetZ = -minChunkZ
			this.lwidth = renderDistance * 2 + 1
			this.chunkGenQueue.length = 0

			if (this.loaded.length > this.lwidth * this.lwidth) {
				this.loaded.length = this.lwidth * this.lwidth
			}

			let i = 0
			for (let x = minChunkX; x <= maxChunkX; x++) {
				for (let z = minChunkZ; z <= maxChunkZ; z++) {
					let chunk
					if (!this.chunks[x]) {
						this.chunks[x] = []
					}
					if (!this.chunks[x][z]) {
						chunk = new Chunk(x * 16, z * 16)
						if (maxDist(cx, cz, x, z) <= settings.renderDistance) {
							this.chunkGenQueue.push(chunk)
						}
						this.chunks[x][z] = chunk
					}
					chunk = this.chunks[x][z]
					if (!chunk.buffer && !this.chunkGenQueue.includes(chunk) && maxDist(cx, cz, x, z) <= settings.renderDistance) {
						this.chunkGenQueue.push(chunk)
					}
					this.loaded[i++] = chunk
				}
			}
			this.sortedChunks = this.loaded.filter(renderFilter)
			this.sortedChunks.sort(sortChunks)

			// Throw away queued work for chunks that are no longer around the
			// player. Otherwise every chunk visited keeps its place in the queue
			// and generation falls further and further behind while walking.
			let keep = renderDistance
			let near = chunk => maxDist(chunk.x >> 4, chunk.z >> 4, cx, cz) <= keep
			this.generateQueue = this.generateQueue.filter(near)
			this.populateQueue = this.populateQueue.filter(chunk => !chunk.populated && near(chunk))
			this.meshQueue = this.meshQueue.filter(near)
			let farFirst = (c1, c2) => maxDist(c2.x >> 4, c2.z >> 4, cx, cz) - maxDist(c1.x >> 4, c1.z >> 4, cx, cz)
			this.generateQueue.sort(farFirst)
			this.populateQueue.sort(farFirst)

			// Release the GPU buffers of chunks that are well outside the view.
			// Their block data stays, so walking back simply remeshes them. Without
			// this, every chunk ever visited holds a mesh buffer and long walks can
			// exhaust WebGL memory until nothing draws.
			for (let x in this.chunks) {
				for (let z in this.chunks[x]) {
					let chunk = this.chunks[x][z]
					if (chunk.buffer && !near(chunk)) {
						gl.deleteBuffer(chunk.buffer)
						chunk.buffer = null
						// The face mask in renderData can go stale while the mesh is
						// unloaded (fluid ticks and edits still change block data).
						// Recompute it when this chunk is meshed again.
						chunk.optimized = false
					}
				}
			}
		}
		getSaveString() {
			let edited = []
			for (let x in this.chunks) {
				for (let z in this.chunks[x]) {
					let chunk = this.chunks[x][z]
					if (chunk.edited) {
						for (let y = 0; y < chunk.sections.length; y++) {
							if (chunk.sections[y].edited) {
								edited.push([ chunk.sections[y], chunk.cleanSections[y] ])
							}
						}
					}
				}
			}

			let pallete = {}
			for (let chunks of edited) {
				let changes = false
				chunks[0].blocks.forEach((id, i) => {
					if (id !== chunks[1][i]) {
						pallete[id] = true
						changes = true
					}
				})
				if (!changes) {
					chunks[0].edited = false
				}
			}

			let blocks = Object.keys(pallete).map(n => Number(n))
			pallete = {}
			blocks.forEach((block, index) => pallete[block] = index)

			let rnd = Math.round
			let options = p.flying | superflat << 1 | p.spectator << 2 | caves << 3 | trees << 4 | (gameMode === "creative" ? 1 : 0) << 5 | (this.dimension === "nether" ? 1 : 0) << 6

			// Survival fields are appended after the seven legacy player fields;
			// saves without them load with full health and hunger.
			let str = this.name + ";" + worldSeed.toString(36) + ";"
				+ rnd(p.x).toString(36) + "," + rnd(p.y).toString(36) + "," + rnd(p.z).toString(36) + ","
				+ (p.rx * 100 | 0).toString(36) + "," + (p.ry * 100 | 0).toString(36) + "," + options.toString(36) + "," + rnd(world.time || 0).toString(36) + ","
				+ Math.round((p.health || 0) * 10).toString(36) + "," + Math.round(p.food || 0).toString(36) + ","
				+ Math.round((p.saturation || 0) * 100).toString(36) + "," + Math.round(p.air || 0).toString(36) + ","
				+ Math.round((p.exhaustion || 0) * 100).toString(36) + ";"
				+ version + ";"
				+ blocks.map(b => b.toString(36)).join(",") + ";"

			for (let i = 0; i < edited.length; i++) {
				if (!edited[i][0].edited) {
					continue
				}
				let real = edited[i][0]
				let blocks = real.blocks
				let original = edited[i][1]
				str += (real.x / 16).toString(36) + "," + (real.y / 16).toString(36) + "," + (real.z / 16).toString(36) + ","
				for (let j = 0; j < original.length; j++) {
					if (blocks[j] !== original[j]) {
						str += (pallete[blocks[j]] << 12 | j).toString(36) + ","
					}
				}
				str = str.substr(0, str.length - 1); //Remove trailing comma
				str += ";"
			}
			if (str.match(/;$/)) str = str.substr(0, str.length - 1)

			// Chest inventories are appended after the chunk edits. Older saves
			// have no section, and the marker is not a valid base36 coordinate,
			// so both formats load correctly.
			let chests = []
			for (let key in this.chests) {
				let slots = this.chests[key]
				if (!slots) continue
				let items = []
				for (let i = 0; i < slots.length; i++) {
					let st = slots[i]
					if (st && st.count > 0) {
						items.push(i.toString(36) + "," + st.id.toString(36) + "," + st.count.toString(36))
					}
				}
				if (!items.length) continue
				let coords = key.split(",").map(n => parseInt(n, 10).toString(36)).join(",")
				chests.push(coords + ":" + items.join(","))
			}
			if (chests.length) str += ";~" + chests.join("|")

			// Signs use a separate marker so old saves with chest sections keep
			// parsing exactly as before. Line breaks are already removed by
			// setSign, and encodeURIComponent protects commas and pipes.
			let signs = []
			for (let key in this.signs) {
				let lines = this.signs[key]
				if (!Array.isArray(lines) || !lines.some(Boolean)) continue
				let coords = key.split(",").map(n => parseInt(n, 10).toString(36)).join(",")
				signs.push(coords + ":" + lines.map(line => encodeURIComponent(line)).join(","))
			}
			if (signs.length) str += ";~!" + signs.join("|")

			// Furnaces use their own marker. A furnace is only stored when it has
			// contents or an active cook/burn timer, so looking at an empty one does
			// not grow the save forever.
			let furnaces = []
			for (let key in this.furnaces) {
				let furnace = this.furnaces[key]
				if (!furnace || !furnace.slots) continue
				let hasItems = furnace.slots.some(stack => stack && stack.count > 0)
				if (!hasItems && !(furnace.burnTime > 0) && !(furnace.cookTime > 0)) continue
				let coords = key.split(",").map(n => parseInt(n, 10).toString(36)).join(",")
				let values = [ furnace.burnTime || 0, furnace.burnTotal || 0, furnace.cookTime || 0 ]
				for (let i = 0; i < 3; i++) {
					let stack = furnace.slots[i]
					values.push(stack && stack.count > 0 ? stack.id : 0)
					values.push(stack && stack.count > 0 ? stack.count : 0)
					values.push(stack && stack.damage ? stack.damage : 0)
				}
				furnaces.push(coords + "," + values.map(n => (n | 0).toString(36)).join(","))
			}
			if (furnaces.length) str += ";~F" + furnaces.join("|")

			// Crop ticker positions. The blocks themselves are already in the
			// chunk edits; this section only rebuilds the random-tick registry.
			let crops = []
			for (let key in this.crops) {
				let pos = this.crops[key]
				if (!Array.isArray(pos) || pos.length < 3) continue
				crops.push(pos.map(n => parseInt(n, 10).toString(36)).join(","))
			}
			if (crops.length) str += ";~C" + crops.join("|")

			// Nether portal pairs. Coordinates are stored doubled so the .5
			// positions used for two-block-wide portals survive the round trip.
			let links = []
			for (let link of this.portalLinks) {
				let values = [
					link.owX, link.owY, link.owZ,
					link.owExitX, link.owExitY, link.owExitZ,
					link.nX, link.nY, link.nZ,
					link.nExitX, link.nExitY, link.nExitZ
				]
				links.push(values.map(n => Math.round(n * 2).toString(36)).join(","))
			}
			if (links.length) str += ";~P" + links.join("|")

			// Inventory and equipment, including per-stack damage. Slots 0-35
			// are the hotbar/main inventory; 36-39 are helmet through boots.
			let items = []
			let addItemSave = (slot, stack) => {
				if (!stack || !stack.count || stack.count <= 0) return
				items.push(slot.toString(36) + "," + stack.id.toString(36) + "," + stack.count.toString(36) + "," + ((stack.damage || 0) | 0).toString(36))
			}
			for (let i = 0; i < 36; i++) addItemSave(i, inventory.slots[i])
			for (let i = 0; i < 4; i++) addItemSave(36 + i, inventory.armor[i])
			if (items.length) str += ";~#" + (inventory.hotbarSlot || 0).toString(36) + ":" + items.join("|")
			return str
		}
		loadSave(str) {
			// Each load starts with an empty inventory; the inventory section below
			// restores it when the save has one.
			inventory.slots = []
			inventory.armor = [null, null, null, null]
			inventory.craft = new Array(4).fill(null)
			inventory.result = null
			inventory.cursor = null
			inventory.hotbarSlot = 0
			let data = str.split(";")
			// Current saves start with name;seed;player;version;palette;edits...
			// and always store seven player fields (x, y, z, rx, ry, options,
			// time). Legacy saves start with the seed and only have x..ry.
			let probe = (data[2] || "").split(",")
			if (data.length < 5 || probe.length < 6) {
				return this.loadOldSave(str)
			}

			this.name = data.shift()
			setWorldSeed(parseInt(data.shift(), 36))
			seedHash(worldSeed)
			setCaveNoise(openSimplexNoise(worldSeed))
			noiseSeed(worldSeed)

			let playerData = data.shift().split(",")
			p.x = parseInt(playerData[0], 36)
			p.y = parseInt(playerData[1], 36)
			p.z = parseInt(playerData[2], 36)
			p.rx = parseInt(playerData[3], 36) / 100
			p.ry = parseInt(playerData[4], 36) / 100
			let options = parseInt(playerData[5], 36)
			p.flying = options & 1
			p.spectator = options >> 2 & 1
			setSuperflat(Boolean(options >> 1 & 1))
			setCaves(Boolean(options >> 3 & 1))
			setTrees(Boolean(options >> 4 & 1))
			setGameMode(options >> 5 & 1 ? "creative" : "survival")
			this.dimension = options >> 6 & 1 ? "nether" : "overworld"
			if (gameMode === "survival") {
				p.flying = false
				p.spectator = false
			}
			this.time = parseInt(playerData[6], 36)
			if (!(this.time >= 0)) this.time = 150000

			// Survival stats. Older saves omit these fields.
			let savedHealth = playerData[7] !== undefined ? parseInt(playerData[7], 36) / 10 : 20
			let wasDead = !isFinite(savedHealth) || !(savedHealth > 0)
			if (wasDead) savedHealth = 20
			p.maxHealth = 20
			p.health = Math.min(20, savedHealth)
			let savedFood = playerData[8] !== undefined ? parseInt(playerData[8], 36) : 20
			if (!isFinite(savedFood)) savedFood = 20
			p.food = Math.max(0, Math.min(20, savedFood))
			p.maxFood = 20
			let savedSaturation = playerData[9] !== undefined ? parseInt(playerData[9], 36) / 100 : 5
			if (!isFinite(savedSaturation)) savedSaturation = 5
			p.saturation = Math.max(0, Math.min(p.food, savedSaturation))
			let savedAir = playerData[10] !== undefined ? parseInt(playerData[10], 36) : 300
			if (!isFinite(savedAir)) savedAir = 300
			p.air = Math.max(0, Math.min(300, savedAir))
			p.maxAir = 300
			let savedExhaustion = playerData[11] !== undefined ? parseInt(playerData[11], 36) / 100 : 0
			p.exhaustion = isFinite(savedExhaustion) ? Math.max(0, savedExhaustion) : 0
			p.hurtTime = 0
			p.damageCooldown = 0
			p.fallDistance = 0
			p.fireTicks = 0
			p.eating = 0
			p.dead = false
			p.inLava = false
			p.regenTimer = 0
			p.starveTimer = 0
			p.drownTimer = 0
			if (wasDead) {
				p.x = 8
				p.z = 8
				p.y = superflat ? 6 : (Math.round(noise(8 * generator.smooth, 8 * generator.smooth) * generator.height) + 2 + generator.extra)
				p.previousX = p.x
				p.previousY = p.y
				p.previousZ = p.z
			}

			let version = data.shift()
			this.version = version

			// if (version.split(" ")[1].split(".").join("") < 70) {
			// 	alert("This save code is for an older version. 0.7.0 or later is needed")
			// }

			let pallete = data.shift().split(",").map(n => parseInt(n, 36))
			this.loadFrom = []
			this.chests = {}
			this.signs = {}
			this.furnaces = {}
			this.crops = {}
			this.portalLinks = []
			this.pendingPortalSite = null

			while (data.length) {
				let section = data.shift()
				if (section.slice(0, 2) === "~#") {
					let body = section.slice(2)
					let colon = body.indexOf(":")
					if (colon >= 0) {
						let hotbar = parseInt(body.slice(0, colon), 36)
						if (hotbar >= 0 && hotbar < 9) inventory.hotbarSlot = hotbar
						for (let entry of body.slice(colon + 1).split("|")) {
							let values = entry.split(",")
							if (values.length < 3) continue
							let slot = parseInt(values[0], 36)
							let id = parseInt(values[1], 36)
							let count = parseInt(values[2], 36)
							let damage = parseInt(values[3] || "0", 36)
							if (!(slot >= 0 && slot < 40) || !(id > 0) || !(count > 0)) continue
							let stack = { id: id, count: count }
							if (damage > 0) stack.damage = damage
							if (slot < 36) inventory.slots[slot] = stack
							else inventory.armor[slot - 36] = stack
						}
					}
					continue
				}
				if (section.slice(0, 2) === "~!") {
					for (let part of section.slice(2).split("|")) {
						let colon = part.indexOf(":")
						if (colon < 0) continue
						let coords = part.slice(0, colon).split(",").map(n => parseInt(n, 36))
						if (coords.length !== 3 || coords.some(isNaN)) continue
						let lines = part.slice(colon + 1).split(",").slice(0, 4).map(line => {
							try { return decodeURIComponent(line) } catch (e) { return "" }
						})
						while (lines.length < 4) lines.push("")
						this.setSign(coords[0], coords[1], coords[2], lines)
					}
					continue
				}
				if (section.slice(0, 2) === "~F") {
					for (let part of section.slice(2).split("|")) {
						let values = part.split(",").map(n => parseInt(n, 36))
						if (values.length < 15 || values.slice(0, 3).some(isNaN)) continue
						let furnace = this.getFurnace(values[0], values[1], values[2])
						furnace.burnTime = values[3] || 0
						furnace.burnTotal = values[4] || 0
						furnace.cookTime = values[5] || 0
						for (let i = 0; i < 3; i++) {
							let id = values[6 + i * 3]
							let count = values[7 + i * 3]
							let damage = values[8 + i * 3]
							if (id > 0 && count > 0) {
								let stack = { id: id, count: count }
								if (damage > 0) stack.damage = damage
								furnace.slots[i] = stack
							}
						}
					}
					continue
				}
				if (section.slice(0, 2) === "~C") {
					for (let part of section.slice(2).split("|")) {
						let coords = part.split(",").map(n => parseInt(n, 36))
						if (coords.length === 3 && !coords.some(isNaN)) {
							this.crops[coords[0] + "," + coords[1] + "," + coords[2]] = coords
						}
					}
					continue
				}
				if (section.slice(0, 2) === "~P") {
					for (let part of section.slice(2).split("|")) {
						let values = part.split(",").map(n => parseInt(n, 36))
						if (values.length < 12 || values.slice(0, 12).some(isNaN)) continue
						values = values.map(n => n / 2)
						this.portalLinks.push({
							owX: values[0], owY: values[1], owZ: values[2],
							owExitX: values[3], owExitY: values[4], owExitZ: values[5],
							nX: values[6], nY: values[7], nZ: values[8],
							nExitX: values[9], nExitY: values[10], nExitZ: values[11]
						})
					}
					continue
				}
				if (section[0] === "~") {
					for (let part of section.slice(1).split("|")) {
						let colon = part.indexOf(":")
						if (colon < 0) continue
						let coords = part.slice(0, colon).split(",").map(n => parseInt(n, 36))
						let slots = new Array(27).fill(null)
						let values = part.slice(colon + 1).split(",")
						for (let i = 0; i + 2 < values.length; i += 3) {
							let slot = parseInt(values[i], 36)
							let id = parseInt(values[i + 1], 36)
							let count = parseInt(values[i + 2], 36)
							if (slot >= 0 && slot < 27 && id > 0 && count > 0) slots[slot] = { id: id, count: count }
						}
						this.chests[coords.join(",")] = slots
					}
					continue
				}
				let blocks = section.split(",")
				let chunk = {
					x: parseInt(blocks.shift(), 36),
					y: parseInt(blocks.shift(), 36),
					z: parseInt(blocks.shift(), 36),
					blocks: [],
				}
				this.loadFrom.push(chunk)
				for (let j = 0; j < blocks.length; j++) {
					let block = parseInt(blocks[j], 36)
					let index = block & 0xfff
					let pid = block >> 12
					chunk.blocks[index] = pallete[pid]
				}
			}

			// If the save happened while the destination chunk was still being
			// generated, rebuild the linked portal when that chunk loads.
			if (this.dimension === "nether" && this.portalLinks.length) {
				let link = this.portalLinks.find(l => {
					let dx = l.nExitX - p.x, dy = l.nExitY - p.y, dz = l.nExitZ - p.z
					return dx * dx + dy * dy + dz * dz < 16
				})
				if (link) this.schedulePortalSite(this.netherSiteFromLink(link))
			}
		}
		loadOldSave(str) {
			this.dimension = "overworld"
			this.portalLinks = []
			this.pendingPortalSite = null
			let data = str.split(";");
			this.chests = {};
			this.signs = {};
			this.furnaces = {};
			this.crops = {};
			setWorldSeed(parseInt(data.shift(), 36));
			this.id = Date.now()
			this.name = "Old World " + (Math.random() * 1000 | 0)
			seedHash(worldSeed);
			setCaveNoise(openSimplexNoise(worldSeed));
			noiseSeed(worldSeed);
			let playerData = data.shift().split(",");
			p.x = parseInt(playerData[0], 36);
			p.y = parseInt(playerData[1], 36);
			p.z = parseInt(playerData[2], 36);
			p.rx = parseInt(playerData[3], 36) / 100;
			p.ry = parseInt(playerData[4], 36) / 100;
			// Legacy saves predate the survival status loop.
			resetSurvival();
			let editCount = parseInt(data.shift(), 36);

			this.loadFrom = [];

			let coords = data.shift().split(",").map(function(n) {
				return parseInt(n, 36);
			});
			for (let j = 0; j < coords.length; j += 3) {
				this.loadFrom.push({
					x: coords[j],
					y: coords[j + 1],
					z: coords[j + 2],
					blocks: [],
				})
			}

			for (let i = 0; data.length > 0; i++) {
				let blocks = data.shift().split(",");
				for (let j = 0; j < blocks.length; j++) {
					let block = parseInt(blocks[j], 36);
					let index = block >> 8;
					let id = block & 0x7f | (block & 0x80) << 1;
					this.loadFrom[i].blocks[index] = id;
				}
			}
		}
	}

	let defineWorld = function() {
		let tickStart = win.performance.now()
		world.tick()
		analytics.totalTickTime += win.performance.now() - tickStart
		let renderStart = win.performance.now()
		world.render()
		analytics.totalRenderTime += win.performance.now() - renderStart
	}



	function initWorldsMenu() {
		while (window.worlds.firstChild) {
			window.worlds.removeChild(window.worlds.firstChild)
		}
		setSelectedWorld(0)
		window.boxCenterTop.value = ""

		const deselect = () => {
			let elem = document.getElementsByClassName("selected")
			if (elem && elem[0]) {
				elem[0].classList.remove("selected")
			}
		}

		function addWorld(name, version, size, id, edited) {
			let div = doc.createElement("div")
			div.className = "world"
			div.onclick = e => {
				deselect()
				div.classList.add("selected")
				setSelectedWorld(id)
			}
			let br = "<br>"
			div.id = id
			div.innerHTML = "<strong>" + name + "</strong>" + br
			
			if (edited){
				let str = (new Date(edited).toLocaleDateString(undefined, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "numeric",
					minute: "2-digit"
				}))
				div.innerHTML += str + br
			}
			div.innerHTML += version + br
			div.innerHTML += `${size.toLocaleString()} bytes used`
			
			window.worlds.appendChild(div)
		}

		for (let k in worlds) delete worlds[k]
		if (loadString) {
			try {
				let tempWorld = new World()
				tempWorld.loadSave(loadString)
				let now = Date.now()
				addWorld(`${tempWorld.name} (Pre-loaded)`, tempWorld.version, loadString.length, now)
				worlds[now] = {
					code: loadString,
					id: now
				}
			}
			catch(e) {
				console.log("Unable to load hardcoded save.")
				console.error(e)
			}
		}
		restorePendingSave().catch(e => console.error(e)).then(() => loadFromDB()).then(res => {
			if(res && res.length) {
				let index = res.findIndex(obj => obj.id === "settings")
				if (index >= 0) {
					Object.assign(settings, res[index].data) // Stored data overrides any hardcoded settings
					p.FOV(settings.fov)
					res.splice(index, 1)
				}
			}
			
			if (res && res.length) {
				res = res.map(d => d.data).filter(d => d && d.code).sort((a, b) => b.edited - a.edited)
				for (let data of res) {
					addWorld(data.name, data.version, (data.code.length + 60), data.id, data.edited)
					worlds[data.id] = data
				}
			}
			window.worlds.onclick = Button.draw
			window.boxCenterTop.onkeyup = Button.draw
		}).catch(e => console.error(e))

		setSuperflat(false)
		setTrees(true)
		setCaves(true)
	}
	


export {
	createDatabase, loadFromDB, saveToDB, deleteFromDB, save, clearPendingSave,
	chunkDist, sortChunks, fillReqs, maxDist, renderFilter, debug, fogDist,
	World, defineWorld, initWorldsMenu
}
