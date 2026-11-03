// Block registry data (pure data, no dependencies).
import { VANILLA_BLOCKS } from './vanillaBlocks.js'

export const blockData = [
		{
			name: "air",
			id: 0,
			textures: [],
			transparent: true,
			shadow: false,
		},
		{
			name: "grass",
			textures: ["grassTop", "dirt", "grassSide"],
		},
		{ name: "dirt" },
		{ name: "stone" },
		{ name: "bedrock" },
		{ name: "sand" },
		{ name: "gravel" },
		{
			name: "leaves",
			transparent: true,
		},
		{
			name: "glass",
			transparent: true,
			shadow: false,
		},
		{ name: "cobblestone" },
		{ name: "mossyCobble" },
		{ name: "stoneBricks" },
		{ name: "mossyStoneBricks" },
		{ name: "bricks" },
		{ name: "coalOre" },
		{ name: "ironOre" },
		{ name: "goldOre" },
		{ name: "diamondOre" },
		{ name: "redstoneOre" },
		{ name: "lapisOre" },
		{ name: "emeraldOre" },
		{ name: "coalBlock" },
		{ name: "ironBlock" },
		{ name: "goldBlock" },
		{ name: "diamondBlock" },
		{ name: "redstoneBlock" },
		{ name: "lapisBlock" },
		{ name: "emeraldBlock" },
		{ name: "oakPlanks" },
		{
			name: "oakLog",
			textures: [ "logTop", "logSide" ],
		},
		{ name: "acaciaPlanks" },
		{
			name: "acaciaLog",
			textures: [ "acaciaLogTop", "acaciaLogSide" ],
		},
		{ name: "birchPlanks" },
		{
			name: "birchLog",
			textures: [ "birchLogTop", "birchLogSide" ],
		},
		{ name: "darkOakPlanks" },
		{
			name: "darkOakLog",
			textures: [ "darkOakLogTop", "darkOakLogSide" ],
		},
		{ name: "junglePlanks" },
		{
			name: "jungleLog",
			textures: [ "jungleLogTop", "jungleLogSide" ],
		},
		{ name: "sprucePlanks" },
		{
			name: "spruceLog",
			textures: [ "spruceLogTop", "spruceLogSide" ],
		},
		{ name: "whiteWool" },
		{ name: "orangeWool" },
		{ name: "magentaWool" },
		{ name: "lightBlueWool" },
		{ name: "yellowWool" },
		{ name: "limeWool" },
		{ name: "pinkWool" },
		{ name: "grayWool" },
		{ name: "lightGrayWool" },
		{ name: "cyanWool" },
		{ name: "purpleWool" },
		{ name: "blueWool" },
		{ name: "brownWool" },
		{ name: "greenWool" },
		{ name: "redWool" },
		{ name: "blackWool" },
		{ name: "whiteConcrete" },
		{ name: "orangeConcrete" },
		{ name: "magentaConcrete" },
		{ name: "lightBlueConcrete" },
		{ name: "yellowConcrete" },
		{ name: "limeConcrete" },
		{ name: "pinkConcrete" },
		{ name: "grayConcrete" },
		{ name: "lightGrayConcrete" },
		{ name: "cyanConcrete" },
		{ name: "purpleConcrete" },
		{ name: "blueConcrete" },
		{ name: "brownConcrete" },
		{ name: "greenConcrete" },
		{ name: "redConcrete" },
		{ name: "blackConcrete" },
		{
			name: "bookshelf",
			textures: [ "oakPlanks", "bookshelf" ]
		},
		{ name: "netherrack" },
		{ name: "soulSand" },
		{ name: "glowstone", light: 15 },
		{ name: "netherWartBlock" },
		{ name: "netherBricks" },
		{ name: "redNetherBricks" },
		{ name: "netherQuartzOre" },
		{
			name: "quartzBlock",
			textures: ["quartzBlockTop", "quartzBlockBottom", "quartzBlockSide"]
		},
		{
			name: "quartzPillar",
			textures: ["quartzPillarTop", "quartzPillar"]
		},
		{
			name: "chiseledQuartzBlock",
			textures: ["chiseledQuartzBlock", "chiseledQuartzBlockTop"]
		},
		{ name: "chiseledStoneBricks" },
		{ name: "smoothStone" },
		{ name: "andesite" },
		{ name: "polishedAndesite" },
		{ name: "diorite" },
		{ name: "polishedDiorite" },
		{ name: "granite" },
		{ name: "polishedGranite" },
    { name: "sandStone",
      textures: ["sandStoneTop", "sandStoneSide"],
    },
    { name: "smoothSandStone",
      textures: ["smoothSandStoneTop", "smoothSandStoneSide"],
    },
    { name: "chiseledSandStone",
      textures: ["chiseledSandStoneTop", "chiseledSandStoneSide"],
    },
    { name: "ironBars",
      textures: [ "ironBarsTop", "ironBarsSide" ],
      transparent: true,
	  shadow: false,
      bars: true,
    },
    // Legacy decorative water cube. Its id is kept so existing save
    // palettes stay valid, but it is hidden from the creative inventory and
    // old cells are migrated to real water when a chunk is meshed.
    { name: "waterBlock",
      transparent: true,
	  shadow: false,
      hidden: true,
      legacy: "water",
    },
    // Vanilla leaves use one texture on every face. The old separate side
    // texture was the same pattern with an unfinished grey patch stamped
    // over its middle rows. Both legacy leaf blocks have cut-out pixels, so
    // they must stay transparent; marking them opaque culled the faces of
    // every block underneath them and produced one-block "x-ray" holes.
    // Alt leaves are retired: existing cells are repaired to oak leaves and
    // the creative palette no longer offers this legacy block. Its id remains
    // registered so old save palettes keep their block ids.
    { name: "altLeaves",
      textures: "altLeavesTop",
      transparent: true,
      hidden: true,
    },
	{ name: "justLeaves", transparent: true },
	{ name: "dispenser",
	  textures: [ "furnaceTop", "furnaceTop", "dispenserFront", "furnaceSide", "furnaceSide", "furnaceSide" ],
	  facing: true,
	  verticalFacing: true,
	  faceTextures: {
		north: [ "furnaceTop", "furnaceTop", "dispenserFront", "furnaceSide", "furnaceSide", "furnaceSide" ],
		south: [ "furnaceTop", "furnaceTop", "furnaceSide", "dispenserFront", "furnaceSide", "furnaceSide" ],
		east: [ "furnaceTop", "furnaceTop", "furnaceSide", "furnaceSide", "dispenserFront", "furnaceSide" ],
		west: [ "furnaceTop", "furnaceTop", "furnaceSide", "furnaceSide", "furnaceSide", "dispenserFront" ],
		up: [ "dispenserFrontVertical", "furnaceTop", "furnaceTop", "furnaceTop", "furnaceTop", "furnaceTop" ],
		down: [ "furnaceTop", "dispenserFrontVertical", "furnaceTop", "furnaceTop", "furnaceTop", "furnaceTop" ],
	  } },
	{ name: "iceBlock",
	  transparent: true,
	  shadows: false,
	},
	// Old full-block cobweb. Its id is kept so existing saves stay valid,
	// but the creative menu only lists the real cross-shaped cobweb and old
	// placements are migrated to it when a chunk is optimized.
	{ name: "cobwebBlock",
	  textures: "cobweb",
	  transparent: true,
	  shadow: false,
	  hidden: true,
	  legacy: "cobweb",
	},
	{ name: "crackedStoneBrick" },
	{ name: "grassLeaves",
	  textures: [ "grassLeavesTop", "grassLeavesSide" ],
	  transparent: true,
	  shadows: false,
	},
	{ name: "blackStainedGlass",
	  transparent: true,
	  shadows: false,
	},
	{ name: "whiteTerracotta" },
	{ name: "chest", textures: [ "chestTop", "chestBottom", "chestSide", "chestFront", "chestSide", "chestSide" ], transparent: true, chest: true, facing: true,
	  faceTextures: {
		north: [ "chestTop", "chestBottom", "chestFront", "chestSide", "chestSide", "chestSide" ],
		south: [ "chestTop", "chestBottom", "chestSide", "chestFront", "chestSide", "chestSide" ],
		east: [ "chestTop", "chestBottom", "chestSide", "chestSide", "chestFront", "chestSide" ],
		west: [ "chestTop", "chestBottom", "chestSide", "chestSide", "chestSide", "chestFront" ],
	  } },
	{ name: "sidewaysPillar" },
	{ name: "cherryPlanks" },
	{ name: "cherryLog", textures: [ "cherryLogTop", "cherryLogSide" ] },
	{ name: "crimsonPlanks" },
	{ name: "crimsonStem", textures: [ "crimsonStemTop", "crimsonStemSide" ] },
	{ name: "warpedPlanks" },
	{ name: "warpedStem", textures: [ "warpedStemTop", "warpedStemSide" ] },
	{ name: "copperOre" },
	{ name: "copperBlock" },
	{ name: "cutCopper" },
	{ name: "exposedCopper" },
	{ name: "exposedCutCopper" },
	{ name: "weatheredCopper" },
	{ name: "weatheredCutCopper" },
	{ name: "oxidizedCopper" },
	{ name: "oxidizedCutCopper" },
	{ name: "deepslate", textures: [ "deepslateTop", "deepslateSide" ] },
	{ name: "cobbledDeepslate" },
	{ name: "polishedDeepslate" },
	{ name: "deepslateBricks" },
	{ name: "crackedDeepslateBricks" },
	{ name: "deepslateTiles" },
	{ name: "crackedDeepslateTiles" },
	{ name: "deepslateCoalOre" },
	{ name: "deepslateCopperOre" },
	{ name: "deepslateDiamondOre" },
	{ name: "deepslateEmeraldOre" },
	{ name: "deepslateGoldOre" },
	{ name: "deepslateIronOre" },
	{ name: "deepslateLapisOre" },
	{ name: "deepslateRedstoneOre" },
	{ name: "chiseledNetherBricks" },
	{ name: "crackedNetherBricks" },
	{ name: "netherGoldOre" },
	{ name: "ancientDebris", textures: [ "ancientDebrisTop", "ancientDebrisSide" ] },
	{ name: "netheriteBlock" },
	{ name: "soulSoil" },
	{ name: "blackstone" },
	{ name: "polishedBlackstone" },
	{ name: "gildedBlackstone" },
	{ name: "polishedBlackstoneBricks" },
	{ name: "crackedPolishedBlackstoneBricks" },
	{ name: "basalt", textures: [ "basaltTop", "basaltSide" ] },
	{ name: "polishedBasalt", textures: [ "polishedBasaltTop", "polishedBasaltSide" ] },
	{ name: "shroomlight", light: 15 },
	{ name: "endStone" },
	{ name: "endStoneBricks" },
	{ name: "prismarine" },
	{ name: "prismarineBricks" },
	{ name: "darkPrismarine" },
	{ name: "seaLantern", light: 15 },
	{ name: "obsidian" },
	{ name: "cryingObsidian" },
	{ name: "amethystBlock" },
	{ name: "quartzBricks" },
	{ name: "pumpkin", textures: [ "pumpkinTop", "pumpkinSide" ] },
	{ name: "carvedPumpkin", textures: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "pumpkinSide", "pumpkinSide" ], facing: true,
	  faceTextures: {
		north: [ "pumpkinTop", "pumpkinTop", "carvedPumpkin", "pumpkinSide", "pumpkinSide", "pumpkinSide" ],
		south: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "carvedPumpkin", "pumpkinSide", "pumpkinSide" ],
		east: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "carvedPumpkin", "pumpkinSide" ],
		west: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "pumpkinSide", "carvedPumpkin" ],
	  } },
	{ name: "jackOLantern", textures: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "pumpkinSide", "pumpkinSide" ], light: 15, facing: true,
	  faceTextures: {
		north: [ "pumpkinTop", "pumpkinTop", "jackOLantern", "pumpkinSide", "pumpkinSide", "pumpkinSide" ],
		south: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "jackOLantern", "pumpkinSide", "pumpkinSide" ],
		east: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "jackOLantern", "pumpkinSide" ],
		west: [ "pumpkinTop", "pumpkinTop", "pumpkinSide", "pumpkinSide", "pumpkinSide", "jackOLantern" ],
	  } },
	{ name: "tnt", textures: [ "tntTop", "tntBottom", "tntSides" ] },
	{ name: "poppy", textures: "poppy", transparent: true, shadow: false, cross: true, support: true },
	{ name: "cornflower", textures: "cornflower", transparent: true, shadow: false, cross: true, support: true },
	{ name: "dandelion", textures: "dandelion", transparent: true, shadow: false, cross: true, support: true },
	{ name: "cobweb", textures: "cobweb", transparent: true, shadow: false, cross: true, web: true },
	{ name: "oakFence", textures: "oakPlanks", transparent: true, shadow: false, fence: true },
	{ name: "spruceFence", textures: "sprucePlanks", transparent: true, shadow: false, fence: true },
	{ name: "birchFence", textures: "birchPlanks", transparent: true, shadow: false, fence: true },
	{ name: "jungleFence", textures: "junglePlanks", transparent: true, shadow: false, fence: true },
	{ name: "acaciaFence", textures: "acaciaPlanks", transparent: true, shadow: false, fence: true },
	{ name: "darkOakFence", textures: "darkOakPlanks", transparent: true, shadow: false, fence: true },
	{ name: "cherryFence", textures: "cherryPlanks", transparent: true, shadow: false, fence: true },
	{ name: "crimsonFence", textures: "crimsonPlanks", transparent: true, shadow: false, fence: true },
	{ name: "warpedFence", textures: "warpedPlanks", transparent: true, shadow: false, fence: true },
	{ name: "netherBrickFence", textures: "netherBricks", transparent: true, shadow: false, fence: true },
	{ name: "oakDoor", textures: "oakDoorBottom", transparent: true, shadow: false, door: true },
	{ name: "crimsonDoor", textures: "crimsonDoorBottom", transparent: true, shadow: false, door: true },
	{ name: "warpedDoor", textures: "warpedDoorBottom", transparent: true, shadow: false, door: true },
	{ name: "ironDoor", textures: "ironDoorBottom", transparent: true, shadow: false, door: true },
	{ name: "oakTrapdoor", textures: "oakTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "spruceTrapdoor", textures: "spruceTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "birchTrapdoor", textures: "birchTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "jungleTrapdoor", textures: "jungleTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "acaciaTrapdoor", textures: "acaciaTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "darkOakTrapdoor", textures: "darkOakTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "cherryTrapdoor", textures: "cherryTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "crimsonTrapdoor", textures: "crimsonTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "warpedTrapdoor", textures: "warpedTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "ironTrapdoor", textures: "ironTrapdoor", transparent: true, shadow: false, trap: true },
	{ name: "whiteStainedGlass", transparent: true, shadow: false },
	{ name: "orangeStainedGlass", transparent: true, shadow: false },
	{ name: "magentaStainedGlass", transparent: true, shadow: false },
	{ name: "lightBlueStainedGlass", transparent: true, shadow: false },
	{ name: "yellowStainedGlass", transparent: true, shadow: false },
	{ name: "limeStainedGlass", transparent: true, shadow: false },
	{ name: "pinkStainedGlass", transparent: true, shadow: false },
	{ name: "grayStainedGlass", transparent: true, shadow: false },
	{ name: "lightGrayStainedGlass", transparent: true, shadow: false },
	{ name: "cyanStainedGlass", transparent: true, shadow: false },
	{ name: "purpleStainedGlass", transparent: true, shadow: false },
	{ name: "blueStainedGlass", transparent: true, shadow: false },
	{ name: "brownStainedGlass", transparent: true, shadow: false },
	{ name: "greenStainedGlass", transparent: true, shadow: false },
	{ name: "redStainedGlass", transparent: true, shadow: false },
	{ name: "terracotta" },
	{ name: "orangeTerracotta" },
	{ name: "magentaTerracotta" },
	{ name: "lightBlueTerracotta" },
	{ name: "yellowTerracotta" },
	{ name: "limeTerracotta" },
	{ name: "pinkTerracotta" },
	{ name: "grayTerracotta" },
	{ name: "lightGrayTerracotta" },
	{ name: "cyanTerracotta" },
	{ name: "purpleTerracotta" },
	{ name: "blueTerracotta" },
	{ name: "brownTerracotta" },
	{ name: "greenTerracotta" },
	{ name: "redTerracotta" },
	{ name: "blackTerracotta" },
	{ name: "snow" },
	{ name: "ice", transparent: true, shadow: false },
	{ name: "packedIce" },
	{ name: "blueIce" },
	{ name: "clay" },
	{ name: "sponge" },
	{ name: "wetSponge" },
	{ name: "hay", textures: [ "hayTop", "haySide" ] },
	{ name: "melon", textures: [ "melonTop", "melonSide" ] },
	{ name: "magmaBlock", textures: "magma", light: 4 },
	{ name: "redSand" },
	{ name: "redSandStone", textures: [ "redSandStoneTop", "redSandStoneSide" ] },
	{ name: "tuff" },
	{ name: "calcite" },
	{ name: "dripstoneBlock" },
	{ name: "boneBlock", textures: [ "boneBlockTop", "boneBlockSide" ] },
	{ name: "warpedWartBlock" },
	{ name: "purpurBlock" },
	{ name: "purpurPillar", textures: [ "purpurPillarTop", "purpurPillarSide" ] },
	{ name: "noteBlock" },
	{ name: "jukebox", textures: [ "jukeboxTop", "jukeboxSide" ] },
	{ name: "slimeBlock", transparent: true, shadow: false },
	{ name: "honeyBlock", textures: [ "honeyBlockTop", "honeyBlockSide" ], transparent: true, shadow: false },
	{ name: "mud" },
	{ name: "rootedDirt" },
	{ name: "podzol", textures: [ "podzolTop", "podzolSide" ] },
	{ name: "mycelium", textures: [ "myceliumTop", "myceliumSide" ] },
	{ name: "coarseDirt" },
	{ name: "mossBlock" },
	{ name: "torch", textures: "torch", transparent: true, shadow: false, light: 14, torch: true },
	{ name: "water", textures: "waterStill", transparent: true, shadow: false, liquid: "water", replaceable: true },
	{ name: "lava", textures: "lavaStill", transparent: true, shadow: false, liquid: "lava", replaceable: true, light: 15 },

	]

// Vanilla blocks generated from the Minecraft 26.3 assets, appended after the
// hand-written entries. Names that already exist keep their original ids.
let _blockNames = new Set(blockData.map(block => block.name))
for (let def of VANILLA_BLOCKS) {
	if (_blockNames.has(def.name)) continue
	_blockNames.add(def.name)
	blockData.push(def)
}

// The generated 26.3 beds are listed as generic four-facing blocks. Give every
// colored bed the dedicated paired head/foot behavior so there is no one-cell
// black/red/blue/etc. bed left in the creative palette. Reusing the generated
// entries keeps their ids unchanged, so existing saves continue to resolve
// them. engine.js supplies each bed's own color when it derives head textures.
for (let bed of blockData) {
	if (bed.name === "strawBed" || !/Bed$/.test(bed.name)) continue
	bed.bed = true
	bed.shadow = false
	delete bed.facing
	delete bed.faceTextures
}

// The straw bed is the camp version of the bed: it shares the real bed
// geometry and behaves like any other paired bed. Moving it from the
// generated four-facing definition does not change its id.
let _strawBed = blockData.find(block => block.name === "strawBed")
if (_strawBed) {
	_strawBed.bed = true
	_strawBed.shadow = false
	delete _strawBed.facing
	delete _strawBed.faceTextures
}

// Nether portal blocks are intangible and light the room around them. Keeping
// the generated id/texture means existing saves and the creative palette are
// unchanged; only the runtime behavior is added here.
let _netherPortal = blockData.find(block => block.name === "netherPortal")
if (_netherPortal) {
	_netherPortal.portal = true
	_netherPortal.transparent = true
	_netherPortal.shadow = false
	_netherPortal.light = 11
}

// The generated barrel base state is vanilla facing=north, which puts the
// side texture on the top face. World generation places barrels without a
// facing state, so the base state should be the upright barrel. Player
// placement on a floor selects FACING_UP and gets this same face order.
let _barrel = blockData.find(block => block.name === "barrel")
if (_barrel) {
	let upright = [ "barrelTop", "barrelBottom", "barrelSide", "barrelSide", "barrelSide", "barrelSide" ]
	_barrel.textures = upright
	if (_barrel.faceTextures) _barrel.faceTextures.north = upright
}

// Terrain blocks the generated vanilla list does not model. They are appended
// after every existing block so old saves keep their block ids.
// snowyGrass uses the snow-topped grass side from the assets, so snowy biomes
// do not have to be solid snow cubes. snowLayer is the thin cover on top.
for (let def of [
	{ name: "snowyGrass", textures: [ "snow", "dirt", "grassBlockSnow", "grassBlockSnow", "grassBlockSnow", "grassBlockSnow" ] },
	{ name: "snowLayer", textures: "snow", transparent: true, shadow: false, flat: true, snowLayer: true },
]) {
	if (_blockNames.has(def.name)) continue
	_blockNames.add(def.name)
	blockData.push(def)
}

// Large shelf mushrooms use the same bark-mounted model as the small ones,
// with a separate id so their bouncy collision behavior can differ.  Appended
// after snowyGrass/snowLayer so those existing ids do not shift.
let _smallShelf = blockData.find(block => block.name === "shelfMushroom")
if (_smallShelf) {
	let largeShelf = Object.assign({}, _smallShelf)
	largeShelf.name = "largeShelfMushroom"
	largeShelf.modelName = "shelfMushroom"
	largeShelf.bouncy = true
	largeShelf.shadow = false
	delete largeShelf.id
	_blockNames.add(largeShelf.name)
	blockData.push(largeShelf)
}

blockData.forEach((block, i) => {
	if (block.id === undefined) block.id = i
})
export const BLOCK_COUNT = blockData.length
export const blockIds = {}
blockData.forEach(block => {
	blockIds[block.name] = block.id
})
