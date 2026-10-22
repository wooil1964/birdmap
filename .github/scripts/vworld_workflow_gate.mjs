// Public, GET-only GitHub preflight. No credentials or network activity at import.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY = 'wooil1964/birdmap';
export const BRANCH = 'review/vworld-default-keyless-20261021';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOWS = ['publication-security-ci.yml', 'vworld-worker-trial.yml'];
export const ENVIRONMENTS = Object.freeze({ bootstrap: 'vworld-trial-bootstrap', run: 'vworld-trial-execution', recover: 'vworld-trial-recovery' });
const PHRASES = { bootstrap: 'APPROVE_DISABLED_VWORLD_BOOTSTRAP', run: 'APPROVE_ONE_VWORLD_TRIAL', recover: 'DISABLE_VWORLD_TRIAL' };
const fail = code => { throw new Error('VWORLD_GITHUB_GATE_' + code); };
const ensure = (condition, code) => { if (!condition) fail(code); };

export function validateIdentity(env, headSha, mode, stage = 'approved') {
  ensure(Object.hasOwn(ENVIRONMENTS, mode), 'MODE');
  ensure(['preflight', 'approved'].includes(stage), 'STAGE');
  const sha = env.EXPECTED_SHA || env.APPROVED_SHA;
  ensure(/^[a-f0-9]{40}$/.test(sha ?? ''), 'SHA');
  ensure(env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'EVENT');
  ensure(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REF === 'refs/heads/' + BRANCH, 'REPOSITORY_REF');
  ensure(env.GITHUB_RUN_ATTEMPT === '1' && /^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID ?? ''), 'RUN_ATTEMPT');
  ensure(sha === env.GITHUB_SHA && sha === env.GITHUB_WORKFLOW_SHA && sha === headSha, 'EXACT_SOURCE');
  ensure(WORKFLOWS.some(path => env.GITHUB_WORKFLOW_REF === `${REPOSITORY}/.github/workflows/${path}@refs/heads/${BRANCH}`), 'WORKFLOW_REF');
  ensure(env.APPROVAL_PHRASE === PHRASES[mode] && env.DIRECT_LIVE_CHECK !== 'true', 'EXCLUSIVE_APPROVAL');
  ensure(!env.NODE_OPTIONS && !env.NODE_DEBUG && !env.DEBUG && env.RUNNER_DEBUG !== '1' && env.ACTIONS_STEP_DEBUG !== 'true' && env.ACTIONS_RUNNER_DEBUG !== 'true', 'DEBUG');
  if (stage === 'approved') {
    ensure(env.APPROVED_SHA === sha && env.APPROVED_RUN_ID === env.GITHUB_RUN_ID && env.CF_SCOPE_REVIEWED_SHA === sha, 'PROTECTED_ATTESTATION');
    if (mode === 'bootstrap') ensure(env.CF_CREATE_SCOPE === 'workers-product-admin', 'CREATE_SCOPE');
    else ensure(env.CF_EDIT_SCOPE === 'individual-worker-editor' && env.CF_EDIT_WORKER === 'birdmap-vworld-tiles', 'EDIT_SCOPE');
    if (mode !== 'recover') ensure(env.CF_READ_SCOPE === 'workers-product-content-read-only', 'READ_SCOPE');
    if (mode === 'run') ensure(/^[1-9][0-9]{0,19}$/.test(env.APPROVED_BOOTSTRAP_RUN_ID ?? '') && env.APPROVED_BOOTSTRAP_RUN_ID !== env.GITHUB_RUN_ID, 'BOOTSTRAP_RUN');
  }
  return { sha, runId: env.GITHUB_RUN_ID, mode, stage, environment: ENVIRONMENTS[mode] };
}

export function validateEnvironment(environment, policies, expectedName) {
  ensure(environment?.name === expectedName && Number.isSafeInteger(environment.id) && environment.id > 0, 'ENVIRONMENT');
  // Absence is not false: older/incomplete API representations must block.
  ensure(environment.can_admins_bypass === false, 'ADMIN_BYPASS');
  const rules = environment.protection_rules;
  ensure(Array.isArray(rules), 'PROTECTION_RULES');
  const required = rules.filter(rule => rule.type === 'required_reviewers');
  ensure(required.length === 1 && required[0].prevent_self_review === true, 'SELF_REVIEW');
  const reviewers = required[0].reviewers;
  // Team membership would require additional authority; this path accepts direct users only.
  ensure(Array.isArray(reviewers) && reviewers.length > 0 && reviewers.every(item => item.type === 'User' && Number.isSafeInteger(item.reviewer?.id) && item.reviewer.id > 0), 'DIRECT_REVIEWERS');
  ensure(environment.deployment_branch_policy?.custom_branch_policies === true && environment.deployment_branch_policy.protected_branches === false, 'BRANCH_RESTRICTION');
  ensure(policies?.total_count === 1 && Array.isArray(policies.branch_policies) && policies.branch_policies.length === 1 && policies.branch_policies[0].name === BRANCH && policies.branch_policies[0].type === 'branch', 'EXACT_BRANCH_POLICY');
  return new Set(reviewers.map(item => item.reviewer.id));
}

export function validatePullRequest(pr, sha) {
  ensure(pr?.number === 40 && pr.state === 'open' && pr.draft === true && pr.merged === false && pr.head?.sha === sha && pr.head.ref === BRANCH && pr.head.repo?.full_name === REPOSITORY && pr.base?.ref === 'main' && pr.base.repo?.full_name === REPOSITORY, 'DRAFT_PR_HEAD');
}

export function validateCI(result, sha) {
  ensure(Array.isArray(result?.workflow_runs) && result.workflow_runs.length > 0 && result.total_count === result.workflow_runs.length && result.total_count <= 100, 'CI_COVERAGE');
  const runs = result.workflow_runs;
  ensure(runs.every(run => run.head_sha === sha && run.event === 'pull_request' && run.path?.split('@')[0] === '.github/workflows/publication-security-ci.yml' && Number.isSafeInteger(run.id)), 'CI_IDENTITY');
  const latest = [...runs].sort((a, b) => b.id - a.id)[0];
  ensure(latest.status === 'completed' && latest.conclusion === 'success', 'LATEST_CI');
}

export function validateRun(run, context, env) {
  ensure(String(run?.id) === context.runId && run.run_attempt === 1 && run.event === 'workflow_dispatch' && run.head_sha === context.sha && run.head_branch === BRANCH && run.repository?.full_name === REPOSITORY && WORKFLOWS.some(name => run.path?.split('@')[0] === '.github/workflows/' + name), 'LIVE_RUN');
  ensure(run.status === 'in_progress' && run.actor?.login === env.GITHUB_ACTOR && run.triggering_actor?.login === env.GITHUB_TRIGGERING_ACTOR, 'LIVE_RUN_ACTOR');
}

export function validateApproval(approvals, environment, reviewers, context, env) {
  ensure(Array.isArray(approvals), 'APPROVAL_HISTORY');
  const relevant = approvals.filter(approval => Array.isArray(approval.environments) && approval.environments.some(item => item.id === environment.id && item.name === environment.name));
  ensure(relevant.length > 0 && relevant.every(approval => approval.state === 'approved'), 'APPROVAL_DECISION');
  const comment = `APPROVE_VWORLD_${context.mode.toUpperCase()} ${context.sha} ${context.runId}`;
  ensure(relevant.some(approval => approval.comment === comment && reviewers.has(approval.user?.id) && typeof approval.user.login === 'string' && approval.user.login.toLowerCase() !== String(env.GITHUB_ACTOR).toLowerCase() && approval.user.login.toLowerCase() !== String(env.GITHUB_TRIGGERING_ACTOR).toLowerCase()), 'INDEPENDENT_EXACT_APPROVAL');
}

async function publicGet(path, fetchImpl) {
  try {
    const response = await fetchImpl('https://api.github.com/repos/' + REPOSITORY + path, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'birdmap-vworld-trial-preflight' }
    });
    ensure(response.status === 200 && !response.headers.get('link')?.includes('rel="next"'), 'PUBLIC_READ');
    const body = await response.text();
    ensure(body.length <= 1048576, 'PUBLIC_READ_LIMIT');
    return JSON.parse(body);
  } catch { fail('PUBLIC_READ_UNAVAILABLE'); }
}

// Solo-local-v1 reuses only the source checks: exact Draft PR head and its latest full CI.
// It never evaluates or substitutes for the independent environment approval above.
export async function validateSourceCI(sha, fetchImpl = fetch) {
  ensure(/^[a-f0-9]{40}$/.test(sha ?? ''), 'SHA');
  validatePullRequest(await publicGet('/pulls/40', fetchImpl), sha);
  validateCI(await publicGet('/actions/workflows/publication-security-ci.yml/runs?head_sha=' + sha + '&event=pull_request&per_page=100&page=1', fetchImpl), sha);
}

export async function validateWorkflowContext(env, { stage = 'approved', mode = env.TRIAL_MODE, fetchImpl = fetch, headSha } = {}) {
  if (headSha === undefined) {
    try {
      const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      headSha = git(['rev-parse', 'HEAD']);
      ensure(git(['status', '--porcelain', '--untracked-files=no']) === '', 'CLEAN_SOURCE');
    } catch { fail('LOCAL_SOURCE'); }
  }
  const context = validateIdentity(env, headSha, mode, stage);
  const base = '/environments/' + context.environment;
  const environment = await publicGet(base, fetchImpl);
  const policies = await publicGet(base + '/deployment-branch-policies?per_page=100&page=1', fetchImpl);
  const reviewers = validateEnvironment(environment, policies, context.environment);
  validatePullRequest(await publicGet('/pulls/40', fetchImpl), context.sha);
  validateCI(await publicGet('/actions/workflows/publication-security-ci.yml/runs?head_sha=' + context.sha + '&event=pull_request&per_page=100&page=1', fetchImpl), context.sha);
  validateRun(await publicGet('/actions/runs/' + context.runId, fetchImpl), context, env);
  if (stage === 'approved') validateApproval(await publicGet('/actions/runs/' + context.runId + '/approvals', fetchImpl), environment, reviewers, context, env);
  return { ok: true, stage, mode };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateWorkflowContext(process.env, { stage: process.argv[2], mode: process.env.TRIAL_MODE })
    .then(() => process.stdout.write('{"event":"github-trial-gate-ok"}\n'))
    .catch(() => { process.stderr.write('{"event":"github-trial-gate-blocked-details-suppressed"}\n'); process.exitCode = 1; });
}
