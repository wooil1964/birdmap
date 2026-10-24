import assert from 'node:assert/strict';
import test from 'node:test';
import { auditNamespaces } from '../../vworld-tiles/trial/namespace-audit.mjs';

const TARGET = 'birdmap-vworld-tiles';
const RATE = { type: 'ratelimit', name: 'CLIENT_TILE_LIMITER', namespace_id: '196440' };
const clone = value => structuredClone(value);

// An in-memory GET transport only. Small pages exercise complete pagination;
// the additional deployment reference is deliberately absent from retained IDs.
function fixture({ names = ['existing-a', 'existing-b'], edit = () => {} } = {}) {
  const calls = [], hits = new Map();
  const summary = name => ({ id: name, environments: [{ environment: 'production' }] });
  const success = result => ({ status: 200, success: true, result });
  const page = (items, number, wrap = value => value) => {
    const result = success(wrap(items.slice(number - 1, number)));
    result.info = { page: number, per_page: 1, count: result.result?.items?.length ?? result.result?.deployments?.length ?? result.result.length,
      total_count: items.length, total_pages: Math.ceil(items.length) };
    return result;
  };
  const read = async path => {
    calls.push(path);
    const url = new URL(path, 'https://synthetic.invalid'), route = url.pathname;
    const number = Number(url.searchParams.get('page'));
    const hit = (hits.get(route) ?? 0) + 1; hits.set(route, hit);
    let response;
    if (route === '/workers/workers') response = page(names.map(name => ({ name })), number);
    else if (route === '/workers/scripts') response = success(names.map(id => ({ id })));
    else if (route === '/workers/services') response = page(names.map(summary), number);
    else {
      const pieces = route.split('/').filter(Boolean), name = decodeURIComponent(pieces[2] ?? ''), tail = pieces.slice(3).join('/');
      if (!names.includes(name)) throw new Error('private-account-name-and-token');
      if (pieces[1] === 'workers') {
        if (tail === 'previews') response = page([], number);
        else if (!tail) response = success({ name, id: `private-${name}`, previews_base_config: null });
      } else if (pieces[1] === 'scripts') {
        if (tail === 'settings') response = success({ bindings: [] });
        else if (tail === 'versions') response = page([{ id: 'retained-1' }, { id: 'retained-2' }], number, items => ({ items }));
        else if (tail === 'deployments') response = page([{ id: 'active-deployment', versions: [{ version_id: 'active-extra', percentage: 100 }] },
          { id: 'older-deployment', versions: [{ version_id: 'retained-1', percentage: 100 }] }], number, deployments => ({ deployments }));
        else if (tail.startsWith('versions/')) response = success({ id: tail.slice('versions/'.length), resources: { bindings: [] } });
        else if (tail === 'subdomain') response = success({ previews_enabled: false });
      } else if (pieces[1] === 'services') {
        if (!tail) response = success({ ...summary(name), default_environment: { environment: 'production', script: { id: name } } });
        else if (tail === 'environments/production') response = success({ environment: 'production', script: { id: name } });
        else if (tail === 'environments/production/bindings') response = success([]);
      }
    }
    assert.ok(response, `Unexpected synthetic route: ${route}`);
    const replacement = edit({ path, route, name: decodeURIComponent(route.split('/')[3] ?? ''), number, hit, response, calls });
    return clone(replacement ?? response);
  };
  return { read, calls };
}

test('all inventories, pages, version references and final snapshots are covered without exposing names', async () => {
  const { read, calls } = fixture();
  const result = await auditNamespaces(read);
  assert.equal(result.complete, true); assert.equal(result.noCollision, true);
  assert.equal(result.counts.workers, 2); assert.equal(result.counts.environments, 2);
  assert.equal(result.counts.retainedVersions, 4); assert.equal(result.counts.versionDetails, 6);
  assert.ok(calls.some(path => path.includes('/versions/active-extra')));
  assert.equal(calls.filter(path => path.includes('/versions/active-extra')).length, 2);
  assert.equal(calls.filter(path => path === '/workers/scripts').length, 2);
  assert.ok(calls.some(path => path.includes('/versions?page=2')));
  assert.equal(JSON.stringify(result).includes('existing'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.ok(Object.values(result.coverage).every(Boolean));
});

for (const location of ['settings', 'versions/retained-2', 'versions/active-extra', 'preview-base', 'environment']) {
  test(`namespace collision in ${location} blocks the gate`, async () => {
    const { read } = fixture({ edit: ({ route, response }) => {
      if (location === 'settings' && route.endsWith('/settings')) response.result.bindings = [RATE];
      if (location.startsWith('versions/') && route.endsWith(`/${location}`)) response.result.resources.bindings = [RATE];
      if (location === 'preview-base' && route === '/workers/workers/existing-a') response.result.previews_base_config = { env: { CLIENT_TILE_LIMITER: RATE } };
      if (location === 'environment' && route.endsWith('/bindings')) response.result = [RATE];
    } });
    await assert.rejects(auditNamespaces(read), /^Error: NAMESPACE_AUDIT_COLLISION$/);
  });
}

test('initial gate refuses an already-created target', async () => {
  await assert.rejects(auditNamespaces(fixture({ names: ['existing-a', TARGET] }).read), /NAMESPACE_AUDIT_TARGET_ALREADY_EXISTS$/);
});

test('preactivation gate allows only the exact target in all covered configurations', async () => {
  const { read } = fixture({ names: ['existing-a', TARGET], edit: ({ route, name, response }) => {
    if (name !== TARGET) return;
    if (route.endsWith('/settings')) response.result.bindings = [RATE];
    if (route.includes('/versions/')) response.result.resources.bindings = [RATE];
    if (route.endsWith('/bindings')) response.result = [RATE];
  } });
  assert.equal((await auditNamespaces(read, { mode: 'target-only' })).noCollision, true);
});

test('preactivation gate rejects an existing Worker that shares target namespaces', async () => {
  const { read } = fixture({ names: ['existing-a', TARGET], edit: ({ route, response }) => {
    if (route.endsWith('/existing-a/settings')) response.result.bindings = [RATE];
  } });
  await assert.rejects(auditNamespaces(read, { mode: 'target-only' }), /NAMESPACE_AUDIT_COLLISION$/);
});

test('preactivation gate requires the exact target and disables target Preview URLs', async () => {
  await assert.rejects(auditNamespaces(fixture().read, { mode: 'target-only' }), /NAMESPACE_AUDIT_TARGET_MISSING$/);
  const { read } = fixture({ names: [TARGET], edit: ({ route, response }) => {
    if (route.endsWith('/subdomain')) response.result.previews_enabled = true;
  } });
  await assert.rejects(auditNamespaces(read, { mode: 'target-only' }), /NAMESPACE_AUDIT_TARGET_PREVIEW_ENABLED$/);
});

test('HTTP denial and transport exceptions reveal no source response', async () => {
  const { read } = fixture({ edit: () => ({ status: 403, success: false, result: { token: 'private-credential' } }) });
  await assert.rejects(auditNamespaces(read), /^Error: NAMESPACE_AUDIT_GET_NOT_SUCCESSFUL$/);
  await assert.rejects(auditNamespaces(async () => { throw new Error('private-credential'); }), /^Error: NAMESPACE_AUDIT_GET_FAILED$/);
});

test('missing page, missing pagination and unhandled cursor fail closed', async () => {
  for (const variant of ['missing', 'metadata', 'cursor']) {
    const { read } = fixture({ edit: ({ route, number, response }) => {
      if (route !== '/workers/workers') return;
      if (variant === 'missing' && number === 2) { response.result = []; response.info.count = 0; }
      if (variant === 'metadata') delete response.info;
      if (variant === 'cursor') response.info.cursors = { after: 'private-cursor' };
    } });
    await assert.rejects(auditNamespaces(read), new RegExp(`NAMESPACE_AUDIT_PAGINATION_${variant === 'missing' ? 'INCOMPLETE' : variant === 'metadata' ? 'MISSING' : 'UNHANDLED'}$`));
  }
});

test('inventory omissions and duplicate retained IDs fail closed', async () => {
  const { read } = fixture({ edit: ({ route, response }) => {
    if (route === '/workers/scripts') response.result.pop();
  } });
  await assert.rejects(auditNamespaces(read), /NAMESPACE_AUDIT_INVENTORY_MISMATCH$/);
  const duplicate = fixture({ edit: ({ route, number, response }) => {
    if (route.endsWith('/versions') && number === 2) response.result.items[0].id = 'retained-1';
  } });
  await assert.rejects(auditNamespaces(duplicate.read), /NAMESPACE_AUDIT_PAGINATION_REPEATED$/);
});

test('missing immutable detail or bindings never passes as an empty configuration', async () => {
  for (const variant of ['detail', 'bindings']) {
    const { read } = fixture({ edit: ({ route, response }) => {
      if (route.endsWith('/versions/active-extra')) {
        if (variant === 'detail') response.result.id = 'different-version';
        else delete response.result.resources.bindings;
      }
    } });
    await assert.rejects(auditNamespaces(read), new RegExp(`NAMESPACE_AUDIT_${variant === 'detail' ? 'VERSION_DETAIL_MISMATCH' : 'BINDINGS_MISSING'}$`));
  }
});

test('legacy nonproduction history requires independent coverage proof', async () => {
  const { read } = fixture({ edit: ({ route, response }) => {
    const extra = { environment: 'staging' };
    if (route === '/workers/services') for (const service of response.result) service.environments.push(extra);
    if (route === '/workers/services/existing-a') response.result.environments.push(extra);
  } });
  await assert.rejects(auditNamespaces(read), /NAMESPACE_AUDIT_LEGACY_HISTORY_UNVERIFIED$/);
});

test('separate Preview instances and unknown Preview base shapes cannot be skipped', async () => {
  for (const variant of ['instance', 'base']) {
    const { read } = fixture({ edit: ({ route, response }) => {
      if (variant === 'instance' && route.endsWith('/previews')) {
        response.result = [{ id: 'preview-instance' }];
        response.info = { page: 1, per_page: 1, count: 1, total_count: 1, total_pages: 1 };
      }
      if (variant === 'base' && route === '/workers/workers/existing-a') response.result.previews_base_config = { unknown_bindings: [] };
    } });
    await assert.rejects(auditNamespaces(read), new RegExp(`NAMESPACE_AUDIT_PREVIEW_${variant === 'instance' ? 'DETAIL_UNHANDLED' : 'BASE_UNHANDLED'}$`));
  }
});

test('current settings changing during the stable recheck abort', async () => {
  const { read } = fixture({ edit: ({ route, hit, response }) => {
    if (route.endsWith('/settings') && hit === 2) response.result.bindings = [{ ...RATE, namespace_id: '123456' }];
  } });
  await assert.rejects(auditNamespaces(read), /NAMESPACE_AUDIT_STATE_CHANGED$/);
});

test('a deployment or retained-version set changing during the audit aborts', async () => {
  for (const variant of ['deployment', 'version']) {
    const { read } = fixture({ edit: ({ route, number, hit, response }) => {
      if (number !== 1 || hit !== 3) return;
      if (variant === 'deployment' && route.endsWith('/deployments')) response.result.deployments[0].id = 'new-active';
      if (variant === 'version' && route.endsWith('/versions')) response.result.items[0].id = 'new-retained';
    } });
    await assert.rejects(auditNamespaces(read), /NAMESPACE_AUDIT_STATE_CHANGED$/);
  }
});

test('all errors have fixed codes even for malformed namespace input', async () => {
  const { read } = fixture({ edit: ({ route, response }) => {
    if (route.endsWith('/settings')) response.result.bindings = [{ ...RATE, namespace_id: 'private-namespace' }];
  } });
  await assert.rejects(auditNamespaces(read), /^Error: NAMESPACE_AUDIT_NAMESPACE_MALFORMED$/);
  await assert.rejects(auditNamespaces(null), /^Error: NAMESPACE_AUDIT_INVALID_INPUT$/);
  await assert.rejects(auditNamespaces(fixture().read, { mode: 'unexpected' }), /^Error: NAMESPACE_AUDIT_INVALID_INPUT$/);
});
