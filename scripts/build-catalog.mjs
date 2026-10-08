/**
 * Rebuild vendor-efforts.json from the extracted pi-ai origin catalogs.
 *
 * Gateways (OpenRouter, Azure, Copilot, …) are ignored: the same model id
 * often carries a shortened or rewritten map there. The first origin file
 * that publishes a model wins, which is the vendor's own spelling.
 *
 * Usage: node scripts/build-catalog.mjs <pi-ai-catalog dir>
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = [
	'xai.json',
	'google.json',
	'anthropic.json',
	'openai.json',
	'deepseek.json',
	'moonshotai.json',
	'kimi-coding.json',
	'minimax.json',
	'mistral.json',
	'meta.json',
	'zai.json',
	'qwen-token-plan.json',
]
const ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const source = process.argv[2]
if (source === undefined) {
	console.error('usage: node scripts/build-catalog.mjs <pi-ai-catalog dir>')
	process.exit(1)
}
const present = new Set(readdirSync(source))
const catalog = {}
for (const file of ORIGIN) {
	if (!present.has(file)) continue
	const data = JSON.parse(readFileSync(join(source, file), 'utf8'))
	for (const models of Object.values(data)) {
		if (models === null || typeof models !== 'object') continue
		for (const [id, model] of Object.entries(models)) {
			if (Object.hasOwn(catalog, id)) continue
			const map = model?.thinkingLevelMap
			if (map === null || typeof map !== 'object') continue
			const efforts = {}
			for (const level of ORDER) {
				const wire = map[level]
				if (typeof wire === 'string' && wire.length > 0) efforts[level] = wire
			}
			if (Object.keys(efforts).length === 0) continue
			catalog[id] = efforts
		}
	}
}
const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor-efforts.json')
writeFileSync(destination, `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`${Object.keys(catalog).length} models -> ${destination}`)
