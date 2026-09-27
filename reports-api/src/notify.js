// 새 제보 관리자 알림. 제보 저장이 끝난 뒤(신규 저장 1회)에만 부른다.
// 알림 실패는 로그만 남기고 삼킨다. 제보 접수 결과에는 영향을 주지 않는다.
// 텔레그램·푸시 같은 채널을 늘릴 때는 notifyNewReport 안에 한 줄씩 더한다.
//
// 설정(없으면 메일을 보내지 않고 건너뛴다):
//   RESEND_API_KEY      시크릿. Resend API 키
//   NOTIFY_EMAIL_TO     받는 관리자 주소(쉼표 구분)
//   NOTIFY_EMAIL_FROM   보내는 주소(도메인 인증 전에는 onboarding@resend.dev)
//   ADMIN_PAGE_URL      메일의 '제보 확인하기' 링크

const RESEND_URL = "https://api.resend.com/emails";
const SUBJECT = "[들뫼 탐조지도] 새 출현종 제보가 접수되었습니다";

// UTC ISO 시각을 'YYYY-MM-DD HH:mm'(한국 시간)으로 바꾼다.
function kst(iso) {
  const t = new Date(Date.parse(iso) + 9 * 3600 * 1000).toISOString();
  return t.slice(0, 10) + " " + t.slice(11, 16);
}

export function emailText(row, env) {
  const lines = [
    "새로운 출현종 제보가 접수되었습니다.",
    "",
    "종명: " + row.species,
    "관찰일: " + row.observed_on,
    "접수일시: " + kst(row.received_at) + " (KST)",
    "위치: " + Number(row.lat).toFixed(5) + ", " + Number(row.lon).toFixed(5),
    "지도: https://map.kakao.com/link/map/" + encodeURIComponent(row.species) + "," + row.lat + "," + row.lon,
  ];
  if (row.bird_count != null) lines.push("개체수: " + row.bird_count);
  lines.push("제보자: " + (row.reporter || "(미입력)"));
  if (row.note) lines.push("설명: " + row.note);
  lines.push("상태: 승인 대기", "접수 번호: " + row.id, "", "관리자 페이지에서 확인해 주세요.");
  if (env.ADMIN_PAGE_URL) lines.push("[제보 확인하기] " + env.ADMIN_PAGE_URL);
  return lines.join("\n");
}

async function sendEmail(row, env) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL_TO || !env.NOTIFY_EMAIL_FROM) {
    console.warn("notify: email skipped (not configured)", row.id);
    return;
  }
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      // Resend 가 같은 키의 재전송을 24시간 동안 한 번으로 묶는다(제보 ID 기준 1회).
      "Idempotency-Key": "new-report/" + row.id,
    },
    body: JSON.stringify({
      from: env.NOTIFY_EMAIL_FROM,
      to: env.NOTIFY_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
      subject: SUBJECT,
      text: emailText(row, env),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("email HTTP " + response.status);
}

export async function notifyNewReport(row, env) {
  try {
    await sendEmail(row, env);
  } catch (error) {
    // 키·본문은 남기지 않는다. 제보 ID 와 원인만 남긴다.
    console.error("notify: email failed", row.id, String(error?.message || error));
  }
}
