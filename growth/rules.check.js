// 성장패스 규칙 자체 점검: node growth/rules.check.js (배포 제외 — firebase.json ignore)
const assert = require('assert');
const R = require('./rules.js');

const now = new Date(2026, 8, 13); // 2026-09-13 → 2026년 2학기
const d = (y, m, day) => new Date(y, m - 1, day);

// 학기 경계
assert.strictEqual(R.termOf(d(2026, 3, 1)), '2026-1');
assert.strictEqual(R.termOf(d(2026, 8, 31)), '2026-1');
assert.strictEqual(R.termOf(d(2026, 9, 1)), '2026-2');
assert.strictEqual(R.termOf(d(2027, 2, 28)), '2026-2');
assert.strictEqual(R.termLabel('2026-2'), '2026년 2학기');
assert.strictEqual(R.termRange('2026-2').to.getMonth(), 1); // 2월 말까지

const entries = [
  { type: 'webinar_attend', status: 'auto', at: d(2026, 9, 2) },
  { type: 'webinar_attend', status: 'auto', at: d(2026, 9, 9) },
  { type: 'webinar_attend', status: 'auto', at: d(2026, 5, 9) },   // 지난 학기
  { type: 'webinar_attend', status: 'rejected', at: d(2026, 9, 10) },
  { type: 'reflection', status: 'auto', at: d(2026, 9, 2) },
  { type: 'diary', at: d(2026, 9, 3) },                            // 기존 교단일기(상태 없음)
  { type: 'webinar_host', status: 'pending', at: d(2026, 9, 4) },  // 확인 대기
  { type: 'unknown_type', status: 'auto', at: d(2026, 9, 4) }
];

// 스탬프: 반려·대기·모르는 유형은 제외
assert.deepStrictEqual(R.stampCounts(entries, 'all', now), { join: 3, reflect: 2, practice: 0, share: 0 });
assert.deepStrictEqual(R.stampCounts(entries, 'term', now), { join: 2, reflect: 2, practice: 0, share: 0 });

const rule = id => R.DEFAULT_BADGES.find(b => b.id === id);

// 학기 3회 조건: 이번 학기 2회라 미획득, 진행률 2/3
let ev = R.evaluateBadge(rule('attendee'), entries, now);
assert.strictEqual(ev.earned, false);
assert.strictEqual(ev.progress[0].have, 2);

// 복합 조건(웨비나 3 + 성찰 2): 성찰은 채웠지만 웨비나 부족
ev = R.evaluateBadge(rule('combo'), entries, now);
assert.strictEqual(ev.earned, false);
assert.strictEqual(ev.progress[1].have, 2);

// 한 번 더 참여하면 둘 다 획득
const more = entries.concat([{ type: 'webinar_attend', status: 'auto', at: d(2026, 9, 12) }]);
assert.strictEqual(R.evaluateBadge(rule('attendee'), more, now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('combo'), more, now).earned, true);

// 대기 중 발표 기록은 마이크 배지에 안 셈
assert.strictEqual(R.evaluateBadge(rule('mic'), entries, now).earned, false);

// 첫걸음: 모든 유형 1회
assert.strictEqual(R.evaluateBadge(rule('hello'), entries, now).earned, true);

// 수동 배지(auto:false)는 조건을 채워도 지급 전엔 미획득, 지급하면 획득
const manual = Object.assign({}, rule('hello'), { id: 'm', auto: false });
let list = R.evaluateBadges([manual], entries, [], now);
assert.strictEqual(list[0].earned, false);
list = R.evaluateBadges([manual], [], ['m'], now);
assert.strictEqual(list[0].earned, true);

// 비활성 배지는 목록에서 빠짐, 조건 없는 배지는 획득 불가
assert.strictEqual(R.evaluateBadges([Object.assign({}, manual, { active: false })], entries, [], now).length, 0);
assert.strictEqual(R.evaluateBadge({ conditions: [] }, entries, now).earned, false);

// 나눔활동 신청도 참여로 센다. 같은 활동을 QR로 인증까지 했으면 1회만.
const joinOnly = [{ type: 'sharing_join', targetId: 'act1', at: d(2026, 9, 5) }];
assert.deepStrictEqual(R.stampCounts(joinOnly, 'all', now), { join: 1, reflect: 0, practice: 0, share: 0 });
assert.strictEqual(R.evaluateBadge(rule('hello'), joinOnly, now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('applicant'), joinOnly, now).earned, true);
const attendOnly = [{ type: 'sharing_attend', status: 'auto', targetId: 'act1', at: d(2026, 9, 5) }];
assert.strictEqual(R.stampCounts(attendOnly, 'all', now).join, 1);
const both = joinOnly.concat(attendOnly);
assert.strictEqual(R.stampCounts(both, 'all', now).join, 1);                       // 신청+인증 = 1회
assert.strictEqual(R.evaluateBadge(rule('cafe'), both, now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('applicant'), both, now).earned, true);     // 신청 배지는 인증 후에도 유지
assert.strictEqual(R.evaluateBadge(rule('join10'), both, now).progress[0].have, 1);  // 참여 스탬프 조건은 1회
// 다른 활동 신청은 그대로 셈, 반려된 인증은 신청을 지우지 않음
assert.strictEqual(R.stampCounts(both.concat([{ type: 'sharing_join', targetId: 'act2', at: d(2026, 9, 6) }]), 'all', now).join, 2);
assert.strictEqual(R.stampCounts(joinOnly.concat([{ type: 'sharing_attend', status: 'rejected', targetId: 'act1', at: d(2026, 9, 5) }]), 'all', now).join, 1);

// 스탬프 단계 배지: 참여 10개 (웨비나 인증 + 현장 인증 + 신청 섞어서)
const ten = [];
for (let i = 0; i < 10; i++) ten.push({ type: ['webinar_attend', 'sharing_attend', 'sharing_join'][i % 3], status: 'auto', targetId: 't' + i, at: d(2026, 9, 1) });
assert.strictEqual(R.evaluateBadge(rule('join10'), ten, now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('join10'), ten.slice(1), now).earned, false);
assert.strictEqual(R.conditionText(rule('join10').conditions[0]), '참여 스탬프 10개');

// 올라운더: 이번 학기 네 스탬프 모두
const four = [
  { type: 'sharing_join', targetId: 'x', at: d(2026, 9, 2) }, { type: 'diary', at: d(2026, 9, 2) },
  { type: 'practice', status: 'auto', at: d(2026, 9, 2) }, { type: 'feedback', status: 'auto', at: d(2026, 9, 2) }
];
assert.strictEqual(R.evaluateBadge(rule('allround'), four, now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('allround'), four.slice(0, 3), now).earned, false);

// 대외행사 참여 인증: 참여 스탬프 + 탐험 배지
const ev1 = [{ type: 'event_attend', status: 'auto', targetId: 'e1', at: d(2026, 9, 3) }];
assert.strictEqual(R.stampCounts(ev1, 'all', now).join, 1);
assert.strictEqual(R.evaluateBadge(rule('explorer'), ev1, now).earned, true);
assert.ok(R.ATTEND_TYPES.includes('event_attend'));

// 교단일기 받은 좋아요: 기록 수가 아니라 likes 합계. 스탬프는 일기 1건당 1개 그대로
const diaries = [{ type: 'diary', likes: 6, at: d(2026, 5, 1) }, { type: 'diary', likes: 3, at: d(2026, 9, 1) }];
assert.strictEqual(R.evaluateBadge(rule('liked'), diaries, now).progress[0].have, 9);
assert.strictEqual(R.evaluateBadge(rule('liked'), diaries, now).earned, false);
assert.strictEqual(R.evaluateBadge(rule('liked'), diaries.concat([{ type: 'diary', likes: 1, at: d(2026, 9, 2) }]), now).earned, true);
assert.strictEqual(R.evaluateBadge(rule('liked'), [{ type: 'diary', at: d(2026, 9, 2) }], now).progress[0].have, 0); // likes 없는 일기
assert.strictEqual(R.stampCounts(diaries, 'all', now).reflect, 2);
assert.strictEqual(R.conditionText(rule('liked').conditions[0]), '교단일기 받은 좋아요 10개');
assert.strictEqual(R.evaluateBadge(rule('recorder'), diaries, now).progress[0].have, 1); // 일반 조건은 여전히 기록 수

// 배지 ID 중복 없음
const ids = R.DEFAULT_BADGES.map(b => b.id);
assert.strictEqual(new Set(ids).size, ids.length);

console.log('rules.check OK');
