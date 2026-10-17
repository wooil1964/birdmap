import { WorkerError } from './shared.js';

// Default closed, including old clients and publication reads. The explicit
// false override is retained for historical security fixtures, never production.
export function assertFieldServiceActive(env, path) {
  if (/^\/field-updates(?:\/|$)/.test(path) && env.FIELD_NEWS_RETIRED !== 'false') {
    throw new WorkerError('FIELD_NEWS_RETIRED', '현장소식 서비스가 종료되었습니다.', 410);
  }
}
