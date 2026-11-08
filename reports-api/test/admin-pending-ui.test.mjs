// 관리자 화면: 예전 '황색 마커' 수동 공개는 없다. 대기 제보 공개는 서버 자동 판정(미검증)뿐이고,
// 관리자는 미검증 공개를 '공개 중지'(public=0)만 할 수 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PAGE } from '../src/admin-page.js';

test('관리자 화면에 수동 대기 공개 버튼과 황색 마커 문구가 없다', () => {
  assert.ok(!ADMIN_PAGE.includes('황색'), '황색 마커 문구 없음');
  assert.ok(!ADMIN_PAGE.includes('data-public="1"'), '대기 제보를 수동으로 공개하는 버튼 없음');
  assert.ok(!ADMIN_PAGE.includes('pending_public'), '과거 pending_public 값으로 공개 상태를 표시하지 않음');
  assert.ok(!ADMIN_PAGE.includes('승인 전 공개 좌표'), '승인 전 공개 좌표 문구 없음');
  assert.ok(ADMIN_PAGE.includes("if(act==='visibility')payload.public=false;"), '공개 중지는 public=false 만 보낸다');
});

test('표시 상태는 서버 display_state 기준, 실제 상태값은 badge class 로만 쓴다', () => {
  for (const label of ['자동 공개 · 미검증', '자동 공개 중지(재검사 불통과)', '검토 대기 · 비공개', '공개 취소', '확인 완료', '반려 · 비공개'])
    assert.ok(ADMIN_PAGE.includes(label), label);
  assert.ok(ADMIN_PAGE.includes('<span class="badge \'+esc(r.status)+\'">\'+esc(DISPLAY_LABEL[r.display_state||r.status]||r.status)+\'</span>'));
  assert.ok(ADMIN_PAGE.includes('data-status="unverified"'), '미검증 탭');
});

test('반려는 사유 코드를 고르게 하고, 기존 관리자 작업 버튼은 유지된다', () => {
  for (const code of ['misidentification', 'location_error', 'duplicate', 'inappropriate', 'sensitive_location', 'other'])
    assert.ok(ADMIN_PAGE.includes("'" + code + "'"), code);
  assert.ok(ADMIN_PAGE.includes("if(!payload.reasonCode){toast('반려 사유를 선택해 주세요.',false);return;}"));
  for (const act of ['approve', 'reject', 'unpublish', 'link', 'unlink', 'hide', 'site', 'consent'])
    assert.ok(ADMIN_PAGE.includes('data-act="' + act + '"'), act);
});
