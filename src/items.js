import { blockData, blockIds } from './blocks.js'
import { recipes, textureMap, win } from './state.js'

const BASE_MASK = 0x7ff
const MAX_STACK = 64
// Item ids sit above the 16-bit block state space (see engine.js).
const ITEM_ID_BASE = 0x10000

let itemData = []
let itemIds = {}

function defineItem(data) {
	let id = ITEM_ID_BASE + itemData.length
	itemData.push(data)
	itemIds[data.name] = id
	return id
}

function isItem(id) { return id >= ITEM_ID_BASE }
function itemDef(id) { return itemData[id - ITEM_ID_BASE] }
function itemName(id) { let d = itemDef(id); return d ? d.name : undefined }
function itemTexture(id) { let d = itemDef(id); return d ? d.texture : undefined }
function itemStack(id) { let d = itemDef(id); return d ? (d.stack === undefined ? 64 : d.stack) : 1 }

defineItem({ name: "bucket", texture: "bucket", stack: 16, behavior: "bucket", bucketType: "empty" })
defineItem({ name: "waterBucket", texture: "waterBucket", stack: 1, behavior: "bucket", bucketType: "water" })
defineItem({ name: "lavaBucket", texture: "lavaBucket", stack: 1, behavior: "bucket", bucketType: "lava" })
defineItem({ name: "coal", texture: "coal", stack: 64 })
defineItem({ name: "ironIngot", texture: "ironIngot", stack: 64 })
defineItem({ name: "goldIngot", texture: "goldIngot", stack: 64 })
defineItem({ name: "diamond", texture: "diamond", stack: 64 })
defineItem({ name: "stick", texture: "stick", stack: 64 })

const TOOL_TIERS = ["wooden", "stone", "iron", "golden", "diamond", "netherite"]
const TOOL_KINDS = ["pickaxe", "axe", "shovel", "sword", "hoe"]
// Vanilla tool durability, by material.
const TOOL_DURABILITY = { wooden: 59, stone: 131, iron: 250, golden: 32, diamond: 1561, netherite: 2031 }
for (let t of TOOL_TIERS) {
	for (let o of TOOL_KINDS) {
		let n = t + o[0].toUpperCase() + o.slice(1)
		defineItem({ name: n, texture: n, stack: 1, behavior: "tool", tool: o, tier: t, durability: TOOL_DURABILITY[t] })
	}
}

// [ nutrition points, saturation modifier ]. Saturation restored is
// nutrition * modifier * 2, matching the vanilla food table.
const FOODS = {
	apple: [4, 2.4], bread: [5, 6], carrot: [3, 3.6], potato: [1, 0.6],
	bakedPotato: [5, 6], goldenApple: [4, 9.6, true], melonSlice: [2, 1.2],
}
const PLANTABLE = { wheatSeeds: "wheat", carrot: "carrots", potato: "potatoes" }
for (let name in FOODS) {
	let [ food, saturation, alwaysEdible ] = FOODS[name]
	defineItem({ name: name, texture: name, stack: 64, behavior: "food", food: food, saturation: saturation, alwaysEdible: !!alwaysEdible, plant: PLANTABLE[name] })
}

defineItem({ name: "wheat", texture: "wheat", stack: 64 })
defineItem({ name: "wheatSeeds", texture: "wheatSeeds", stack: 64, plant: PLANTABLE.wheatSeeds })
defineItem({ name: "sugar", texture: "sugar", stack: 64 })

for (let name of ["rawIron", "rawCopper", "rawGold", "copperIngot", "charcoal", "emerald", "lapisLazuli", "redstone", "quartz", "netheriteIngot", "netheriteScrap", "flint", "string", "gunpowder", "bone", "clayBall", "brick", "feather", "leather", "egg", "glowstoneDust", "paper", "book", "slimeBall"]) {
	defineItem({ name: name, texture: name, stack: 64 })
}

defineItem({ name: "flintAndSteel", texture: "flintAndSteel", stack: 1, behavior: "igniter" })

// Armor is appended here, after every existing item, so item ids already
// stored in inventories and saves keep pointing at the same definitions.
const ARMOR_MATERIALS = ["leather", "chain", "iron", "golden", "diamond"]
const ARMOR_PIECES = ["helmet", "chestplate", "leggings", "boots"]
// Defense and durability use the vanilla per-piece values; diamond is the only
// material here with toughness.
const ARMOR_STATS = {
	leather: { defense: [1, 3, 2, 1], toughness: 0, durability: [55, 80, 75, 65] },
	chain: { defense: [2, 5, 4, 1], toughness: 0, durability: [165, 240, 225, 195] },
	iron: { defense: [2, 6, 5, 2], toughness: 0, durability: [165, 240, 225, 195] },
	golden: { defense: [2, 5, 3, 1], toughness: 0, durability: [77, 112, 105, 91] },
	diamond: { defense: [3, 8, 6, 3], toughness: 2, durability: [363, 528, 495, 429] },
}
for (let material of ARMOR_MATERIALS) {
	let stats = ARMOR_STATS[material]
	for (let i = 0; i < ARMOR_PIECES.length; i++) {
		let piece = ARMOR_PIECES[i]
		let name = material + piece[0].toUpperCase() + piece.slice(1)
		defineItem({
			name: name, texture: name, stack: 1, behavior: "armor", armorSlot: piece,
			defense: stats.defense[i], toughness: stats.toughness, durability: stats.durability[i]
		})
	}
}

// ---------------------------------------------------------------------------
// Food, utility and combat items added after the original registry.  Keep
// every definition below this point append-only: existing saves identify an
// item by its numeric registry index, so inserting an item above would shift
// every id after it.
// ---------------------------------------------------------------------------
const FOOD_ITEMS = [
	{ name: "porkchop", food: 3, saturation: 1.8 },
	{ name: "cookedPorkchop", food: 8, saturation: 12.8 },
	{ name: "beef", food: 3, saturation: 1.8 },
	{ name: "cookedBeef", food: 8, saturation: 12.8 },
	{ name: "chicken", food: 2, saturation: 1.2, effects: [{ effect: "hunger", duration: 600, amplifier: 0 }] },
	{ name: "cookedChicken", food: 6, saturation: 7.2 },
	{ name: "mutton", food: 2, saturation: 1.2 },
	{ name: "cookedMutton", food: 6, saturation: 9.6 },
	{ name: "rabbit", food: 3, saturation: 1.8 },
	{ name: "cookedRabbit", food: 5, saturation: 6 },
	{ name: "rabbitStew", food: 10, saturation: 12, stack: 1, container: "bowl" },
	{ name: "rawFish", food: 2, saturation: 0.4 },
	{ name: "cookedFish", food: 5, saturation: 6 },
	{ name: "salmon", food: 2, saturation: 0.4 },
	{ name: "cookedSalmon", food: 6, saturation: 9.6 },
	{ name: "clownfish", food: 1, saturation: 0.1 },
	{ name: "pufferfish", food: 1, saturation: 0.1, effects: [{ effect: "poison", duration: 1200, amplifier: 1 }, { effect: "nausea", duration: 300, amplifier: 0 }, { effect: "hunger", duration: 300, amplifier: 2 }] },
	{ name: "poisonousPotato", food: 2, saturation: 1.2, effects: [{ effect: "poison", duration: 100, amplifier: 0 }] },
	{ name: "goldenCarrot", food: 6, saturation: 14.4 },
	{ name: "beetroot", food: 1, saturation: 1.2 },
	{ name: "beetrootSoup", food: 6, saturation: 7.2, stack: 1, container: "bowl" },
	{ name: "pumpkinPie", food: 8, saturation: 4.8 },
	{ name: "cookie", food: 2, saturation: 0.4 },
	{ name: "enchantedGoldenApple", food: 4, saturation: 9.6, alwaysEdible: true, effects: [{ effect: "regeneration", duration: 400, amplifier: 1 }, { effect: "absorption", duration: 2400, amplifier: 3 }, { effect: "resistance", duration: 6000, amplifier: 0 }, { effect: "fireResistance", duration: 6000, amplifier: 0 }] },
]
for (let food of FOOD_ITEMS) {
	defineItem({
		name: food.name, texture: food.name, stack: food.stack === undefined ? 64 : food.stack,
		behavior: "food", food: food.food, saturation: food.saturation,
		alwaysEdible: !!food.alwaysEdible, container: food.container, effects: food.effects
	})
}

// Give the original foods their missing status effects as well.  Changing
// properties does not change their ids.
function patchItem(name, properties) {
	let data = itemData[itemIds[name] - ITEM_ID_BASE]
	if (data) Object.assign(data, properties)
}
patchItem("goldenApple", { effects: [{ effect: "regeneration", duration: 100, amplifier: 1 }, { effect: "absorption", duration: 2400, amplifier: 0 }] })
patchItem("chorusFruit", { behavior: "food", food: 4, saturation: 2.4, alwaysEdible: true, teleport: true })
patchItem("poppedChorusFruit", { behavior: "food", food: 4, saturation: 2.4, alwaysEdible: true, teleport: true })

// Plantable seeds.  The crop blocks already exist; these definitions only
// connect the held item to the existing planting code.
defineItem({ name: "pumpkinSeeds", texture: "pumpkinSeeds", stack: 64, plant: "pumpkinStem" })
defineItem({ name: "melonSeeds", texture: "melonSeeds", stack: 64, plant: "melonStem" })
defineItem({ name: "beetrootSeeds", texture: "beetrootSeeds", stack: 64, plant: "beetroots" })

// Materials and containers.
for (let name of [
	"netherBrick", "rabbitHide", "boneMeal", "inkSac", "cocoaBeans",
	"netherWart", "blazeRod", "blazePowder", "ghastTear", "goldNugget",
	"ironNugget", "netherStar", "dragonsBreath", "shulkerShell",
	"prismarineShard", "prismarineCrystals", "glassBottle",
	"fireCharge", "fireworkStar", "bookAndQuill", "map", "emptyMap",
	"compass", "clock", "armorStand", "itemFrame", "painting", "bowl",
	"nameTag", "lead", "saddle", "chorusFruit", "poppedChorusFruit",
]) defineItem({ name: name, texture: name, stack: 64 })

// Item-specific stack limits and use metadata.

// Chorus fruit starts as a material above and becomes a teleporting food
// once every item has received its stable registry id.
patchItem("chorusFruit", { behavior: "food", food: 4, saturation: 2.4, alwaysEdible: true, teleport: true })
patchItem("poppedChorusFruit", { behavior: "food", food: 4, saturation: 2.4, alwaysEdible: true, teleport: true })
patchItem("fireCharge", { behavior: "igniter" })
patchItem("map", { behavior: "map" })
patchItem("emptyMap", { behavior: "map" })
patchItem("compass", { behavior: "compass" })
patchItem("clock", { behavior: "clock" })
patchItem("armorStand", { behavior: "decor" })
patchItem("itemFrame", { behavior: "decor" })
patchItem("painting", { behavior: "decor" })

for (let name of ["minecart", "chestMinecart", "furnaceMinecart", "hopperMinecart", "tntMinecart", "oakBoat", "spruceBoat", "birchBoat", "jungleBoat", "acaciaBoat", "darkOakBoat"]) {
	defineItem({
		name: name, texture: name, stack: 1,
		behavior: /Boat$/.test(name) ? "boat" : "minecart",
		vehicle: /Boat$/.test(name) ? "boat" : name
	})
}

// Combat and utility equipment.
defineItem({ name: "bow", texture: "bow", stack: 1, behavior: "bow", durability: 384 })
defineItem({ name: "arrow", texture: "arrow", stack: 64, behavior: "arrow" })
defineItem({ name: "spectralArrow", texture: "spectralArrow", stack: 64, behavior: "arrow", spectral: true })
defineItem({ name: "tippedArrow", texture: "tippedArrow", stack: 64, behavior: "arrow", effects: [{ effect: "poison", duration: 100, amplifier: 0 }] })
defineItem({ name: "shield", texture: "shield", stack: 1, behavior: "shield", durability: 336 })
defineItem({ name: "elytra", texture: "elytra", stack: 1, behavior: "armor", armorSlot: "chestplate", defense: 0, toughness: 0, durability: 432, elytra: true })
defineItem({ name: "shears", texture: "shears", stack: 1, behavior: "shears", durability: 238 })
defineItem({ name: "fishingRod", texture: "fishingRod", stack: 1, behavior: "fishingRod", durability: 64 })
defineItem({ name: "carrotOnAStick", texture: "carrotOnAStick", stack: 1, behavior: "carrotOnAStick", durability: 25 })
defineItem({ name: "milkBucket", texture: "milkBucket", stack: 1, behavior: "milk" })
defineItem({ name: "potion", texture: "potion", stack: 1, behavior: "potion", effect: "regeneration", effectDuration: 200, effects: [{ effect: "regeneration", duration: 200, amplifier: 0 }] })
defineItem({ name: "splashPotion", texture: "splashPotion", stack: 1, behavior: "potion", splash: true, effect: "healing", effects: [{ effect: "instantHealth", duration: 1, amplifier: 1 }] })
defineItem({ name: "lingeringPotion", texture: "lingeringPotion", stack: 1, behavior: "potion", lingering: true, effect: "poison", effects: [{ effect: "poison", duration: 300, amplifier: 0 }] })
defineItem({ name: "fireworkRocket", texture: "fireworkRocket", stack: 64, behavior: "firework" })
defineItem({ name: "endCrystal", texture: "endCrystal", stack: 64, behavior: "endCrystal", durability: 0 })

// Append-only writings. These are deliberately defined after all earlier
// items so adding them cannot renumber any existing registry id.
for (let name of ["writableBook", "writtenBook"]) defineItem({ name: name, texture: name, stack: 1, behavior: "book" })
for (let name of ["book", "bookAndQuill", "writableBook", "writtenBook"]) patchItem(name, { behavior: "book" })
for (let name of ["bookAndQuill", "map", "armorStand", "itemFrame", "painting"]) patchItem(name, { stack: 1 })

// Human-readable names for the few entries whose registry name cannot be
// converted mechanically into vanilla's wording.
for (let [name, display] of Object.entries({
	dragonsBreath: "Dragon's Breath", bookAndQuill: "Book and Quill",
	chestMinecart: "Minecart with Chest", furnaceMinecart: "Minecart with Furnace",
	hopperMinecart: "Minecart with Hopper", tntMinecart: "Minecart with TNT",
	rawFish: "Raw Fish", cookedFish: "Cooked Fish", clownfish: "Clownfish",
})) patchItem(name, { display: display })

// Existing plant metadata points at the crop blocks by name.
patchItem("carrot", { plant: "carrots" })
patchItem("potato", { plant: "potatoes" })
patchItem("wheatSeeds", { plant: "wheat" })

function idIsItem(id) { return isItem(id) }
function idTexture(id) {
	if (isItem(id)) return itemTexture(id)
	let b = blockData[id & BASE_MASK]
	return b ? (b.textures ? b.textures[0] : b.name) : undefined
}
function idStack(id) { return isItem(id) ? itemStack(id) : MAX_STACK }
function idAtlasSlot(id) { let t = idTexture(id); return t === undefined ? undefined : textureMap[t] }

// Oak and dark oak leaves occasionally drop an apple, the vanilla survival
// food source before farming is available.
function bonusDrop(block) {
	let data = blockData[block & BASE_MASK]
	if (!data) return null
	// Vanilla grass is the renewable source of wheat seeds. The grass block
	// itself is still returned separately by blockDrop; this is the seed roll.
	if (data.name === "shortGrass" || data.name === "tallGrass") {
		if (itemIds.wheatSeeds === undefined) return null
		return { id: itemIds.wheatSeeds, chance: 0.125 }
	}
	if (!/^(oak|darkOak)Leaves$/.test(data.name)) return null
	if (itemIds.apple === undefined) return null
	return { id: itemIds.apple, chance: 0.005 }
}

if (win) {
	win.itemData = itemData
	win.itemIds = itemIds
	win.isItem = isItem
	win.itemName = itemName
	win.itemTexture = itemTexture
	win.itemStack = itemStack
	win.idIsItem = idIsItem
	win.idTexture = idTexture
	win.idStack = idStack
	win.idAtlasSlot = idAtlasSlot
	win.bonusDrop = bonusDrop
}

const blockDrops = {
	// Most blocks drop themselves. Only transformations and item drops need
	// entries here; leaves intentionally keep their own block item.
	grass: "dirt", snowyGrass: "dirt",
	stone: "cobblestone", deepslate: "cobbledDeepslate",
	coalOre: "coal", deepslateCoalOre: "coal",
	ironOre: "rawIron", deepslateIronOre: "rawIron",
	copperOre: "rawCopper", deepslateCopperOre: "rawCopper",
	goldOre: "rawGold", deepslateGoldOre: "rawGold",
	diamondOre: "diamond", deepslateDiamondOre: "diamond",
	emeraldOre: "emerald", deepslateEmeraldOre: "emerald",
	lapisOre: "lapisLazuli", deepslateLapisOre: "lapisLazuli",
	redstoneOre: "redstone", deepslateRedstoneOre: "redstone",
	netherQuartzOre: "quartz", netherGoldOre: "goldIngot", ancientDebris: "netheriteScrap",
}
for (let name in blockDrops) {
	let data = blockData[blockIds[name]]
	if (data) data.drops = blockDrops[name]
}

// Crops are blocks with the same name as their produce item. Without this
// mapping their drops resolve back to the crop block, so bread, baked
// potatoes and carrot food could never be obtained from village farms.
const ITEM_DROPS = { wheat: "wheat", carrots: "carrot", potatoes: "potato" }

function idDrop(id) {
	let base = id & BASE_MASK
	let data = blockData[base]
	if (!data || data.liquid) return 0
	let itemDrop = ITEM_DROPS[data.name]
	if (itemDrop && itemIds[itemDrop] !== undefined) return itemIds[itemDrop]
	// A wall sign is only a placement state; its inventory item is the
	// corresponding standing or hanging sign.
	if (data.wallSign) {
		let signName = data.name.replace(/WallHangingSign$/, "HangingSign").replace(/WallSign$/, "Sign")
		if (blockIds[signName] !== undefined) return blockIds[signName]
	}
	let name = data.drops || data.name
	if (name && blockIds[name] !== undefined) return blockIds[name]
	if (name && itemIds[name] !== undefined) return itemIds[name]
	return base
}

// Crafting recipes. Shaped patterns are trimmed to their occupied bounds, so
// a 2x2 recipe works in the inventory grid or anywhere in the 3x3 crafting
// table. Shapeless recipes list one ingredient per occupied slot. Ingredients
// are arrays of accepted ids, which lets wooden recipes accept every plank type.
const PLANK_IDS = [
	'oakPlanks', 'sprucePlanks', 'birchPlanks', 'junglePlanks', 'acaciaPlanks',
	'darkOakPlanks', 'mangrovePlanks', 'cherryPlanks', 'paleOakPlanks',
	'bambooPlanks', 'crimsonPlanks', 'warpedPlanks',
].map(name => blockIds[name]).filter(id => id !== undefined)
const LOG_PLANKS = [
	[ 'oakLog', 'oakPlanks' ], [ 'spruceLog', 'sprucePlanks' ],
	[ 'birchLog', 'birchPlanks' ], [ 'jungleLog', 'junglePlanks' ],
	[ 'acaciaLog', 'acaciaPlanks' ], [ 'darkOakLog', 'darkOakPlanks' ],
	[ 'mangroveLog', 'mangrovePlanks' ], [ 'cherryLog', 'cherryPlanks' ],
	[ 'paleOakLog', 'paleOakPlanks' ], [ 'bambooBlock', 'bambooPlanks' ],
	[ 'crimsonStem', 'crimsonPlanks' ], [ 'warpedStem', 'warpedPlanks' ],
]

function trimPattern(pattern) {
	let minR = pattern.length, maxR = -1, minC = pattern[0].length, maxC = -1
	for (let r = 0; r < pattern.length; r++) {
		for (let c = 0; c < pattern[r].length; c++) {
			if (!pattern[r][c]) continue
			if (r < minR) minR = r
			if (r > maxR) maxR = r
			if (c < minC) minC = c
			if (c > maxC) maxC = c
		}
	}
	if (maxR < 0) return []
	return pattern.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1))
}

function addShaped(outId, count, rows, key) {
	if (outId === undefined) return
	let invalid = false
	let pattern = rows.map(row => row.split('').map(ch => {
		if (ch === ' ') return null
		let ingredient = key[ch]
		if (!ingredient || !ingredient.length) invalid = true
		return ingredient || null
	}))
	if (invalid) return
	pattern = trimPattern(pattern)
	if (pattern.length) recipes.push({ pattern: pattern, out: { id: outId, count: count } })
}

function addShapeless(outId, count, ingredients) {
	if (outId === undefined || !ingredients.length) return
	if (ingredients.some(ingredient => !ingredient || !ingredient.length)) return
	recipes.push({ ingredients: ingredients, out: { id: outId, count: count } })
}

for (let [ log, planks ] of LOG_PLANKS) {
	if (blockIds[log] === undefined || blockIds[planks] === undefined) continue
	addShapeless(blockIds[planks], 4, [[ blockIds[log] ]])
}

const PLANKS = PLANK_IDS
const STICK = [ itemIds.stick ]
const COBBLE = [ blockIds.cobblestone ]
const COAL = [ itemIds.coal, itemIds.charcoal ].filter(id => id !== undefined)
const STONE = [ blockIds.stone ]
const SAND = [ blockIds.sand ]
const SANDSTONE = [ blockIds.sandStone ]

addShaped(itemIds.stick, 4, [ 'P', 'P' ], { P: PLANKS })
addShaped(blockIds.craftingTable, 1, [ 'PP', 'PP' ], { P: PLANKS })
addShaped(blockIds.chest, 1, [ 'PPP', 'P P', 'PPP' ], { P: PLANKS })
addShaped(blockIds.furnace, 1, [ 'CCC', 'C C', 'CCC' ], { C: COBBLE })
addShaped(blockIds.torch, 4, [ 'C', 'S' ], { C: COAL, S: STICK })
addShaped(itemIds.bread, 1, [ 'WWW' ], { W: [ itemIds.wheat ] })
addShaped(itemIds.bucket, 1, [ 'I I', ' I ' ], { I: [ itemIds.ironIngot ] })
addShapeless(itemIds.flintAndSteel, 1, [[ itemIds.flint ], [ itemIds.ironIngot ]])
addShaped(itemIds.goldenApple, 1, [ 'GGG', 'GAG', 'GGG' ], { G: [ itemIds.goldIngot ], A: [ itemIds.apple ] })

addShaped(blockIds.stoneBricks, 4, [ 'SS', 'SS' ], { S: STONE })
addShaped(blockIds.sandStone, 1, [ 'SS', 'SS' ], { S: SAND })
addShaped(blockIds.smoothSandStone, 4, [ 'SS', 'SS' ], { S: SANDSTONE })
addShaped(blockIds.polishedAndesite, 4, [ 'SS', 'SS' ], { S: [ blockIds.andesite ] })
addShaped(blockIds.polishedDiorite, 4, [ 'SS', 'SS' ], { S: [ blockIds.diorite ] })
addShaped(blockIds.polishedGranite, 4, [ 'SS', 'SS' ], { S: [ blockIds.granite ] })
for (let [ block, item ] of [
	[ 'ironBlock', 'ironIngot' ], [ 'goldBlock', 'goldIngot' ],
	[ 'diamondBlock', 'diamond' ], [ 'coalBlock', 'coal' ],
]) {
	addShaped(blockIds[block], 1, [ 'III', 'III', 'III' ], { I: [ itemIds[item] ] })
}

// Vanilla tool patterns. Wooden tools accept any of the twelve plank types.
const RECIPE_TOOL_MATERIALS = {
	wooden: PLANKS, stone: COBBLE, iron: [ itemIds.ironIngot ],
	golden: [ itemIds.goldIngot ], diamond: [ itemIds.diamond ],
}
const TOOL_PATTERNS = {
	pickaxe: [ 'MMM', ' S ', ' S ' ],
	axe: [ 'MM ', 'MS ', ' S ' ],
	shovel: [ 'M', 'S', 'S' ],
	sword: [ 'M', 'M', 'S' ],
	hoe: [ 'MM ', ' S ', ' S ' ],
}
for (let tier in RECIPE_TOOL_MATERIALS) {
	for (let kind in TOOL_PATTERNS) {
		let name = tier + kind[0].toUpperCase() + kind.slice(1)
		addShaped(itemIds[name], 1, TOOL_PATTERNS[kind], { M: RECIPE_TOOL_MATERIALS[tier], S: STICK })
	}
}

// Chain armor has no crafting recipe in vanilla, so it is intentionally absent.
const RECIPE_ARMOR_MATERIALS = {
	leather: [ itemIds.leather ], iron: [ itemIds.ironIngot ],
	golden: [ itemIds.goldIngot ], diamond: [ itemIds.diamond ],
}
const ARMOR_PATTERNS = {
	helmet: [ 'MMM', 'M M' ],
	chestplate: [ 'M M', 'MMM', 'MMM' ],
	leggings: [ 'MMM', 'M M', 'M M' ],
	boots: [ 'M M', 'M M' ],
}
for (let material in RECIPE_ARMOR_MATERIALS) {
	for (let piece in ARMOR_PATTERNS) {
		let name = material + piece[0].toUpperCase() + piece.slice(1)
		addShaped(itemIds[name], 1, ARMOR_PATTERNS[piece], { M: RECIPE_ARMOR_MATERIALS[material] })
	}
}

// ---------------------------------------------------------------------------
// Recipes for the extended item set.  These use the same trimmed 2x2/3x3
// matcher as the original recipes, so they work in both the inventory and the
// crafting table wherever the pattern fits.
// ---------------------------------------------------------------------------
addShaped(itemIds.bowl, 4, [ 'P P', ' P ' ], { P: PLANKS })
addShapeless(itemIds.cookie, 8, [[ itemIds.wheat ], [ itemIds.wheat ], [ itemIds.cocoaBeans ]])
addShapeless(itemIds.pumpkinPie, 1, [[ blockIds.pumpkin ], [ itemIds.sugar ], [ itemIds.egg ]])
addShapeless(itemIds.goldenCarrot, 1, [
	[ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ],
	[ itemIds.goldNugget ], [ itemIds.carrot ], [ itemIds.goldNugget ],
	[ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ],
])
addShapeless(itemIds.beetrootSoup, 1, [
	[ itemIds.beetroot ], [ itemIds.beetroot ], [ itemIds.beetroot ],
	[ itemIds.beetroot ], [ itemIds.beetroot ], [ itemIds.beetroot ], [ itemIds.bowl ],
])
addShapeless(itemIds.rabbitStew, 1, [[ itemIds.cookedRabbit ], [ itemIds.carrot ], [ itemIds.bakedPotato ], [ itemIds.bowl ]])
addShapeless(itemIds.paper, 3, [[ blockIds.sugarCane ], [ blockIds.sugarCane ], [ blockIds.sugarCane ]])
addShapeless(itemIds.bookAndQuill, 1, [[ itemIds.book ], [ itemIds.feather ], [ itemIds.inkSac ]])
addShaped(itemIds.arrow, 4, [ ' F ', ' S ', ' E ' ], { F: [ itemIds.flint ], S: STICK, E: [ itemIds.feather ] })
addShaped(itemIds.bow, 1, [ ' SR', 'S R', ' SR' ], { S: STICK, R: [ itemIds.string ] })
addShaped(itemIds.shield, 1, [ 'PIP', 'PPP', ' P ' ], { P: PLANKS, I: [ itemIds.ironIngot ] })
addShaped(itemIds.shears, 1, [ ' I', 'I ' ], { I: [ itemIds.ironIngot ] })
addShaped(itemIds.fishingRod, 1, [ '  S', ' S ', 'S T' ], { S: STICK, T: [ itemIds.string ] })
addShapeless(itemIds.carrotOnAStick, 1, [[ itemIds.fishingRod ], [ itemIds.carrot ]])
addShapeless(itemIds.lead, 2, [[ itemIds.string ], [ itemIds.string ], [ itemIds.string ], [ itemIds.string ], [ itemIds.slimeBall ]])
addShapeless(itemIds.saddle, 1, [[ itemIds.leather ], [ itemIds.leather ], [ itemIds.leather ], [ itemIds.ironIngot ], [ itemIds.ironIngot ]])
addShapeless(itemIds.nameTag, 1, [[ itemIds.paper ], [ itemIds.string ], [ itemIds.ironIngot ]])
addShaped(itemIds.itemFrame, 1, [ 'SSS', 'SLS', 'SSS' ], { S: STICK, L: [ itemIds.leather ] })
addShaped(itemIds.painting, 1, [ 'SSS', 'SWW', 'SSS' ], { S: STICK, W: [ blockIds.whiteWool ] })
addShapeless(itemIds.armorStand, 1, [[ blockIds.smoothStone ], [ itemIds.stick ], [ itemIds.stick ]])
addShapeless(itemIds.goldNugget, 9, [[ itemIds.goldIngot ]])
addShapeless(itemIds.ironNugget, 9, [[ itemIds.ironIngot ]])
addShapeless(itemIds.goldIngot, 1, [[ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ], [ itemIds.goldNugget ]])
addShapeless(itemIds.ironIngot, 1, [[ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ], [ itemIds.ironNugget ]])
addShapeless(itemIds.blazePowder, 2, [[ itemIds.blazeRod ]])
addShaped(itemIds.glassBottle, 3, [ 'G G', ' G ' ], { G: [ blockIds.glass ] })
addShaped(itemIds.minecart, 1, [ 'I I', 'III' ], { I: [ itemIds.ironIngot ] })
addShapeless(itemIds.chestMinecart, 1, [[ itemIds.minecart ], [ blockIds.chest ]])
addShapeless(itemIds.furnaceMinecart, 1, [[ itemIds.minecart ], [ blockIds.furnace ]])
addShapeless(itemIds.hopperMinecart, 1, [[ itemIds.minecart ], [ blockIds.hopper ]])
addShapeless(itemIds.tntMinecart, 1, [[ itemIds.minecart ], [ blockIds.tnt ]])
for (let [ log, planks ] of LOG_PLANKS) {
	let boat = itemIds[(log.replace(/Log$|Stem$|Block$/, '').replace(/^\w/, c => c.toLowerCase())) + "Boat"]
	if (boat !== undefined && blockIds[planks] !== undefined) addShaped(boat, 1, [ 'P P', 'PPP' ], { P: [ blockIds[planks] ] })
}
addShaped(blockIds.rail, 16, [ 'I I', 'ISI', 'I I' ], { I: [ itemIds.ironIngot ], S: STICK })
addShaped(blockIds.poweredRail, 6, [ 'G G', 'GSG', 'GRG' ], { G: [ itemIds.goldIngot ], S: STICK, R: [ itemIds.redstone ] })
addShaped(blockIds.detectorRail, 6, [ 'I I', 'IPI', 'IRI' ], { I: [ itemIds.ironIngot ], P: [ blockIds.stonePressurePlate ], R: [ itemIds.redstone ] })
addShaped(blockIds.activatorRail, 6, [ 'I I', 'ISI', 'IRI' ], { I: [ itemIds.ironIngot ], S: STICK, R: [ blockIds.redstoneTorch ] })
addShapeless(itemIds.fireCharge, 3, [[ itemIds.coal ], [ itemIds.gunpowder ], [ itemIds.blazePowder ]])
addShapeless(itemIds.fireworkStar, 1, [[ itemIds.gunpowder ], [ itemIds.glowstoneDust ], [ itemIds.feather ]])
addShapeless(itemIds.fireworkRocket, 3, [[ itemIds.paper ], [ itemIds.gunpowder ], [ itemIds.fireworkStar ]])
addShaped(itemIds.endCrystal, 1, [ 'GGG', 'GTG', 'GGG' ], { G: [ blockIds.glass ], T: [ itemIds.ghastTear ] })
addShaped(itemIds.enchantedGoldenApple, 1, [ 'GGG', 'GAG', 'GGG' ], { G: [ blockIds.goldBlock ], A: [ itemIds.apple ] })
addShapeless(itemIds.potion, 1, [[ itemIds.glassBottle ], [ itemIds.netherWart ]])
addShapeless(itemIds.splashPotion, 1, [[ itemIds.potion ], [ itemIds.gunpowder ]])
addShapeless(itemIds.lingeringPotion, 1, [[ itemIds.splashPotion ], [ itemIds.dragonsBreath ]])
addShapeless(itemIds.tippedArrow, 8, [
	[ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.arrow ],
	[ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.lingeringPotion ],
])
addShapeless(itemIds.spectralArrow, 2, [[ itemIds.arrow ], [ itemIds.arrow ], [ itemIds.glowstoneDust ], [ itemIds.glowstoneDust ], [ itemIds.glowstoneDust ], [ itemIds.glowstoneDust ]])
addShaped(itemIds.emptyMap, 1, [ 'PPP', 'PCP', 'PPP' ], { P: [ itemIds.paper ], C: [ itemIds.compass ] })
addShaped(itemIds.compass, 1, [ ' I ', 'IRI', ' I ' ], { I: [ itemIds.ironIngot ], R: [ itemIds.redstone ] })
addShaped(itemIds.clock, 1, [ ' G ', 'GRG', ' G ' ], { G: [ itemIds.goldIngot ], R: [ itemIds.redstone ] })

function matchesIngredient(ingredient, id) {
	return Array.isArray(ingredient) ? ingredient.includes(id) : ingredient === id
}

function trimCraft(craft, width) {
	width = width || 3
	let minR = width, maxR = -1, minC = width, maxC = -1
	for (let i = 0; i < width * width; i++) {
		let stack = craft[i]
		if (!stack || !(stack.count > 0)) continue
		let r = (i / width) | 0, c = i % width
		if (r < minR) minR = r
		if (r > maxR) maxR = r
		if (c < minC) minC = c
		if (c > maxC) maxC = c
	}
	if (maxR < 0) return null
	let grid = []
	for (let r = minR; r <= maxR; r++) {
		let row = []
		for (let c = minC; c <= maxC; c++) {
			let stack = craft[r * width + c]
			row.push(stack && stack.count > 0 ? stack.id : null)
		}
		grid.push(row)
	}
	return grid
}

function craftingResult(craft, width) {
	let grid = trimCraft(craft, width)
	if (!grid) return null
	for (let recipe of recipes) {
		if (recipe.pattern) {
			if (recipe.pattern.length !== grid.length || recipe.pattern[0].length !== grid[0].length) continue
			let match = true
			for (let r = 0; r < grid.length && match; r++) {
				for (let c = 0; c < grid[r].length; c++) {
					let ingredient = recipe.pattern[r][c]
					if (ingredient === null) {
						if (grid[r][c] !== null) { match = false; break }
					} else if (grid[r][c] === null || !matchesIngredient(ingredient, grid[r][c])) {
						match = false
						break
					}
				}
			}
			if (match) return { id: recipe.out.id, count: recipe.out.count }
		} else if (recipe.ingredients) {
			let ids = []
			for (let row of grid) for (let id of row) if (id !== null) ids.push(id)
			if (ids.length !== recipe.ingredients.length) continue
			let used = new Array(recipe.ingredients.length).fill(false)
			let match = true
			for (let id of ids) {
				let found = false
				for (let i = 0; i < recipe.ingredients.length; i++) {
					if (!used[i] && matchesIngredient(recipe.ingredients[i], id)) {
						used[i] = true
						found = true
						break
					}
				}
				if (!found) { match = false; break }
			}
			if (match) return { id: recipe.out.id, count: recipe.out.count }
		}
	}
	return null
}

// Furnace recipes. Inputs and outputs are ids so block results such as glass
// and stone work alongside item results such as ingots and cooked food.
const SMELTING = {}
function addSmelting(inputId, outputId) {
	if (inputId !== undefined && outputId !== undefined) SMELTING[inputId] = outputId
}
addSmelting(itemIds.rawIron, itemIds.ironIngot)
addSmelting(itemIds.rawCopper, itemIds.copperIngot)
addSmelting(itemIds.rawGold, itemIds.goldIngot)
addSmelting(blockIds.sand, blockIds.glass)
addSmelting(blockIds.cobblestone, blockIds.stone)
addSmelting(blockIds.stone, blockIds.smoothStone)
addSmelting(blockIds.clay, blockIds.terracotta)
addSmelting(blockIds.ancientDebris, itemIds.netheriteScrap)
addSmelting(itemIds.clayBall, itemIds.brick)
addSmelting(itemIds.potato, itemIds.bakedPotato)
addSmelting(itemIds.porkchop, itemIds.cookedPorkchop)
addSmelting(itemIds.beef, itemIds.cookedBeef)
addSmelting(itemIds.chicken, itemIds.cookedChicken)
addSmelting(itemIds.mutton, itemIds.cookedMutton)
addSmelting(itemIds.rabbit, itemIds.cookedRabbit)
addSmelting(itemIds.rawFish, itemIds.cookedFish)
addSmelting(itemIds.salmon, itemIds.cookedSalmon)
addSmelting(itemIds.chorusFruit, itemIds.poppedChorusFruit)
addSmelting(blockIds.netherrack, itemIds.netherBrick)
for (let [ log ] of LOG_PLANKS) addSmelting(blockIds[log], itemIds.charcoal)

const FUEL = {}
function addFuel(ids, ticks) {
	for (let id of ids) if (id !== undefined) FUEL[id] = ticks
}
addFuel([ itemIds.coal, itemIds.charcoal ], 1600)
addFuel([ blockIds.coalBlock ], 16000)
addFuel(PLANK_IDS, 300)
for (let [ log ] of LOG_PLANKS) addFuel([ blockIds[log] ], 300)
addFuel([ itemIds.stick ], 100)
addFuel([ itemIds.blazeRod ], 2400)
addFuel([ itemIds.bowl ], 100)
for (let name of ["oakBoat", "spruceBoat", "birchBoat", "jungleBoat", "acaciaBoat", "darkOakBoat"]) addFuel([ itemIds[name] ], 1200)
for (let name of ["minecart", "chestMinecart", "furnaceMinecart", "hopperMinecart", "tntMinecart"]) addFuel([ itemIds[name] ], 1200)
addFuel([ blockIds.craftingTable, blockIds.chest ], 300)
for (let tier of [ 'wooden', 'stone', 'iron', 'golden', 'diamond' ]) {
	for (let kind of [ 'pickaxe', 'axe', 'shovel', 'sword', 'hoe' ]) {
		let name = tier + kind[0].toUpperCase() + kind.slice(1)
		addFuel([ itemIds[name] ], 200)
	}
}

// Abandoned Camp expedition maps.  These are appended after every existing
// item so saved item ids remain stable.  They use the regular map texture and
// behavior, with the biome stored as metadata for the HUD and future map
// rendering.
const EXPLORER_MAP_BIOMES = [
	[ 'plainsExplorerMap', 'plains' ],
	[ 'birchExplorerMap', 'birch_forest' ],
	[ 'taigaExplorerMap', 'taiga' ],
	[ 'dappledExplorerMap', 'dappled_forest' ],
	[ 'forestExplorerMap', 'forest' ],
]
for (let [ name, biome ] of EXPLORER_MAP_BIOMES) {
	if (itemIds[name] !== undefined) continue
	defineItem({ name: name, texture: 'map', stack: 1, behavior: 'map', explorerBiome: biome })
}

function smeltResult(id) { return SMELTING[id] || 0 }
function fuelValue(id) { return FUEL[id] || 0 }

if (win) {
	win.smeltResult = smeltResult
	win.fuelValue = fuelValue
	win.blockDrops = blockDrops
	win.idDrop = idDrop
	win.craftingResult = craftingResult
}

export {
	ITEM_ID_BASE, itemData, itemIds, defineItem, isItem, itemDef, itemName,
	itemTexture, itemStack, idIsItem, idTexture, idStack, idAtlasSlot,
	blockDrops, idDrop, bonusDrop, craftingResult, smeltResult, fuelValue
}
