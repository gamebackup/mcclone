// Climate-grid biome lookup for the 26.3 terrain pipeline.
//
// The climate-space Voronoi lookup in noise.js still chooses the biome, but it
// is fed through the same five broad noise fields used by the vanilla
// overworld: continentalness, erosion, peaks-and-valleys, weirdness and a
// temperature/humidity climate.  Keeping this in one class means terrain,
// features and structures all see exactly the same biome sample.
import { BIOMES, biomeClimateAt, biomeNoiseProfile, biomeSample } from './noise.js'

export const DAPPLED_FOREST = 'dappled_forest'

function broadNoise(x, z) {
	let generator = biomeNoiseProfile.generator
	if (!generator) return 0.5
	return (generator.noise2d(x, z) + 1) * 0.5
}

function clamp01(value) {
	return value < 0 ? 0 : value > 1 ? 1 : value
}

export class BiomeGenerator {
	constructor() {
		this.last = null
	}

	climateAt(x, z) {
		return biomeClimateAt(x, z)
	}

	// A single low-cost sample per column.  The extra fields are deliberately
	// low frequency (continental/ocean scale), while weirdness stays at the
	// local scale where it can add smaller terrain variation.
	sample(x, z) {
		let climate = this.climateAt(x, z)
		let nearest = biomeSample(climate)
		let continentalness = clamp01(broadNoise(x * 0.00072 + 103.17, z * 0.00072 - 77.43))
		let erosion = clamp01(broadNoise(x * 0.00118 - 59.21, z * 0.00118 + 88.64))
		let warp = broadNoise(x * 0.00215 + 17.3, z * 0.00215 + 41.9)
		let peaksAndValleys = 1 - Math.abs(warp * 2 - 1)
		let weirdness = clamp01(broadNoise(x * 0.0044 - 31.77, z * 0.0044 + 12.31))
		let id = nearest.id
		let biome = BIOMES[id]

		// Dappled Forest is a cold, mixed forest.  It belongs beside taiga and
		// snowy taiga, and only takes low-to-moderate erosion cells; steep,
		// heavily eroded ground falls back to the taiga climate point.
		if (biome && biome.name === DAPPLED_FOREST && erosion > 0.7) {
			let taiga = BIOMES.findIndex(entry => entry.name === 'taiga')
			if (taiga >= 0) {
				id = taiga
				biome = BIOMES[id]
			}
		}

		let sample = {
			id: id,
			biome: biome,
			climate: climate,
			scale: nearest.scale,
			offset: nearest.offset,
			continentalness: continentalness,
			erosion: erosion,
			peaksAndValleys: peaksAndValleys,
			weirdness: weirdness,
			mobProfile: this.mobProfileFor(biome && biome.name),
		}
		this.last = sample
		return sample
	}

	// Passive mobs are not entities in this engine, but the filters are kept
	// here so a future mob layer can use the cold/taiga texture set without
	// having to duplicate biome knowledge.  Dappled Forest deliberately uses
	// the cold variants for sheep, chickens, cows, pigs, rabbits and foxes.
	mobProfileFor(biomeName) {
		if (biomeName === DAPPLED_FOREST) {
			return {
				variant: 'cold_taiga',
				textureSet: 'taiga',
				mobs: [ 'sheep', 'chicken', 'cow', 'pig', 'rabbit', 'fox' ],
			}
		}
		if (biomeName === 'taiga' || biomeName === 'snowy_taiga') {
			return { variant: 'cold', textureSet: 'taiga', mobs: [ 'sheep', 'chicken', 'cow', 'pig', 'rabbit', 'fox' ] }
		}
		return { variant: 'temperate', textureSet: 'temperate', mobs: [ 'sheep', 'chicken', 'cow', 'pig', 'rabbit', 'fox' ] }
	}
}
