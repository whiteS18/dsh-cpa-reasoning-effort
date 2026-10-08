/**
 * Fill original-vendor thinking levels onto CPA models so the composer
 * effort menu can offer them.
 *
 * The dialog already renders whatever `reasoningEfforts` the llm-pi-ai route
 * declares. A custom provider is not matched to the installed catalog by
 * model name, so this plugin writes the missing field for the configured
 * provider ids only. Models that already declare the field, and aliases that
 * already pin an effort in the id, are left unchanged.
 *
 * Triggering is resilient: the annotate pass runs on activation, on
 * config-reload and llm-adapter events, and once the application is ready.
 * A pass that cannot reach llm-pi-ai yet — the entry is still mounting or
 * the edit loses the boot-time loader race — is retried with backoff, so a
 * model added while the host was starting still gains its levels without a
 * restart or a manual edit.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { annotateConfig, createCatalog } from './efforts.js'

export const name = 'dsh-cpa-reasoning-effort'
export const inject = ['configEditor']

const LLM_ENTRY_ID = 'llm-pi-ai'
const DEFAULT_PROVIDERS = Object.freeze(['easy-cliproxyapi'])
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
/** Backoff between retries when a pass could not finish (ms). */
const RETRY_DELAYS = Object.freeze([1000, 3000, 10000, 30000])

const catalog = createCatalog(Object.entries(JSON.parse(readFileSync(
	join(MODULE_DIR, 'vendor-efforts.json'),
	'utf8',
))).map(([id, efforts]) => ({ id, efforts })))

/**
 * @param {unknown} config
 * @returns {readonly string[]}
 */
function providerIds(config) {
	const declared = config !== null && typeof config === 'object' ? config.providers : undefined
	if (!Array.isArray(declared)) return DEFAULT_PROVIDERS
	const ids = declared.filter((id) => typeof id === 'string' && id.length > 0)
	return ids.length > 0 ? ids : DEFAULT_PROVIDERS
}

/**
 * @param {unknown} config
 * @returns {boolean}
 */
function enabled(config) {
	return !(config !== null && typeof config === 'object' && config.enabled === false)
}

/**
 * One annotate pass.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {readonly string[]} providers
 * @returns {Promise<'applied' | 'noop' | 'pending'>} `pending` when llm-pi-ai
 * was not reachable or the write failed — the caller should retry later.
 */
async function reconcile(ctx, providers) {
	const editor = ctx.configEditor
	const row = editor.configuration().find((item) => item.entry.options?.id === LLM_ENTRY_ID)
	if (row === undefined) {
		ctx.logger?.info('llm-pi-ai is not mounted yet; CPA thinking levels will be retried')
		return 'pending'
	}
	const preview = annotateConfig(row.override, providers, catalog)
	if (preview.changes.length === 0) return 'noop'
	try {
		// Re-annotate inside the edit transaction: the editor reconciles the
		// loader before invoking `change`, so annotating the fresh `current`
		// never clobbers a config edit that landed after the preview was read.
		await editor.edit(row.entry, (current) => {
			const fresh = annotateConfig(current, providers, catalog)
			return fresh.changes.length === 0 ? current : fresh.config
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.logger?.warn(`CPA thinking levels were not applied: ${message}`)
		return 'pending'
	}
	ctx.logger?.info(`declared original-vendor thinking levels for ${preview.changes.join(', ')}`)
	return 'applied'
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} config
 */
export function apply(ctx, config) {
	// configEditor.edit serializes through hmr.runExclusive, which rejects
	// nested transactions. Plugin activation and config-reload listeners run
	// inside such a transaction, so the write must be moved outside the
	// transaction's async-local scope before it reaches the editor.
	const executing = ctx.get('hmr')?.executing
	const providers = providerIds(config)
	let writing = false
	let dirty = false
	let disposed = false
	const timers = new Set()

	const attempt = (round) => {
		if (!enabled(config) || disposed) return
		if (writing) {
			dirty = true
			return
		}
		writing = true
		const work = () => reconcile(ctx, providers).then((status) => {
			if (status === 'pending' && !disposed) {
				const delay = RETRY_DELAYS[Math.min(round, RETRY_DELAYS.length - 1)]
				const timer = setTimeout(() => {
					timers.delete(timer)
					attempt(round + 1)
				}, delay)
				timer.unref?.()
				timers.add(timer)
			}
		}, (error) => {
			const message = error instanceof Error ? error.message : String(error)
			ctx.logger?.warn(`CPA thinking levels were not applied: ${message}`)
		}).finally(() => {
			writing = false
			if (dirty && !disposed) {
				dirty = false
				attempt(0)
			}
		})
		if (executing !== undefined && executing.getStore() === true && typeof executing.exit === 'function') {
			executing.exit(work)
			return
		}
		work()
	}

	const run = () => attempt(0)
	run()
	// Boot-time passes race the loader: llm-pi-ai may still be mounting and a
	// configEditor edit may lose to the initial reconciliation. A settle pass
	// once the application is ready recovers whatever the early passes missed.
	const ready = ctx.get('appReady')
	const cancelReady = typeof ready?.onReady === 'function' ? ready.onReady(run) : undefined
	ctx.on('app-boot/config-reload', run)
	ctx.on('llm/adapters-updated', run)
	ctx.on('dispose', () => {
		disposed = true
		cancelReady?.()
		for (const timer of timers) clearTimeout(timer)
		timers.clear()
	})
}
