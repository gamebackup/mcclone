// Shared mutable state across MCClone modules

export const win = typeof window !== "undefined" ? (window.parent || window) : {};
export const doc = typeof document !== "undefined" ? document : {};

// Core Engine & WebGL
export let gl = null;
export function setGl(val) { gl = val; if (win) win.gl = val; }

export const glCache = {};
export let program3D = null;
export function setProgram3D(val) { program3D = val; }
export let program2D = null;
export function setProgram2D(val) { program2D = val; }
export let programSky = null;
export function setProgramSky(val) { programSky = val; }
export const skyCache = {};

// Textures & Atlas
export const textures = {};
export const blockImages = {};
export let texturesPending = 0;
export function setTexturesPending(val) { texturesPending = val; }
export let setPixel = null;
export function setSetPixelFn(fn) { setPixel = fn; }
export let getPixels = null;
export function setGetPixelsFn(fn) { getPixels = fn; }

export let tex = null;
export function setTex(val) { tex = val; }
export const textureMap = {};
export let dirtBuffer = null;
export function setDirtBuffer(val) { dirtBuffer = val; }
export let dirtTexture = null;
export function setDirtTexture(val) { dirtTexture = val; }
export let textureCoords = [];
export function setTextureCoords(val) { textureCoords = val; }
export const texCoordsBuffers = [];
export let dirtbg = null;
export function setDirtbg(val) { dirtbg = val; }

export let atlasCanvas = null;
export function setAtlasCanvas(val) { atlasCanvas = val; }
export let atlasCtxRef = null;
export function setAtlasCtxRef(val) { atlasCtxRef = val; }
export let celestialImg = null;
export function setCelestialImg(val) { celestialImg = val; }
export let celestialTex = null;
export function setCelestialTex(val) { celestialTex = val; }
export const animatedStrips = {};
export let animatedReady = false;
export function setAnimatedReady(val) { animatedReady = val; }
export let animTemp = null;
export function setAnimTemp(val) { animTemp = val; }
export let animTempCtx = null;
export function setAnimTempCtx(val) { animTempCtx = val; }
export let animationTimer = null;
export function setAnimationTimer(val) { animationTimer = val; }

// Mesh Buffers & Shapes
export const sideEdgeBuffers = {};
export const dropEdgeBuffers = {};
export let indexBuffer = null;
export function setIndexBuffer(val) { indexBuffer = val; }
export const bigArray = (typeof window !== "undefined" && window.bigArray) || new Float32Array(600000);
if (typeof window !== "undefined") window.bigArray = bigArray;

// Matrices
export let modelView = null;
export function setModelView(val) { modelView = val; }
export let projection = new Float32Array(16);
export function setProjection(val) { projection = val; }
export let defaultModelView = new Float32Array([ -10,0,0,0,0,10,0,0,0,0,-10,0,0,0,0,1 ]);
export function setDefaultModelView(val) { defaultModelView = val; }
export let matrix = new Float32Array(16);
export function setMatrix(val) { matrix = val; }

// Game Mode & Screens
export let screen = "main menu";
export function setScreen(val) { screen = val; }
export let previousScreen = "main menu";
export function setPreviousScreen(val) { previousScreen = val; }
export let gameMode = "survival";
export function setGameMode(val) { gameMode = val; }
export let newWorldGameMode = "creative";
export function setNewWorldGameMode(val) { newWorldGameMode = val; }
export let blockMode = 0; // CUBE
export function setBlockMode(val) { blockMode = val; }
export let holding = 0;
export function setHolding(val) { holding = val; }
export let hitBox = {};
export function setHitBox(val) { hitBox = val; }
export let blockOutlines = false;
export function setBlockOutlines(val) { blockOutlines = val; }
export let blockFill = true;
export function setBlockFill(val) { blockFill = val; }
export let updateHUD = true;
export function setUpdateHUD(val) { updateHUD = val; }
export let freezeFrame = false;
export function setFreezeFrame(val) { freezeFrame = val; }
export let commandOpen = false;
export function setCommandOpen(val) { commandOpen = val; }
export let locked = true;
export function setLocked(val) { locked = val; }
export let loadString = "";
export function setLoadString(val) { loadString = val; }

// Dimensions & Input
export let width = typeof window !== "undefined" ? window.innerWidth : 600;
export let height = typeof window !== "undefined" ? window.innerHeight : 600;
export function setDimensions(w, h) { width = w; height = h; }
export let mouseX = 0;
export let mouseY = 0;
export function setMouse(x, y) { mouseX = x; mouseY = y; }
export let mouseDown = false;
export function setMouseDown(val) { mouseDown = val; }
export const Key = {};
// ang normalizes diagonal input so strafing does not speed the player up.
export const move = { x: 0, z: 0, ang: Math.sqrt(0.5) };
export let place = false;
export function setPlace(val) { place = val; }

// World & Player
export let world = null;
export function setWorld(val) { world = val; if (win) win.world = val; }
export let p = null;
export function setP(val) { p = val; if (win) win.player = val; }
export let p2 = { x: 0, y: 0, z: 0 };
export function setP2(val) { p2 = val; }
export let worldSeed = 0;
export function setWorldSeed(val) { worldSeed = val; }
export let currentRandom = null;
export function setCurrentRandom(val) { currentRandom = val; }
export let caveNoise = null;
export function setCaveNoise(val) { caveNoise = val; }
export let generatedChunks = 0;
export function setGeneratedChunks(val) { generatedChunks = val; }
export let renderedChunks = 0;
export function setRenderedChunks(val) { renderedChunks = val; }
export const worlds = {};
export let selectedWorld = 0;
export function setSelectedWorld(val) { selectedWorld = val; }
export let maxLoad = 1;
export function setMaxLoad(val) { maxLoad = val; }
export let unpauseDelay = 0;
export function setUnpauseDelay(val) { unpauseDelay = val; }
export let debugMenu = false;
export function setDebugMenu(val) { debugMenu = val; }

// Player Configuration & Generation Parameters
export const settings = {
	renderDistance: 10,
	fov: 70,
	mouseSense: 100,
	viewBobbing: true
};
export const generator = {
	height: 80,
	smooth: 0.01,
	extra: 30,
	caveSize: 1000.00
};
export const maxHeight = 255;
export let currentFov = 70;
export function setCurrentFov(val) { currentFov = val; }
export const reach = 5;
export let superflat = false;
export function setSuperflat(val) { superflat = val; }
export let trees = true;
export function setTrees(val) { trees = val; }
export let caves = true;
export function setCaves(val) { caves = val; }
export const version = "Beta";

// Inventory & Recipes
export const inventory = {
	hotbarSlot: 0,
	slots: [],
	armor: [null, null, null, null],
	craft: [null, null, null, null],
	result: null,
	cursor: null,
	size: 40
};
export let invBg = typeof document !== "undefined" ? document.createElement("canvas") : null;
export function setInvBg(val) { invBg = val; }
export let invBgReady = false;
export function setInvBgReady(val) { invBgReady = val; }
export const recipes = [];

// Creative UI
export let creativeScroll = 0;
export function setCreativeScroll(val) { creativeScroll = val; }
export let creativeSearch = "";
export function setCreativeSearch(val) { creativeSearch = val; }
export let creativeSearchActive = false;
export function setCreativeSearchActive(val) { creativeSearchActive = val; }
export let creativeDrag = null;
export function setCreativeDrag(val) { creativeDrag = val; }
export let creativeIdsCache = null;
export function setCreativeIdsCache(val) { creativeIdsCache = val; }
export let creativeIdsKey = null;
export function setCreativeIdsKey(val) { creativeIdsKey = val; }

// Features (Drops, TNT, Fluids)
export const drops = [];
export let dropLastFrame = 0;
export function setDropLastFrame(val) { dropLastFrame = val; }
export const dropStats = { draws: 0 };
export const tnts = [];
export let tntLastFrame = 0;
export function setTntLastFrame(val) { tntLastFrame = val; }
export const fluidCellList = [];
export const fluidCellSeen = new Set();
export let fluidLastTick = 0;
export function setFluidLastTick(val) { fluidLastTick = val; }
export let fluidsReady = false;
export function setFluidsReady(val) { fluidsReady = val; }

// Analytics
export const analytics = {
	totalTickTime: 0,
	worstFrameTime: 0,
	totalRenderTime: 0,
	totalFrameTime: 0,
	lastUpdate: 0,
	frames: 1,
	displayedTickTime: "0",
	displayedRenderTime: "0",
	displayedFrameTime: "0",
	displayedwFrameTime: 0,
	fps: 0,
};

// Shaders & Sky
export const sky = [0.33, 0.54, 0.72];
export let sphere = null;
export function setSphere(val) { sphere = val; }
