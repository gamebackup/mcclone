import { blockIds } from "./blocks.js"
import { win } from "./state.js"

	let seedHash
	let hash = (function() {
		let seed = Math.random() * 2100000000 | 0
		let PRIME32_2 = 1883677709
		let PRIME32_3 = 2034071983
		let PRIME32_4 = 668265263
		let PRIME32_5 = 374761393

		seedHash = function(s) {
			seed = s | 0
		}

		return function(x, y) {
			let h32 = 0

			h32 = seed + PRIME32_5 | 0
			h32 += 8

			h32 += Math.imul(x, PRIME32_3)
			h32 = Math.imul(h32 << 17 | h32 >> 32 - 17, PRIME32_4)
			h32 += Math.imul(y, PRIME32_3)
			h32 = Math.imul(h32 << 17 | h32 >> 32 - 17, PRIME32_4)

			h32 ^= h32 >> 15
			h32 *= PRIME32_2
			h32 ^= h32 >> 13
			h32 *= PRIME32_3
			h32 ^= h32 >> 16

			return h32 / 2147483647
		}
	})()
	let worldSeed

	
	let currentRandom = null
	function Marsaglia(i1, i2) {
	
		let z = (i1 | 0) || 362436069, w = i2 || hash(521288629, z) * 2147483647 | 0

		let nextInt = function() {
			z=36969*(z&65535)+(z>>>16) & 0xFFFFFFFF
			w=18000*(w&65535)+(w>>>16) & 0xFFFFFFFF
			return ((z&0xFFFF)<<16 | w&0xFFFF) & 0xFFFFFFFF
		}

		this.nextDouble = function() {
			let i = nextInt() / 4294967296
			return i < 0 ? 1 + i : i
		}
		this.nextInt = nextInt
	}
	let randomSeed = function(seed) {
		currentRandom = (new Marsaglia(seed)).nextDouble
	}
	let random = function(min, max) {
		if (!max) {
			if (min) {
				max = min
				min = 0
			} else {
				min = 0
				max = 1
			}
		}
		return currentRandom() * (max - min) + min
	}
	let noiseProfile = { generator: undefined, octaves: 4, fallout: 0.5, seed: undefined }
	function PerlinNoise(seed) {
		let rnd = seed !== undefined ? new Marsaglia(seed) : Marsaglia.createRandomized()
		let i, j
		
		let perm = new Uint8Array(512)
		for(i=0;i<256;++i) {
			perm[i] = i
		}
		for(i=0;i<256;++i) {
			let t = perm[j = rnd.nextInt() & 0xFF]; perm[j] = perm[i]; perm[i] = t
		}
		
		for(i=0;i<256;++i) {
			perm[i + 256] = perm[i]
		}

		function grad3d(i,x,y,z) {
			let h = i & 15; 
			let u = h<8 ? x : y,
				v = h<4 ? y : h===12||h===14 ? x : z
			return ((h&1) === 0 ? u : -u) + ((h&2) === 0 ? v : -v)
		}

		function grad2d(i,x,y) {
			let v = (i & 1) === 0 ? x : y
			return (i&2) === 0 ? -v : v
		}

		function grad1d(i,x) {
			return (i&1) === 0 ? -x : x
		}

		function lerp(t,a,b) {
			return a + t * (b - a)
		}

		this.noise3d = function(x, y, z) {
			let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255
			x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z)
			let fx = (3-2*x)*x*x, fy = (3-2*y)*y*y, fz = (3-2*z)*z*z
			let p0 = perm[X]+Y, p00 = perm[p0] + Z, p01 = perm[p0 + 1] + Z,
				p1 = perm[X + 1] + Y, p10 = perm[p1] + Z, p11 = perm[p1 + 1] + Z
			return lerp(fz,
				lerp(fy, lerp(fx, grad3d(perm[p00], x, y, z), grad3d(perm[p10], x-1, y, z)),
					lerp(fx, grad3d(perm[p01], x, y-1, z), grad3d(perm[p11], x-1, y-1,z))),
				lerp(fy, lerp(fx, grad3d(perm[p00 + 1], x, y, z-1), grad3d(perm[p10 + 1], x-1, y, z-1)),
					lerp(fx, grad3d(perm[p01 + 1], x, y-1, z-1), grad3d(perm[p11 + 1], x-1, y-1,z-1))))
		}

		this.noise2d = function(x, y) {
			let X = Math.floor(x)&255, Y = Math.floor(y)&255
			x -= Math.floor(x); y -= Math.floor(y)
			let fx = (3-2*x)*x*x, fy = (3-2*y)*y*y
			let p0 = perm[X]+Y, p1 = perm[X + 1] + Y
			return lerp(fy,
				lerp(fx, grad2d(perm[p0], x, y), grad2d(perm[p1], x-1, y)),
				lerp(fx, grad2d(perm[p0 + 1], x, y-1), grad2d(perm[p1 + 1], x-1, y-1)))
		}

		this.noise1d = function(x) {
			let X = Math.floor(x)&255
			x -= Math.floor(x)
			let fx = (3-2*x)*x*x
			return lerp(fx, grad1d(perm[X], x), grad1d(perm[X+1], x-1))
		}
	}
	let noiseSeed = function(seed) {
		noiseProfile.seed = seed
		noiseProfile.generator = new PerlinNoise(noiseProfile.seed)
		seedBiomeNoise(seed)
	}
	let noise = function(x, y, z) {
		let generator = noiseProfile.generator
		let effect = 1, k = 1, sum = 0
		for(let i = 0; i < noiseProfile.octaves; ++i) {
			effect *= noiseProfile.fallout
			switch (arguments.length) {
				case 1:
					sum += effect * (1 + generator.noise1d(k*x))/2; break
				case 2:
					sum += effect * (1 + generator.noise2d(k*x, k*y))/2; break
				case 3:
					sum += effect * (1 + generator.noise3d(k*x, k*y, k*z))/2; break
			}
			k *= 2
		}
		return sum
	}

	let caveNoise
	
	function openSimplexNoise(clientSeed) {
		const SQ4 = 2
		const toNums = function(s) { return s.split(",").map(function(s) { return new Uint8Array(s.split("").map(function(v) { return Number(v) })) }) }
		const decode = function(m, r, s) { return new Int8Array(s.split("").map(function(v) { return parseInt(v, r) + m })) }
		const toNumsB32 = function(s) { return s.split(",").map(function(s) { return parseInt(s, 32) }) }
		const NORM_3D = 1.0 / 206.0
		const SQUISH_3D = 1 / 3
		const STRETCH_3D = -1 / 6
		var base3D = toNums("0000110010101001,2110210120113111,110010101001211021012011")
		const gradients3D = decode(-11, 23, "0ff7mf7fmmfffmfffm07f70f77mm7ff0ff7m0f77m77f0mf7fm7ff0077707770m77f07f70")
		var lookupPairs3D = function() { return new Uint16Array(toNumsB32("0,2,1,1,2,2,5,1,6,0,7,0,10,2,12,2,41,1,45,1,50,5,51,5,g6,0,g7,0,h2,4,h6,4,k5,3,k7,3,l0,5,l1,5,l2,4,l5,3,l6,4,l7,3,l8,d,l9,d,la,c,ld,e,le,c,lf,e,m8,k,ma,i,p9,l,pd,n,q8,k,q9,l,15e,j,15f,m,16a,i,16e,j,19d,n,19f,m,1a8,f,1a9,h,1aa,f,1ad,h,1ae,g,1af,g,1ag,b,1ah,a,1ai,b,1al,a,1am,9,1an,9,1bg,b,1bi,b,1eh,a,1el,a,1fg,8,1fh,8,1qm,9,1qn,9,1ri,7,1rm,7,1ul,6,1un,6,1vg,8,1vh,8,1vi,7,1vl,6,1vm,7,1vn,6")) }
		var p3D = decode(-1, 5, "112011210110211120110121102132212220132122202131222022243214231243124213241324123222113311221213131221123113311112202311112022311112220342223113342223311342223131322023113322023311320223113320223131322203311322203131")
		const setOf = function(count) { var a = [],i = 0; while (i < count) { a.push(i++) } return a }
		const doFor = function(count, cb) { var i = 0; while (i < count && cb(i++) !== true) {} }

		function shuffleSeed(seed,count){
			seed = seed * 1664525 + 1013904223 | 0
			count -= 1
			return count > 0 ? shuffleSeed(seed, count) : seed
		}
		const types = {
			_3D : {
				base : base3D,
				squish : SQUISH_3D,
				dimensions : 3,
				pD : p3D,
				lookup : lookupPairs3D,
			}
		}

		function createContribution(type, baseSet, index) {
			var i = 0
			const multiplier = baseSet[index ++]
			const c = { next : undefined }
			while(i < type.dimensions) {
				const axis = ("xyzw")[i]
				c[axis + "sb"] = baseSet[index + i]
				c["d" + axis] = - baseSet[index + i++] - multiplier * type.squish
			}
			return c
		}

		function createLookupPairs(lookupArray, contributions){
			var i
			const a = lookupArray()
			const res = new Map()
			for (i = 0; i < a.length; i += 2) { res.set(a[i], contributions[a[i + 1]]); }
			return res
		}

		function createContributionArray(type) {
			const conts = []
			const d = type.dimensions
			const baseStep = d * d
			var k, i = 0
			while (i < type.pD.length) {
				const baseSet = type.base[type.pD[i]]
				let previous, current
				k = 0
				do {
					current = createContribution(type, baseSet, k)
					if (!previous) { conts[i / baseStep] = current; }
					else { previous.next = current; }
					previous = current
					k += d + 1
				} while(k < baseSet.length)

				current.next = createContribution(type, type.pD, i + 1)
				if (d >= 3) { current.next.next = createContribution(type, type.pD, i + d + 2) }
				if (d === 4) { current.next.next.next = createContribution(type, type.pD, i + 11) }
				i += baseStep
			}
			const result = [conts, createLookupPairs(type.lookup, conts)]
			type.base = undefined
			type.lookup = undefined
			return result
		}

		let temp = createContributionArray(types._3D)
		const contributions3D = temp[0], lookup3D = temp[1]
		const perm = new Uint8Array(256)
		const perm3D = new Uint8Array(256)
		const source = new Uint8Array(setOf(256))
		var seed = shuffleSeed(clientSeed, 3)
		doFor(256, function(i) {
			i = 255 - i
			seed = shuffleSeed(seed, 1)
			var r = (seed + 31) % (i + 1)
			r += r < 0 ? i + 1 : 0
			perm[i] = source[r]
			perm3D[i] = (perm[i] % 24) * 3
			source[r] = source[i]
		})
		base3D = undefined
		lookupPairs3D = undefined
		p3D = undefined

		return function(x, y, z) {
			const pD = perm3D
			const p = perm
			const g = gradients3D
			const stretchOffset = (x + y + z) * STRETCH_3D
			const xs = x + stretchOffset, ys = y + stretchOffset, zs = z + stretchOffset
			const xsb = Math.floor(xs), ysb = Math.floor(ys), zsb = Math.floor(zs)
			const squishOffset	= (xsb + ysb + zsb) * SQUISH_3D
			const dx0 = x - (xsb + squishOffset), dy0 = y - (ysb + squishOffset), dz0 = z - (zsb + squishOffset)
			const xins = xs - xsb, yins = ys - ysb, zins = zs - zsb
			const inSum = xins + yins + zins
			var c = lookup3D.get(
				(yins - zins + 1) |
				((xins - yins + 1) << 1) |
				((xins - zins + 1) << 2) |
				(inSum << 3) |
				((inSum + zins) << 5) |
				((inSum + yins) << 7) |
				((inSum + xins) << 9)
			)
			var i, value = 0
			while (c !== undefined) {
				const dx = dx0 + c.dx, dy = dy0 + c.dy, dz = dz0 + c.dz
				let attn = 2 - dx * dx - dy * dy - dz * dz
				if (attn > 0) {
					i = pD[(((p[(xsb + c.xsb) & 0xFF] + (ysb + c.ysb)) & 0xFF) + (zsb + c.zsb)) & 0xFF]
					attn *= attn
					value += attn * attn * (g[i++] * dx + g[i++] * dy + g[i] * dz)
				}
				c = c.next
			}
			return value * NORM_3D + 0.5
		}
	}

	let PVector = function(x, y, z) {
		this.x = x
		this.y = y
		this.z = z
		this.set = function(x, y, z) {
			if (y === undefined) {
				this.x = x.x
				this.y = x.y
				this.z = x.z
			} else {
				this.x = x
				this.y = y
				this.z = z
			}
		}
		this.normalize = function() {
			let mag = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
			this.x /= mag
			this.y /= mag
			this.z /= mag
		}
		this.add = function(v) {
			this.x += v.x
			this.y += v.y
			this.z += v.z
		}
		this.mult = function(m) {
			this.x *= m
			this.y *= m
			this.z *= m
		}
	}

	// ---- Biomes ----
	// A biome decides the surface material of the terrain and how that surface
	// is decorated (trees, flowers, ...). Each biome sits at a point in a 2D
	// climate space (temperature x humidity). Two low-frequency noise fields are
	// sampled and passed through a logistic curve that flattens the noise into a
	// roughly uniform value, then the nearest climate point wins (a Voronoi
	// diagram). A per-biome rarity weight lets common biomes take more space.
	// Biomes also carry a smooth height scale/offset so terrain rises toward
	// mountains.
	let biomeNoiseProfile = { generator: undefined, octaves: 3, fallout: 0.5 }
	function seedBiomeNoise(seed) {
		// Offset the seed so the biome field does not line up with the terrain.
		biomeNoiseProfile.generator = new PerlinNoise((seed ^ 0x1d2c3b4a) | 0)
	}
	function biomeNoise2d(x, z) {
		let generator = biomeNoiseProfile.generator
		let effect = 1, k = 1, sum = 0, norm = 0
		for (let i = 0; i < biomeNoiseProfile.octaves; i++) {
			effect *= biomeNoiseProfile.fallout
			sum += effect * (1 + generator.noise2d(k * x, k * z)) / 2
			norm += effect
			k *= 2
		}
		return norm ? sum / norm : 0
	}
	// How far apart biomes are in the world, and how hard the logistic curve
	// pushes the middle of the noise distribution toward 0/1.
	const BIOME_SCALE = 0.0018
	const BIOME_SIGMA = 0.07
	// Sample climate through a smooth displacement field. Without this the
	// nearest-point biome lookup produces long, ruler-straight borders; warping
	// the lookup position bends those edges into irregular, organic shapes.
	const BIOME_WARP_SCALE = 0.0064
	const BIOME_WARP_AMOUNT = 56
	function biomeWarp2d(x, z) {
		let generator = biomeNoiseProfile.generator
		return generator ? generator.noise2d(x, z) : 0
	}
	function biomeSpread(value) {
		// Logistic CDF of the (roughly normal) noise field; flattens it into a
		// near-uniform climate value so climate points are hit evenly.
		return 1 / (1 + Math.exp(-1.702 * (value - 0.5) / BIOME_SIGMA))
	}
	function biomeClimateAt(x, z) {
		if (!biomeNoiseProfile.generator) return [ 0.5, 0.5 ]
		// One octave per axis is enough for a broad warp and keeps worldgen fast.
		let wx = x + biomeWarp2d(x * BIOME_WARP_SCALE + 41.7, z * BIOME_WARP_SCALE - 93.1) * BIOME_WARP_AMOUNT
		let wz = z + biomeWarp2d(x * BIOME_WARP_SCALE - 128.9, z * BIOME_WARP_SCALE + 57.3) * BIOME_WARP_AMOUNT
		return [
			biomeSpread(biomeNoise2d(wx * BIOME_SCALE, wz * BIOME_SCALE)),
			biomeSpread(biomeNoise2d(wx * BIOME_SCALE + 137.31, wz * BIOME_SCALE - 91.77)),
		]
	}
	// temperature: 0 = freezing, 1 = scorching; humidity: 0 = arid, 1 = soaked.
	// layers are the blocks placed under the surface, top to bottom.
	const BIOMES = [
		{
			name: "plains", temperature: 0.4, humidity: 0.15, rarity: 0.85,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.005, trees: [ blockIds.oakLog, blockIds.birchLog ], leaves: blockIds.leaves,
			flowerChance: 0.012, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "forest", temperature: 0.45, humidity: 0.87, rarity: 0.9,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.045, trees: [ blockIds.oakLog, blockIds.birchLog ], leaves: blockIds.leaves,
			flowerChance: 0.006, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "birch_forest", temperature: 0.42, humidity: 0.65, rarity: 1.05,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.045, trees: [ blockIds.birchLog ], leaves: blockIds.justLeaves,
			flowerChance: 0.01, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "dark_forest", temperature: 0.65, humidity: 0.65, heightScale: 0.95, rarity: 1.4,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.06, trees: [ blockIds.darkOakLog ], leaves: blockIds.darkOakLeaves,
			flowerChance: 0.003, flowers: [ blockIds.poppy ],
		},
		{
			name: "cherry_grove", temperature: 0.5, humidity: 0.72, rarity: 1.5,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.04, trees: [ blockIds.cherryLog ], leaves: blockIds.cherryLeaves,
			flowerChance: 0.02, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "taiga", temperature: 0.15, humidity: 0.5, heightScale: 1.05,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.03, trees: [ blockIds.spruceLog ], leaves: blockIds.spruceLeaves,
			flowerChance: 0.004, flowers: [ blockIds.poppy, blockIds.dandelion ],
		},
		{
			name: "snowy_taiga", temperature: 0.1, humidity: 0.85, heightScale: 1.1, rarity: 1.05,
			surface: blockIds.snowyGrass, layers: [ [ blockIds.dirt, 3 ] ], snowCover: true,
			treeChance: 0.022, trees: [ blockIds.spruceLog ], leaves: blockIds.spruceLeaves,
			flowerChance: 0, flowers: [],
		},
		{
			name: "snowy_plains", temperature: 0.12, humidity: 0.15,
			surface: blockIds.snowyGrass, layers: [ [ blockIds.dirt, 3 ] ], snowCover: true,
			treeChance: 0.004, trees: [ blockIds.spruceLog ], leaves: blockIds.spruceLeaves,
			flowerChance: 0, flowers: [],
		},
		{
			name: "desert", temperature: 0.9, humidity: 0.12, heightScale: 0.8, heightOffset: -2,
			surface: blockIds.sand, layers: [ [ blockIds.sand, 3 ], [ blockIds.sandStone, 3 ] ],
			treeChance: 0, trees: [], leaves: blockIds.leaves,
			flowerChance: 0, flowers: [],
		},
		{
			name: "badlands", temperature: 0.9, humidity: 0.4, heightScale: 1.1, heightOffset: 4, rarity: 1.6,
			surface: blockIds.redSand,
			layers: [
				[ blockIds.redSand, 1 ], [ blockIds.redSandStone, 2 ], [ blockIds.terracotta, 1 ],
				[ blockIds.orangeTerracotta, 1 ], [ blockIds.whiteTerracotta, 1 ], [ blockIds.lightGrayTerracotta, 1 ],
			],
			treeChance: 0, trees: [], leaves: blockIds.leaves,
			flowerChance: 0, flowers: [],
		},
		{
			name: "savanna", temperature: 0.68, humidity: 0.18, heightScale: 0.9, heightOffset: 2, rarity: 0.95,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.012, trees: [ blockIds.acaciaLog ], leaves: blockIds.leaves,
			flowerChance: 0.004, flowers: [ blockIds.dandelion ],
		},
		{
			name: "jungle", temperature: 0.88, humidity: 0.85, heightScale: 1.15, heightOffset: 6, rarity: 1.5,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.06, trees: [ blockIds.jungleLog ], leaves: blockIds.leaves,
			flowerChance: 0.02, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "swamp", temperature: 0.68, humidity: 0.9, heightScale: 0.85, heightOffset: -6, rarity: 1.4,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 2 ], [ blockIds.mud, 1 ] ],
			treeChance: 0.02, trees: [ blockIds.oakLog ], leaves: blockIds.leaves,
			flowerChance: 0.006, flowers: [ blockIds.poppy ],
		},
		{
			name: "flower_forest", temperature: 0.6, humidity: 0.4, rarity: 1.2,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.008, trees: [ blockIds.oakLog, blockIds.birchLog ], leaves: blockIds.leaves,
			flowerChance: 0.12, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "meadow", temperature: 0.4, humidity: 0.4, heightScale: 1.05, heightOffset: 4, rarity: 1.1,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0.003, trees: [ blockIds.oakLog ], leaves: blockIds.leaves,
			flowerChance: 0.06, flowers: [ blockIds.poppy, blockIds.cornflower, blockIds.dandelion ],
		},
		{
			name: "stony_peaks", temperature: 0.06, humidity: 0.5, heightScale: 1.7, heightOffset: 22, rarity: 2.0,
			surface: blockIds.stone, layers: [ [ blockIds.gravel, 2 ], [ blockIds.stone, 2 ] ],
			snowCover: true, snowLine: 112,
			treeChance: 0, trees: [], leaves: blockIds.leaves,
			flowerChance: 0, flowers: [],
		},
		// 26.3's cold mixed forest.  It sits between taiga and forest in the
		// climate grid, and BiomeGenerator further restricts it to low and
		// moderate erosion.  Poplars are placed by FeaturePlacer rather than
		// the generic oak-style tree loop.
		{
			name: "dappled_forest", temperature: 0.23, humidity: 0.57, heightScale: 1.02, rarity: 1.15,
			surface: blockIds.grass, layers: [ [ blockIds.dirt, 3 ] ],
			treeChance: 0, trees: [ blockIds.poplarLog ], leaves: blockIds.orangePoplarLeaves,
			flowerChance: 0.003, flowers: [ blockIds.poppy, blockIds.dandelion ],
			leafLitterChance: 0.34, redShrubChance: 0.065, poplarChance: 0.032,
			fallenLogChance: 0.55, shelfMushroomChance: 0.22,
			mobVariant: "cold_taiga",
			passiveMobs: [ "sheep", "chicken", "cow", "pig", "rabbit", "fox" ],
		},
	]
	// Plains is index 0 and is used as the fallback when nothing else fits.
	const BIOME_PLAINS = 0
	function biomeSample(climate) {
		let best = 0, bestDist = Infinity
		let weightSum = 0, scale = 0, offset = 0
		for (let i = 0; i < BIOMES.length; i++) {
			let biome = BIOMES[i]
			let dt = climate[0] - biome.temperature
			let dh = climate[1] - biome.humidity
			let dist = dt * dt + dh * dh
			// Rarity pushes a biome's border inward without adding gaps: common
			// biomes get most of the map, while peaks, badlands and jungles stay
			// occasional the way they are in Minecraft instead of an equal split.
			let weighted = dist * (biome.rarity === undefined ? 1 : biome.rarity)
			if (weighted < bestDist) { bestDist = weighted; best = i }
			// Blend height scale/offset so terrain flows smoothly between biomes.
			// This uses the real distance, not the rarity-weighted one.
			let weight = 1 / (dist + 0.0005)
			weightSum += weight
			scale += weight * (biome.heightScale === undefined ? 1 : biome.heightScale)
			offset += weight * (biome.heightOffset === undefined ? 0 : biome.heightOffset)
		}
		return { id: best, scale: scale / weightSum, offset: offset / weightSum }
	}
	function biomeAt(x, z) {
		return biomeSample(biomeClimateAt(x, z)).id
	}
	win.BIOMES = BIOMES
	win.biomeAt = biomeAt



export {
	seedHash, hash, Marsaglia, randomSeed, random,
	noiseProfile, PerlinNoise, noiseSeed, noise,
	openSimplexNoise, PVector,
	biomeNoiseProfile, seedBiomeNoise, biomeNoise2d,
	BIOME_SCALE, BIOME_SIGMA, biomeSpread, biomeClimateAt,
	BIOMES, BIOME_PLAINS, biomeSample, biomeAt
}
