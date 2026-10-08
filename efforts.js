/**
 * Map a CPA model id onto the original vendor's thinking levels.
 *
 * The Harness catalog merge keys off provider id, so a custom route such as
 * `easy-cliproxyapi` never inherits `xai` / `google`. This module does not
 * borrow that catalog. It matches the CPA model id against a snapshot of the
 * original vendor's non-null levels, and only the caller decides which
 * provider ids are eligible.
 */

const EFFORT_ORDER = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/**
 * @param {Record<string, string>} efforts
 * @returns {Record<string, string>}
 */
export function orderEfforts(efforts) {
	const ordered = {}
	for (const level of EFFORT_ORDER) {
		const wire = efforts?.[level]
		if (typeof wire === 'string' && wire.length > 0) ordered[level] = wire
	}
	return ordered
}

/**
 * @param {ReadonlyArray<{ id: string, efforts: Record<string, string> }>} rows
 */
export function createCatalog(rows) {
	const exact = new Map()
	for (const row of rows) {
		if (typeof row?.id !== 'string' || row.id.length === 0) continue
		const efforts = orderEfforts(row.efforts)
		if (Object.keys(efforts).length === 0) continue
		exact.set(row.id, efforts)
	}
	const prefixes = [...exact.keys()].sort((left, right) => right.length - left.length || left.localeCompare(right))
	return { exact, prefixes }
}

/**
 * @param {string} modelId
 * @param {{ exact: Map<string, Record<string, string>>, prefixes: readonly string[] }} catalog
 * @returns {{ kind: 'efforts', efforts: Record<string, string>, canonical: string } | null}
 */
export function classifyModel(modelId, catalog) {
	if (typeof modelId !== 'string' || modelId.length === 0) return null
	const exact = catalog.exact.get(modelId)
	if (exact !== undefined) return { kind: 'efforts', efforts: exact, canonical: modelId }
	let canonical = null
	for (const id of catalog.prefixes) {
		if (modelId.startsWith(`${id}-`)) {
			canonical = id
			break
		}
	}
	if (canonical === null) return null
	const efforts = catalog.exact.get(canonical)
	return efforts === undefined ? null : { kind: 'efforts', efforts, canonical }
}

/**
 * Add `reasoningEfforts` to models of the named providers when the original
 * vendor publishes selectable levels. Existing declarations, including
 * `false`, are left alone. Fixed-effort aliases are left undeclared so the
 * dialog does not offer a second selector.
 *
 * @param {Record<string, unknown>} config raw llm-pi-ai config
 * @param {readonly string[]} providerIds
 * @param {{ exact: Map<string, Record<string, string>>, prefixes: readonly string[] }} catalog
 * @returns {{ config: Record<string, unknown>, changes: string[] }}
 */
export function annotateConfig(config, providerIds, catalog) {
	const changes = []
	const providers = config?.providers
	if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) {
		return { config, changes }
	}
	const nextProviders = { ...providers }
	let touched = false
	for (const providerId of providerIds) {
		if (typeof providerId !== 'string' || providerId.length === 0) continue
		const provider = providers[providerId]
		if (provider === null || typeof provider !== 'object' || Array.isArray(provider)) continue
		const models = provider.models
		if (!Array.isArray(models)) continue
		let providerTouched = false
		const nextModels = models.map((model) => {
			if (model === null || typeof model !== 'object' || Array.isArray(model)) return model
			if (!Object.hasOwn(model, 'id') || typeof model.id !== 'string') return model
			if (Object.hasOwn(model, 'reasoningEfforts')) return model
			const decision = classifyModel(model.id, catalog)
			if (decision === null || decision.kind !== 'efforts') return model
			providerTouched = true
			changes.push(`${providerId}/${model.id}`)
			return { ...model, reasoningEfforts: { ...decision.efforts } }
		})
		if (!providerTouched) continue
		touched = true
		nextProviders[providerId] = { ...provider, models: nextModels }
	}
	if (!touched) return { config, changes }
	return { config: { ...config, providers: nextProviders }, changes }
}
