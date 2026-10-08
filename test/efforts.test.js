import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { annotateConfig, classifyModel, createCatalog } from '../efforts.js'

const fixture = createCatalog([
	{ id: 'grok-4.7', efforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', off: null } },
	{ id: 'grok-4', efforts: { low: 'low', high: 'high' } },
	{ id: 'gemini-3.8-flash', efforts: { low: 'low', medium: 'medium', high: 'high' } },
	{ id: 'gemini-3-flash-preview', efforts: { minimal: 'minimal', low: 'low', medium: 'medium', high: 'high' } },
])

test('an unsuffixed alias takes the longest original model', () => {
	const decision = classifyModel('grok-4.7-build-fast', fixture)
	assert.deepEqual(decision, {
		kind: 'efforts',
		canonical: 'grok-4.7',
		efforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
	})
})

test('a suffixed alias maps to the canonical model efforts', () => {
	assert.deepEqual(classifyModel('gemini-3.8-flash-high', fixture), {
		kind: 'efforts',
		canonical: 'gemini-3.8-flash',
		efforts: { low: 'low', medium: 'medium', high: 'high' },
	})
})

test('an exact catalog id is used even when a shorter id is also known', () => {
	assert.equal(classifyModel('grok-4.7', fixture)?.canonical, 'grok-4.7')
	assert.equal(classifyModel('gemini-3-flash-preview', fixture)?.canonical, 'gemini-3-flash-preview')
})

test('unknown models and empty ids are left alone', () => {
	assert.equal(classifyModel('not-a-model', fixture), null)
	assert.equal(classifyModel('', fixture), null)
})

test('only the named provider gains missing efforts', () => {
	const config = {
		providers: {
			'easy-cliproxyapi': {
				models: [
					{ id: 'grok-4.7-build-fast', contextWindow: 500000 },
					{ id: 'gemini-3.8-flash-high', contextWindow: 1048576 },
					{ id: 'custom-local', reasoningEfforts: false },
					{ id: 'grok-4.7', reasoningEfforts: { high: 'high' } },
				],
			},
			'kimi-coding': {
				models: [{ id: 'k3' }],
			},
		},
	}
	const { config: next, changes } = annotateConfig(config, ['easy-cliproxyapi'], fixture)
	assert.deepEqual(changes, ['easy-cliproxyapi/grok-4.7-build-fast', 'easy-cliproxyapi/gemini-3.8-flash-high'])
	assert.deepEqual(next.providers['easy-cliproxyapi'].models[0].reasoningEfforts, {
		low: 'low',
		medium: 'medium',
		high: 'high',
		xhigh: 'xhigh',
	})
	assert.deepEqual(next.providers['easy-cliproxyapi'].models[1].reasoningEfforts, {
		low: 'low',
		medium: 'medium',
		high: 'high',
	})
	assert.equal(next.providers['easy-cliproxyapi'].models[2].reasoningEfforts, false)
	assert.deepEqual(next.providers['easy-cliproxyapi'].models[3].reasoningEfforts, { high: 'high' })
	assert.deepEqual(next.providers['kimi-coding'], config.providers['kimi-coding'])
	assert.equal(config.providers['easy-cliproxyapi'].models[0].reasoningEfforts, undefined)
})

test('the shipped snapshot covers the current CPA aliases', () => {
	const shipped = createCatalog(Object.entries(JSON.parse(readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor-efforts.json'),
		'utf8',
	))).map(([id, efforts]) => ({ id, efforts })))
	assert.deepEqual(classifyModel('grok-4.7-build-fast', shipped)?.efforts, {
		low: 'low',
		medium: 'medium',
		high: 'high',
		xhigh: 'xhigh',
	})
	assert.deepEqual(classifyModel('gemini-3.8-flash-high', shipped)?.efforts, {
		low: 'low',
		medium: 'medium',
		high: 'high',
	})
	assert.deepEqual(classifyModel('gemini-3.8-flash', shipped)?.efforts, {
		low: 'low',
		medium: 'medium',
		high: 'high',
	})
})
