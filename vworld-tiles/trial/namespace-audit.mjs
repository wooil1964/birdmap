// GET-only account-wide gate. The caller owns authentication and transport;
// importing this module cannot read credentials, contact an API, or print data.
const TARGET = 'birdmap-vworld-tiles';
const NAMESPACES = new Set(['196440', '196441']);
const encode = encodeURIComponent;
const json = value => JSON.stringify(value);
const sorted = values => [...values].sort();
const sameSet = (a, b) => a.size === b.size && [...a].every(value => b.has(value));
const fail = code => { throw new Error(`NAMESPACE_AUDIT_${code}`); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * read receives a GET-only path relative to /accounts/{the approved account}.
 * It returns { status, success, result, info } with info = API result_info.
 * No response bodies, names, account IDs, paths or credentials leave this gate.
 * initial: the exact new target must be absent. target-only: it must exist and
 * only that script's current/retained versions may own the two namespaces.
 * Separate previews and legacy histories lacking independent version coverage
 * fail closed; their current bindings alone cannot establish full history.
 */
export async function auditNamespaces(read, options = {}) {
  if (!record(options)) fail('INVALID_INPUT');
  const { mode = 'initial' } = options;
  if (typeof read !== 'function' || !['initial', 'target-only'].includes(mode)) fail('INVALID_INPUT');
  const counts = { getRequests: 0, workers: 0, services: 0, environments: 0,
    currentSettings: 0, retainedVersions: 0, versionDetails: 0,
    deploymentReferences: 0, previewBases: 0 };

  async function get(path) {
    let response;
    try { response = await read(path); } catch { fail('GET_FAILED'); }
    counts.getRequests++;
    if (!record(response) || response.status !== 200 || response.success !== true) fail('GET_NOT_SUCCESSFUL');
    return response;
  }

  async function list(path, select = value => value) {
    const all = [], seenPages = new Set();
    let expectedTotal, expectedPerPage;
    for (let page = 1; page <= 10000; page++) {
      const response = await get(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`);
      const items = select(response.result), info = response.info;
      if (!Array.isArray(items) || !record(info)) fail('PAGINATION_MISSING');
      if (info.cursors?.after || info.cursor || info.next_cursor || info.next_page || info.has_more) fail('PAGINATION_UNHANDLED');
      const total = info.total_count, per = info.per_page;
      if (!Number.isInteger(total) || total < 0 || !Number.isInteger(per) || per < 1 ||
          info.page !== page || info.count !== items.length || items.length > per) fail('PAGINATION_INVALID');
      if (expectedTotal !== undefined && (total !== expectedTotal || per !== expectedPerPage)) fail('PAGINATION_CHANGED');
      expectedTotal = total; expectedPerPage = per;
      const pages = Math.ceil(total / per);
      if (info.total_pages !== undefined && info.total_pages !== pages && !(total === 0 && info.total_pages === 1)) fail('PAGINATION_INVALID');
      const pageKey = json(items);
      if (items.length && seenPages.has(pageKey)) fail('PAGINATION_REPEATED');
      seenPages.add(pageKey); all.push(...items);
      if (all.length === total && page >= pages) return all;
      if (all.length > total || items.length === 0 || page >= pages) fail('PAGINATION_INCOMPLETE');
    }
    fail('PAGINATION_LIMIT');
  }

  function ids(items, key) {
    if (!Array.isArray(items)) fail('INVENTORY_MALFORMED');
    const values = new Set();
    for (const item of items) {
      if (!record(item) || typeof item[key] !== 'string' || !item[key] || values.has(item[key])) fail('INVENTORY_MALFORMED');
      values.add(item[key]);
    }
    return values;
  }

  function rateBindings(bindings, owner, { map = false } = {}) {
    if (map) {
      if (!record(bindings)) fail('BINDINGS_MALFORMED');
      bindings = Object.entries(bindings).map(([name, value]) => {
        if (!record(value) || (value.name !== undefined && value.name !== name)) fail('BINDINGS_MALFORMED');
        return { ...value, name };
      });
    }
    if (!Array.isArray(bindings)) fail('BINDINGS_MISSING');
    const rate = [], names = new Set();
    for (const binding of bindings) {
      if (!record(binding) || typeof binding.type !== 'string' || !binding.type) fail('BINDINGS_MALFORMED');
      const type = binding.type.toLowerCase().replace(/[^a-z]/g, '');
      if (!['ratelimit', 'unsaferatelimit'].includes(type)) continue;
      if (typeof binding.name !== 'string' || !binding.name || names.has(binding.name)) fail('BINDINGS_MALFORMED');
      names.add(binding.name);
      const value = binding.namespace_id ?? binding.namespace;
      if (!(typeof value === 'string' || Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) fail('NAMESPACE_MALFORMED');
      const namespace = String(BigInt(value));
      if (binding.namespace_id !== undefined && binding.namespace !== undefined && String(binding.namespace_id) !== String(binding.namespace)) fail('NAMESPACE_MALFORMED');
      if (NAMESPACES.has(namespace) && !(mode === 'target-only' && owner === TARGET)) fail('COLLISION');
      rate.push({ type, name: binding.name, namespace });
    }
    return rate.sort((a, b) => json(a).localeCompare(json(b)));
  }

  async function inventories() {
    const modern = await list('/workers/workers');
    // The legacy scripts inventory is an unpaginated API. If its API contract
    // starts returning pagination, require support before considering it whole.
    const scripts = await get('/workers/scripts');
    if (!Array.isArray(scripts.result) || scripts.info !== undefined && scripts.info !== null) fail('SCRIPT_INVENTORY_UNHANDLED');
    const services = await list('/workers/services');
    const workerIds = ids(modern, 'name'), scriptIds = ids(scripts.result, 'id'), serviceIds = ids(services, 'id');
    if (!sameSet(workerIds, scriptIds) || !sameSet(workerIds, serviceIds)) fail('INVENTORY_MISMATCH');
    if (mode === 'initial' && workerIds.has(TARGET)) fail('TARGET_ALREADY_EXISTS');
    if (mode === 'target-only' && !workerIds.has(TARGET)) fail('TARGET_MISSING');
    return { modern, services, workerIds, scriptIds, serviceIds };
  }

  async function workerSnapshot(name, first) {
    const scriptPath = `/workers/scripts/${encode(name)}`, workerPath = `/workers/workers/${encode(name)}`;
    const settings = await get(`${scriptPath}/settings`);
    const rate = rateBindings(settings.result?.bindings, name);
    const versions = await list(`${scriptPath}/versions`, value => value?.items);
    const versionIds = ids(versions, 'id');
    const deployments = await list(`${scriptPath}/deployments`, value => value?.deployments);
    ids(deployments, 'id');
    if (!deployments.length) fail('ACTIVE_DEPLOYMENT_MISSING');
    const references = new Set();
    const deploymentState = deployments.map(deployment => {
      if (!Array.isArray(deployment.versions) || !deployment.versions.length) fail('DEPLOYMENT_MALFORMED');
      const deploymentIds = new Set();
      const refs = deployment.versions.map(version => {
        if (!record(version) || typeof version.version_id !== 'string' || !version.version_id || deploymentIds.has(version.version_id)) fail('DEPLOYMENT_MALFORMED');
        deploymentIds.add(version.version_id); references.add(version.version_id);
        if (version.percentage !== undefined && (!Number.isFinite(version.percentage) || version.percentage < 0 || version.percentage > 100)) fail('DEPLOYMENT_MALFORMED');
        return { id: version.version_id, percentage: version.percentage ?? null };
      });
      return { id: deployment.id, versions: refs.sort((a, b) => a.id.localeCompare(b.id)) };
    });
    const previews = await list(`${workerPath}/previews`);
    ids(previews, 'id');
    if (previews.length) fail('PREVIEW_DETAIL_UNHANDLED');
    const metadata = await get(workerPath);
    if (metadata.result?.name !== name || typeof metadata.result?.id !== 'string' || !metadata.result.id) fail('WORKER_METADATA_MALFORMED');
    const base = metadata.result.previews_base_config, previewRates = [];
    if (base !== undefined && base !== null) {
      if (!record(base)) fail('PREVIEW_BASE_MALFORMED');
      if (base.env !== undefined) previewRates.push(rateBindings(base.env, name, { map: true }));
      if (base.bindings !== undefined) previewRates.push(rateBindings(base.bindings, name));
      if (!previewRates.length && Object.keys(base).length) fail('PREVIEW_BASE_UNHANDLED');
      if (first) counts.previewBases++;
    }
    const subdomain = await get(`${scriptPath}/subdomain`);
    if (typeof subdomain.result?.previews_enabled !== 'boolean') fail('PREVIEW_STATUS_MISSING');
    if (name === TARGET && subdomain.result.previews_enabled) fail('TARGET_PREVIEW_ENABLED');
    if (first) {
      counts.currentSettings++; counts.retainedVersions += versionIds.size;
      counts.deploymentReferences += references.size;
      // Retained versions and every deployment reference are immutable detail
      // records; inspect each once, and reread mutable references below.
      for (const id of new Set([...versionIds, ...references])) {
        const detail = await get(`${scriptPath}/versions/${encode(id)}`);
        if (detail.result?.id !== id) fail('VERSION_DETAIL_MISMATCH');
        rateBindings(detail.result?.resources?.bindings, name); counts.versionDetails++;
      }
    }
    return { rate, fingerprint: json({ rate, versions: sorted(versionIds), deployments: deploymentState,
      metadataId: metadata.result.id, previewRates, previewsEnabled: subdomain.result.previews_enabled }) };
  }

  async function serviceSnapshot(service, inventory, currentRates, first) {
    const servicePath = `/workers/services/${encode(service.id)}`;
    const response = await get(servicePath), detail = response.result;
    if (!record(detail) || detail.id !== service.id || !Array.isArray(detail.environments)) fail('ENVIRONMENT_INVENTORY_MALFORMED');
    const environments = ids(detail.environments, 'environment');
    if (!sameSet(environments, ids(service.environments, 'environment'))) fail('ENVIRONMENT_INVENTORY_MISMATCH');
    const defaults = detail.default_environment;
    // Legacy nonproduction environments may have hidden version history behind
    // the services API. Current bindings cannot prove those histories clean.
    if (environments.size !== 1 || !environments.has('production') || defaults?.environment !== 'production' ||
        !inventory.scriptIds.has(defaults?.script?.id)) fail('LEGACY_HISTORY_UNVERIFIED');
    if (defaults.script.id !== service.id) fail('ENVIRONMENT_SCRIPT_UNCOVERED');
    const states = [];
    for (const environment of detail.environments) {
      const environmentPath = `${servicePath}/environments/${encode(environment.environment)}`;
      const metadata = await get(environmentPath), binding = await get(`${environmentPath}/bindings`);
      const scriptId = metadata.result?.script?.id;
      if (metadata.result?.environment !== environment.environment || !inventory.scriptIds.has(scriptId) || scriptId !== defaults.script.id) fail('ENVIRONMENT_SCRIPT_UNCOVERED');
      const rate = rateBindings(binding.result, scriptId);
      if (json(currentRates.get(scriptId)) !== json(rate)) fail('ENVIRONMENT_BINDINGS_MISMATCH');
      if (first) counts.environments++;
      states.push({ environment: environment.environment, scriptId, rate });
    }
    return json(states.sort((a, b) => a.environment.localeCompare(b.environment)));
  }

  const initial = await inventories();
  counts.workers = initial.workerIds.size; counts.services = initial.serviceIds.size;
  const workers = new Map(), rates = new Map(), services = new Map();
  for (const name of initial.workerIds) {
    const snapshot = await workerSnapshot(name, true); workers.set(name, snapshot); rates.set(name, snapshot.rate);
  }
  for (const service of initial.services) services.set(service.id, await serviceSnapshot(service, initial, rates, true));
  const final = await inventories();
  if (!sameSet(initial.workerIds, final.workerIds) || !sameSet(initial.serviceIds, final.serviceIds)) fail('STATE_CHANGED');
  for (const name of final.workerIds) {
    const snapshot = await workerSnapshot(name, false);
    if (snapshot.fingerprint !== workers.get(name)?.fingerprint) fail('STATE_CHANGED');
  }
  for (const service of final.services) {
    if (await serviceSnapshot(service, final, rates, false) !== services.get(service.id)) fail('STATE_CHANGED');
  }
  return { complete: true, noCollision: true, mode, counts,
    coverage: { inventories: true, currentSettings: true, retainedAndDeploymentVersions: true,
      legacyEnvironmentScope: true, previewScope: true, stableRecheck: true } };
}
