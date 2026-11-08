// 관리자 화면: 승인 전 제보는 지도에 공개하지 않는다(PR #78). 대기 공개 버튼·문구가 되살아나지 않게 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PAGE } from '../src/admin-page.js';

test('관리자 화면에 승인 전 공개 버튼과 황색 마커 문구가 없다', () => {
  assert.ok(!ADMIN_PAGE.includes('황색'), '황색 마커 문구 없음');
  assert.ok(!ADMIN_PAGE.includes('data-act="visibility"'), '대기 공개/내리기 버튼 없음');
  assert.ok(!ADMIN_PAGE.includes('pending_public'), '과거 pending_public 값으로 공개 상태를 표시하지 않음');
  assert.ok(!ADMIN_PAGE.includes('승인 전 공개 좌표'), '승인 전 공개 좌표 문구 없음');
});

test('상태 표시는 승인 대기 · 지도 비공개 / 승인 완료 / 반려', () => {
  assert.ok(ADMIN_PAGE.includes("var CARD_STATUS_LABEL={pending:'승인 대기 · 지도 비공개',approved:'승인 완료',rejected:'반려'};"));
  assert.ok(ADMIN_PAGE.includes('<span class="badge \'+esc(r.status)+\'">\'+esc(CARD_STATUS_LABEL[r.status]||r.status)+\'</span>'));
});

test('기존 관리자 작업 버튼은 유지된다', () => {
  for (const act of ['approve', 'reject', 'unpublish', 'link', 'unlink', 'hide', 'site', 'consent'])
    assert.ok(ADMIN_PAGE.includes('data-act="' + act + '"'), act);
});
