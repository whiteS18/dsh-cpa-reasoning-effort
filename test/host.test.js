import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../index.js'

/**
 * Minimal host double: a configEditor whose configuration()/edit() mimic the
 * real ConfigEditor contract, plus an event registry for ctx.on handlers.
 */
function createHost({ config, editFailures = 0, mountRounds = 0 } = {}) {
	const listeners = new Map()
	let edits = editFailures
	let mounts = mountRounds
	const written = []
	const editor = {
		configuration() {
			if (mounts > 0) {
				mounts -= 1
				return []
			}
			return [{ entry: { options: { id: 'llm-pi-ai' } }, override: structuredClone(config) }]
		},
		async edit(_entry, change) {
			if (edits > 0) {
				edits -= 1
				throw new Error('Configuration entry changed during reload')
			}
			const next = change(structuredClone(config), {})
			written.push(next)
			config.providers = next.providers
		},
	}
	const ctx = {
		configEditor: editor,
		logger: { info() {}, warn() {} },
		get: () => undefined,
		on: (event, listener) => listeners.set(event, listener),
		emit: (event) => listeners.get(event)?.(),
	}
	return { ctx, listeners, written, emit: (event) => ctx.emit(event), config: () => config }
}

const baseConfig = () => ({
	providers: {
		'easy-cliproxyapi': {
			models: [{ id: 'kimi-k3-256k', name: 'kimi-k3-256k', input: ['text', 'image'] }],
		},
	},
})

test('activation annotates a model missing reasoningEfforts', async () => {
	const host = createHost({ config: baseConfig() })
	apply(host.ctx, { providers: ['easy-cliproxyapi'] })
	await new Promise((resolve) => setImmediate(resolve))
	const [model] = host.config().providers['easy-cliproxyapi'].models
	assert.deepEqual(model.reasoningEfforts, { low: 'low', high: 'high', max: 'max' })
})

test('a boot-time edit failure is retried until the write lands', async () => {
	const host = createHost({ config: baseConfig(), editFailures: 1 })
	apply(host.ctx, { providers: ['easy-cliproxyapi'] })
	await new Promise((resolve) => setTimeout(resolve, 1500))
	const [model] = host.config().providers['easy-cliproxyapi'].models
	assert.deepEqual(model.reasoningEfforts, { low: 'low', high: 'high', max: 'max' })
})

test('a late-mounted llm-pi-ai is picked up by retry, then events are no-ops', async () => {
	const host = createHost({ config: baseConfig(), mountRounds: 2 })
	apply(host.ctx, { providers: ['easy-cliproxyapi'] })
	await new Promise((resolve) => setTimeout(resolve, 5000))
	const [model] = host.config().providers['easy-cliproxyapi'].models
	assert.deepEqual(model.reasoningEfforts, { low: 'low', high: 'high', max: 'max' })
	const writes = host.written.length
	host.emit('app-boot/config-reload')
	host.emit('llm/adapters-updated')
	await new Promise((resolve) => setTimeout(resolve, 100))
	assert.equal(host.written.length, writes)
})

test('dispose stops pending retries', async () => {
	const host = createHost({ config: baseConfig(), editFailures: 99 })
	apply(host.ctx, { providers: ['easy-cliproxyapi'] })
	await new Promise((resolve) => setImmediate(resolve))
	host.emit('dispose')
	const writes = host.written.length
	await new Promise((resolve) => setTimeout(resolve, 1500))
	assert.equal(host.written.length, writes)
})
