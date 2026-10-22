import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateIdentity, validateEnvironment, validatePullRequest, validateCI, validateRun, validateApproval, validateWorkflowContext, REPOSITORY, BRANCH, ENVIRONMENTS } from './vworld_workflow_gate.mjs';

const SHA = 'a'.repeat(40);
const env = () => ({ EXPECTED_SHA: SHA, APPROVED_SHA: SHA, APPROVED_RUN_ID: '500', APPROVED_BOOTSTRAP_RUN_ID: '400', CF_SCOPE_REVIEWED_SHA: SHA, CF_CREATE_SCOPE: 'workers-product-admin', CF_EDIT_SCOPE: 'individual-worker-editor', CF_EDIT_WORKER: 'birdmap-vworld-tiles', CF_READ_SCOPE: 'workers-product-content-read-only', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/' + BRANCH, GITHUB_SHA: SHA, GITHUB_WORKFLOW_SHA: SHA, GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/publication-security-ci.yml@refs/heads/${BRANCH}`, GITHUB_RUN_ID: '500', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'operator', GITHUB_TRIGGERING_ACTOR: 'operator', APPROVAL_PHRASE: 'APPROVE_ONE_VWORLD_TRIAL', DIRECT_LIVE_CHECK: 'false', TRIAL_MODE: 'run' });
const environment = () => ({ name: ENVIRONMENTS.run, id: 10, can_admins_bypass: false, protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { id: 20 } }] }], deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
const policies = () => ({ total_count: 1, branch_policies: [{ id: 30, name: BRANCH, type: 'branch' }] });
const pr = () => ({ number: 40, state: 'open', draft: true, merged: false, head: { sha: SHA, ref: BRANCH, repo: { full_name: REPOSITORY } }, base: { ref: 'main', repo: { full_name: REPOSITORY } } });
const ci = () => ({ total_count: 1, workflow_runs: [{ id: 100, head_sha: SHA, event: 'pull_request', path: '.github/workflows/publication-security-ci.yml', status: 'completed', conclusion: 'success' }] });
const run = () => ({ id: 500, run_attempt: 1, event: 'workflow_dispatch', head_sha: SHA, head_branch: BRANCH, repository: { full_name: REPOSITORY }, path: '.github/workflows/publication-security-ci.yml', status: 'in_progress', actor: { login: 'operator' }, triggering_actor: { login: 'operator' } });
const approvals = () => [{ state: 'approved', comment: `APPROVE_VWORLD_RUN ${SHA} 500`, environments: [{ id: 10, name: ENVIRONMENTS.run }], user: { id: 20, login: 'independent-reviewer' } }];
const context = () => validateIdentity(env(), SHA, 'run');

test('VWorld workflow accepts only exact source and single approved run', () => {
  assert.equal(context().environment, ENVIRONMENTS.run);
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_EVENT_NAME: 'pull_request', GITHUB_REPOSITORY: 'other/repo', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'b'.repeat(40), GITHUB_WORKFLOW_SHA: 'b'.repeat(40), GITHUB_WORKFLOW_REF: `${REPOSITORY}/.github/workflows/other.yml@refs/heads/${BRANCH}`, APPROVED_RUN_ID: '501', CF_SCOPE_REVIEWED_SHA: 'b'.repeat(40), APPROVAL_PHRASE: '', DIRECT_LIVE_CHECK: 'true', RUNNER_DEBUG: '1', NODE_OPTIONS: '--inspect', CF_READ_SCOPE: 'individual-worker-read', APPROVED_BOOTSTRAP_RUN_ID: '500' })) {
    assert.throws(() => validateIdentity({ ...env(), [key]: value }, SHA, 'run'), key);
  }
  assert.throws(() => validateIdentity(env(), 'b'.repeat(40), 'run'));
  assert.throws(() => validateIdentity(env(), SHA, 'none'));
  for (const mode of ['bootstrap', 'recover']) {
    const item = env(); item.APPROVAL_PHRASE = mode === 'bootstrap' ? 'APPROVE_DISABLED_VWORLD_BOOTSTRAP' : 'DISABLE_VWORLD_TRIAL';
    assert.equal(validateIdentity(item, SHA, mode).mode, mode);
  }
});

test('VWorld environment requires explicit independent protection and one exact branch', () => {
  assert.deepEqual([...validateEnvironment(environment(), policies(), ENVIRONMENTS.run)], [20]);
  for (const mutate of [e => delete e.can_admins_bypass, e => e.can_admins_bypass = true, e => e.protection_rules = [], e => e.protection_rules[0].prevent_self_review = false, e => e.protection_rules[0].reviewers = [], e => e.protection_rules[0].reviewers[0].type = 'Team', e => e.deployment_branch_policy.custom_branch_policies = false]) {
    const item = environment(); mutate(item); assert.throws(() => validateEnvironment(item, policies(), ENVIRONMENTS.run));
  }
  for (const mutate of [p => p.total_count = 2, p => p.branch_policies[0].name = 'review/*', p => p.branch_policies[0].type = 'tag', p => delete p.branch_policies[0].type]) {
    const item = policies(); mutate(item); assert.throws(() => validateEnvironment(environment(), item, ENVIRONMENTS.run));
  }
});

test('VWorld requires current Draft PR and latest successful exact-SHA regression', () => {
  validatePullRequest(pr(), SHA); validateCI(ci(), SHA); validateRun(run(), context(), env());
  for (const mutate of [p => p.draft = false, p => p.merged = true, p => p.head.sha = 'b'.repeat(40), p => p.head.repo.full_name = 'fork/birdmap']) {
    const item = pr(); mutate(item); assert.throws(() => validatePullRequest(item, SHA));
  }
  const failed = ci(); failed.workflow_runs.push({ ...failed.workflow_runs[0], id: 101, conclusion: 'failure' }); failed.total_count = 2;
  assert.throws(() => validateCI(failed, SHA));
  const missing = ci(); missing.total_count = 101; assert.throws(() => validateCI(missing, SHA));
  const rerun = run(); rerun.run_attempt = 2; assert.throws(() => validateRun(rerun, context(), env()));
});

test('VWorld approval binds independent configured user, environment, SHA, mode and run', () => {
  validateApproval(approvals(), environment(), new Set([20]), context(), env());
  for (const mutate of [a => a[0].comment = `APPROVE_VWORLD_RUN ${SHA} 499`, a => a[0].user.login = 'operator', a => a[0].user.id = 21, a => a[0].environments[0].id = 11, a => a[0].state = 'rejected', a => a[0].comment = `APPROVE_VWORLD_BOOTSTRAP ${SHA} 500`]) {
    const item = approvals(); mutate(item); assert.throws(() => validateApproval(item, environment(), new Set([20]), context(), env()));
  }
  assert.throws(() => validateApproval([...approvals(), { ...approvals()[0], state: 'rejected' }], environment(), new Set([20]), context(), env()));
});

test('VWorld public preflight is GET-only, unauthenticated and fail closed without response disclosure', async () => {
  const routes = new Map([
    ['/environments/' + ENVIRONMENTS.run, environment()],
    ['/environments/' + ENVIRONMENTS.run + '/deployment-branch-policies?per_page=100&page=1', policies()],
    ['/pulls/40', pr()],
    ['/actions/workflows/publication-security-ci.yml/runs?head_sha=' + SHA + '&event=pull_request&per_page=100&page=1', ci()],
    ['/actions/runs/500', run()], ['/actions/runs/500/approvals', approvals()]
  ]);
  const calls = [];
  const fake = async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(Object.keys(options.headers).some(key => key.toLowerCase() === 'authorization'), false);
    const base = `https://api.github.com/repos/${REPOSITORY}`; assert.equal(url.startsWith(base), true);
    const path = url.slice(base.length); calls.push(path);
    assert.equal(routes.has(path), true);
    return new Response(JSON.stringify(routes.get(path)), { status: 200 });
  };
  assert.deepEqual(await validateWorkflowContext(env(), { mode: 'run', fetchImpl: fake, headSha: SHA }), { ok: true, stage: 'approved', mode: 'run' });
  assert.equal(calls.length, 6);
  calls.length = 0;
  await validateWorkflowContext(env(), { stage: 'preflight', mode: 'run', fetchImpl: fake, headSha: SHA });
  assert.equal(calls.length, 5);
  await assert.rejects(validateWorkflowContext(env(), { mode: 'run', headSha: SHA, fetchImpl: async () => new Response('PRIVATE_ACCOUNT_OR_SECRET', { status: 403 }) }), error => !error.message.includes('PRIVATE') && /PUBLIC_READ_UNAVAILABLE/.test(error.message));
  await assert.rejects(validateWorkflowContext(env(), { mode: 'run', headSha: SHA, fetchImpl: async () => new Response('{}', { status: 200, headers: { link: '<next>; rel="next"' } }) }));
  let absentReads = 0;
  await assert.rejects(validateWorkflowContext(env(), { stage: 'preflight', mode: 'run', headSha: SHA, fetchImpl: async () => { absentReads++; return new Response('{}', { status: 404 }); } }));
  assert.equal(absentReads, 1, 'missing protected environment stops before the protected job can be referenced');
});

test('VWorld workflow declarations isolate secrets, reuse registered caller and preserve cleanup', () => {
  const workflow = readFileSync(new URL('../workflows/vworld-worker-trial.yml', import.meta.url), 'utf8');
  const launcher = readFileSync(new URL('../workflows/publication-security-ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_call:/); assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /if: \$\{\{ always\(\)/); assert.match(workflow, /bootstrap-recover/);
  assert.match(workflow, /persist-credentials: false/); assert.doesNotMatch(workflow, /secrets: inherit|upload-artifact|wrangler-action|pull_request_target/);
  for (const line of workflow.split('\n').filter(line => /uses: actions\//.test(line))) assert.match(line, /@[a-f0-9]{40}/);
  assert.match(launcher, /uses: \.\/\.github\/workflows\/vworld-worker-trial\.yml/);
  assert.match(launcher, /publication-vworld-trial-launcher/);
  assert.doesNotMatch(launcher, /secrets: inherit/);
});
