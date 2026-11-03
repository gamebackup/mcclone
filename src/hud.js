// Vanilla status HUD: hearts, hunger, armor and air, drawn with the real
// Minecraft 26.3 GUI sprites from textures/hud/.
import { p, inventory, gameMode, width, height, holding, world, setUpdateHUD } from './state.js'
import { isItem, itemDef } from './items.js'

const SPRITE_FILES = {
	heartContainer: "textures/hud/heartContainer.png",
	heartFull: "textures/hud/heartFull.png",
	heartHalf: "textures/hud/heartHalf.png",
	foodEmpty: "textures/hud/foodEmpty.png",
	foodFull: "textures/hud/foodFull.png",
	foodHalf: "textures/hud/foodHalf.png",
	armorEmpty: "textures/hud/armorEmpty.png",
	armorFull: "textures/hud/armorFull.png",
	armorHalf: "textures/hud/armorHalf.png",
	air: "textures/hud/air.png",
	airEmpty: "textures/hud/airEmpty.png",
	slotHelmet: "textures/hud/slotHelmet.png",
	slotChestplate: "textures/hud/slotChestplate.png",
	slotLeggings: "textures/hud/slotLeggings.png",
	slotBoots: "textures/hud/slotBoots.png",
}
const ARMOR_SLOT_SPRITES = ["slotHelmet", "slotChestplate", "slotLeggings", "slotBoots"]

export const hudSprites = {}
for (let name in SPRITE_FILES) {
	if (typeof Image === "undefined") break
	let sprite = { image: new Image(), ready: false }
	hudSprites[name] = sprite
	sprite.image.onload = () => {
		sprite.ready = true
		setUpdateHUD(true)
	}
	sprite.image.src = SPRITE_FILES[name]
}

function drawSprite(ctx, name, x, y, size, alpha) {
	let sprite = hudSprites[name]
	if (!sprite || !sprite.ready) return
	let smooth = ctx.imageSmoothingEnabled
	let previousAlpha = ctx.globalAlpha
	ctx.imageSmoothingEnabled = false
	if (alpha !== undefined) ctx.globalAlpha = alpha
	ctx.drawImage(sprite.image, Math.round(x), Math.round(y), Math.round(size), Math.round(size))
	ctx.globalAlpha = previousAlpha
	ctx.imageSmoothingEnabled = smooth
}

// The empty armor-slot silhouettes shown in the survival inventory.
export function drawArmorSlotGhost(ctx, index, x, y, size) {
	let name = ARMOR_SLOT_SPRITES[index]
	if (!name) return
	let ghost = Math.round(size * 0.82)
	drawSprite(ctx, name, x + (size - ghost) / 2, y + (size - ghost) / 2, ghost, 0.45)
}

// Green-to-red durability bar drawn under an inventory/hotbar icon.
export function drawDurabilityBar(ctx, x, y, w, stack) {
	if (!stack || !isItem(stack.id)) return
	let def = itemDef(stack.id)
	if (!def || !def.durability || !stack.damage) return
	let fraction = Math.max(0, Math.min(1, 1 - stack.damage / def.durability))
	ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
	ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 3)
	ctx.fillStyle = `hsl(${Math.round(fraction * 120)}, 100%, 42%)`
	ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, Math.max(1, Math.round((w - 2) * fraction)), 1)
}

// Blue underwater tint, red damage flash and the orange lava/fire screen
// tint. Drawn before the hotbar and status bars so the HUD itself stays
// readable.
export function drawStatusOverlay(ctx) {
	if (p.spectator) return
	if (p.headInWater) {
		ctx.fillStyle = "rgba(24, 80, 180, 0.30)"
		ctx.fillRect(0, 0, width, height)
	}
	if (gameMode !== "survival") return
	if (p.hurtTime > 0) {
		let alpha = 0.08 + 0.22 * Math.min(1, p.hurtTime / 10)
		ctx.fillStyle = `rgba(255, 0, 0, ${alpha.toFixed(3)})`
		ctx.fillRect(0, 0, width, height)
	}
	if (p.inLava || p.fireTicks > 0) {
		let now = typeof performance !== "undefined" ? performance.now() : Date.now()
		let alpha = 0.12 + Math.abs(Math.sin(now / 220)) * 0.08
		ctx.fillStyle = `rgba(255, 110, 0, ${alpha.toFixed(3)})`
		ctx.fillRect(0, 0, width, height)
	}
}

export function drawStatusBars(ctx) {
	if (gameMode !== "survival" || p.spectator) return
	drawHeldInfo(ctx)
	drawEffectList(ctx)
	let s = inventory.size
	let icon = Math.max(9, Math.round(s * 0.45))
	let step = icon * 8 / 9
	let left = Math.round(width / 2 - 4.5 * s + 25)
	let right = left + 9 * s
	let rowY = Math.round(height - s * 1.5 - icon - Math.max(2, s * 0.12))

	let maxHealth = p.maxHealth || 20
	let health = Math.max(0, Math.min(maxHealth, p.health === undefined ? maxHealth : p.health))
	let jitter = health <= 4
	for (let i = 0; i < 10; i++) {
		let shake = jitter ? (Math.random() * 3 | 0) - 1 : 0
		let x = Math.round(left + i * step)
		let y = Math.round(rowY + shake)
		drawSprite(ctx, "heartContainer", x, y, icon)
		let value = health - i * 2
		if (value >= 2) drawSprite(ctx, "heartFull", x, y, icon)
		else if (value > 0) drawSprite(ctx, "heartHalf", x, y, icon)
	}

	let food = Math.max(0, Math.min(20, p.food === undefined ? 20 : p.food))
	for (let i = 0; i < 10; i++) {
		let x = Math.round(right - icon - i * step)
		drawSprite(ctx, "foodEmpty", x, rowY, icon)
		let value = food - i * 2
		if (value >= 2) drawSprite(ctx, "foodFull", x, rowY, icon)
		else if (value > 0) drawSprite(ctx, "foodHalf", x, rowY, icon)
	}

	let armor = Math.max(0, Math.min(20, Math.ceil(p.armorPoints || 0)))
	if (armor > 0) {
		let armorY = rowY - icon - 2
		for (let i = 0; i < 10; i++) {
			let x = Math.round(left + i * step)
			drawSprite(ctx, "armorEmpty", x, armorY, icon)
			let value = armor - i * 2
			if (value >= 2) drawSprite(ctx, "armorFull", x, armorY, icon)
			else if (value > 0) drawSprite(ctx, "armorHalf", x, armorY, icon)
		}
	}

	// Compact status-effect readout. The cloned HUD keeps this text out of the
	// hotbar's way and refreshes it whenever the survival status key changes.
	function drawHeldInfo(ctx) {
		if (!isItem(holding)) return
		let def = itemDef(holding)
		if (!def) return
		let label = ""
		if (def.behavior === "map") label = "Map  X " + Math.floor(p.x) + "  Z " + Math.floor(p.z)
		else if (def.behavior === "compass") label = "Spawn  X 8  Z 8"
		else if (def.behavior === "clock") label = "Time " + (world && world.time !== undefined ? Math.floor(world.time) : "--")
		if (!label) return
		let s = Math.max(10, Math.round(inventory.size * 0.3))
		ctx.save()
		ctx.font = s + "px Poppins"
		ctx.textAlign = "left"
		ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
		ctx.fillRect(8, 8, ctx.measureText(label).width + 12, s + 4)
		ctx.fillStyle = "#f4d58d"
		ctx.fillText(label, 14, 8 + s + 1)
		ctx.restore()
	}

	function drawEffectList(ctx) {
		if (!p.effects) return
		let names = Object.keys(p.effects)
		if (!names.length) return
		let s = Math.max(10, Math.round(inventory.size * 0.32))
		ctx.save()
		ctx.textAlign = "right"
		ctx.font = s + "px Poppins"
		for (let i = 0; i < names.length; i++) {
			let e = p.effects[names[i]]
			let label = names[i].replace(/([A-Z])/g, " $1")
			label = label.charAt(0).toUpperCase() + label.slice(1) + " " + Math.ceil(e.duration / 20) + "s"
			ctx.fillStyle = "rgba(0, 0, 0, 0.55)"
			let w = ctx.measureText(label).width + 8
			ctx.fillRect(width - w - 8, 8 + i * (s + 4), w, s + 3)
			ctx.fillStyle = "#d8b4ff"
			ctx.fillText(label, width - 12, 8 + i * (s + 4) + s)
		}
		ctx.restore()
	}

	let maxAir = p.maxAir || 300
	let air = Math.max(0, Math.min(maxAir, p.air === undefined ? maxAir : p.air))
	if (air < maxAir) {
		let full = Math.ceil(air / 30)
		let airY = rowY - icon - 2
		for (let i = 0; i < 10; i++) {
			let x = Math.round(right - icon - i * step)
			drawSprite(ctx, i < full ? "air" : "airEmpty", x, airY, icon)
		}
	}
}
