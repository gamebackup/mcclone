// Terrain column provider.  This is the bridge between the climate sampler
// and chunk storage: it turns the 2D climate/density fields into a height,
// then applies the surface builder (floor, intermediate layers, deep stone and
// deepslate) and writes the complete column into a chunk.
import { blockIds } from './blocks.js'
import { noise } from './noise.js'
import { generator, maxHeight, superflat } from './state.js'
import { BiomeGenerator } from './BiomeGenerator.js'

const MOUNTAIN_ROCK_LINE = 96
const MOUNTAIN_SNOW_LINE = 112
const MOUNTAIN_LAYERS = [ [ blockIds.stone, 4 ] ]

function clamp(value, min, max) {
	return value < min ? min : value > max ? max : value
}

export class TerrainProvider {
	constructor(biomes) {
		this.biomes = biomes || new BiomeGenerator()
		this.rockLine = MOUNTAIN_ROCK_LINE
		this.snowLine = MOUNTAIN_SNOW_LINE
		this.mountainLayers = MOUNTAIN_LAYERS
	}

	// Continentalness and erosion control the large relief, while the 3D
	// density sample is used as a low-cost shift of the surface.  The final
	// shape still follows the project's existing height map, so old worlds do
	// not suddenly become unplayable when this pipeline is enabled.
	sampleColumn(x, z) {
		let climate = this.biomes.sample(x, z)
		let biome = climate.biome
		let height
		if (superflat) {
			height = 4
		} else {
			let base = noise(x * generator.smooth, z * generator.smooth) * generator.height * climate.scale
			let continentalLift = (climate.continentalness - 0.5) * 7
			let erosionRelief = (0.5 - climate.erosion) * 4
			let peakRelief = (climate.peaksAndValleys - 0.5) * 5
			let densityShift = (noise(x * 0.0031 + 19.7, 40.5, z * 0.0031 - 81.2) - 0.5) * 4
			height = Math.round(base) + generator.extra + Math.round(climate.offset) +
				Math.round(continentalLift + erosionRelief + peakRelief + densityShift)
		}
		height = clamp(height, 2, maxHeight - 2)

		let mountain = !superflat && height >= this.rockLine
		let snowCovered = !!(biome && biome.snowCover &&
			(biome.snowLine === undefined || height >= biome.snowLine))
		if (mountain && height >= this.snowLine) snowCovered = true

		// Mountain slopes use a stone floor regardless of the climate biome,
		// except stony peaks which already have a stone/gravel profile.
		let surface = mountain ? blockIds.stone : (biome ? biome.surface : blockIds.grass)
		let layers = mountain && biome && biome.name !== 'stony_peaks'
			? this.mountainLayers
			: (biome && biome.layers ? biome.layers : [ [ blockIds.dirt, 3 ] ])

		// Wavy deepslate boundary, following the same depth logic as the old
		// generator but sampled once per column instead of per block.
		let deepslateTop = 26 + Math.round((noise(x * 0.06 + 71.3, z * 0.06 - 23.9) - 0.5) * 20)
		deepslateTop = clamp(deepslateTop, 2, Math.max(2, height - 1))

		return {
			id: climate.id,
			biome: biome,
			height: height,
			mountain: mountain,
			surface: surface,
			layers: layers,
			snowCovered: snowCovered,
			deepslateTop: deepslateTop,
			climate: climate,
			floor: surface,
			intermediate: layers[0] ? layers[0][0] : blockIds.dirt,
			deep: deepslateTop,
		}
	}

	// A small surface density field.  It is intentionally separate from the
	// height map: future cave/overhang work can consume this without changing
	// the stable column shape that existing saves rely on.
	densityAt(x, y, z, column) {
		let depth = column ? column.height - y : 0
		let detail = noise(x * 0.055, y * 0.07, z * 0.055) - 0.5
		return depth / 16 + detail * 0.35
	}

	fillColumn(chunk, localX, localZ, column) {
		let ground = column.height
		chunk.tops[localZ * 16 + localX] = ground
		chunk.biomes[localZ * 16 + localX] = column.id

		chunk.setBlock(localX, ground, localZ, column.surface)
		if (column.snowCovered && ground + 1 < maxHeight) {
			chunk.setBlock(localX, ground + 1, localZ, blockIds.snowLayer)
		}

		let y = ground - 1
		for (let layerIndex = 0; layerIndex < column.layers.length; layerIndex++) {
			let layer = column.layers[layerIndex]
			for (let count = 0; count < layer[1] && y > 0; count++) {
				chunk.setBlock(localX, y, localZ, layer[0])
				y--
			}
		}

		for (; y > 0; y--) {
			chunk.setBlock(localX, y, localZ, y < column.deepslateTop ? blockIds.deepslate : blockIds.stone)
		}
		chunk.setBlock(localX, 0, localZ, blockIds.bedrock)
	}
}

export { MOUNTAIN_ROCK_LINE, MOUNTAIN_SNOW_LINE, MOUNTAIN_LAYERS }
