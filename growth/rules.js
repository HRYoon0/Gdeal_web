/**
 * G-DEAL 성장패스 — 활동 유형·스탬프·배지 규칙 계산
 * 브라우저(window.GrowthRules)와 node(require) 양쪽에서 쓰는 순수 함수 모음.
 * 원장 항목(entry)은 { type, status, at: Date } 모양으로 정규화된 뒤 들어온다.
 */
(function (root) {
  'use strict';

  // 기본 스탬프 4종 (시범 운영안 1단계)
  var STAMPS = {
    join:     { label: '참여', color: '#2563eb', bg: '#dbeafe' },
    reflect:  { label: '성찰', color: '#7c3aed', bg: '#ede9fe' },
    practice: { label: '실천', color: '#b45309', bg: '#fef3c7' },
    share:    { label: '나눔', color: '#15803d', bg: '#dcfce7' }
  };

  // 활동 유형 → 이름·스탬프. legacy=true는 기존 컬렉션에서 읽어 오는 유형이다.
  var TYPES = {
    webinar_attend: { label: '웨비나 참여',        stamp: 'join' },
    sharing_attend: { label: '나눔활동 참여 인증', stamp: 'join' },   // 카페연수·별뉘·독서모임·미니스터디 QR 인증
    event_attend:   { label: '대외행사 참여 인증', stamp: 'join' },   // 운영진이 여는 대외행사 QR 인증
    webinar_host:   { label: '웨비나 발표·진행',   stamp: 'share' },
    reflection:     { label: '3분 성찰',           stamp: 'reflect' },
    practice:       { label: '수업·업무 적용',     stamp: 'practice' },
    resource_share: { label: '자료 공유',          stamp: 'share', legacy: true },
    app_register:   { label: '웹앱 자료 등록',     stamp: 'share', legacy: true },  // 자료공유에서 kind=webapp 으로 등록
    feedback:       { label: '자료 후기',          stamp: 'share' },
    group_project:  { label: '소모임 프로젝트',    stamp: 'practice' },
    diary:          { label: '교단일기',           stamp: 'reflect', legacy: true },
    sharing_host:   { label: '나눔활동 개설',      stamp: 'share', legacy: true },
    // 신청도 참여로 센다. 같은 활동을 QR로 인증까지 했으면 countable()이 신청을 빼서 1회로 센다.
    sharing_join:   { label: '나눔활동 신청',      stamp: 'join', legacy: true }
  };

  // 회원이 직접 남기면 바로 인정되는 유형 / 운영진 확인이 필요한 유형
  var SELF_AUTO = ['webinar_attend', 'sharing_attend', 'event_attend', 'reflection', 'practice', 'feedback'];
  // QR·코드로 참여를 인증하는 유형 (문서 ID {uid}_attend_{대상ID} 하나를 함께 쓴다)
  var ATTEND_TYPES = ['webinar_attend', 'sharing_attend', 'event_attend'];

  // 스탬프별 유형 목록 — 배지 조건을 "그 스탬프 전체"로 걸 때 쓴다
  function stampTypes(stamp) {
    return Object.keys(TYPES).filter(function (k) { return TYPES[k].stamp === stamp; });
  }
  var NEEDS_REVIEW = ['webinar_host', 'group_project'];

  // 문서 5장 배지 예시(A안) + 조건. 관리자 화면에서 그대로 불러와 고칠 수 있다.
  var DEFAULT_BADGES = [
    { id: 'hello',     name: '안녕, 찌딜이!',   desc: '첫 활동 기록을 남겼어요',            period: 'all',  conditions: [{ types: ['*'], count: 1 }] },
    { id: 'attendee',  name: '프로참석러 지딜', desc: '한 학기에 웨비나 3회 참여',          period: 'term', conditions: [{ types: ['webinar_attend'], count: 3 }] },
    { id: 'recorder',  name: '기록하는 지딜',   desc: '한 학기에 성찰 기록 3회',            period: 'term', conditions: [{ types: ['reflection', 'diary'], count: 3 }] },
    { id: 'action',    name: '액션 지딜',       desc: '배운 내용을 수업에 처음 적용',       period: 'all',  conditions: [{ types: ['practice'], count: 1 }] },
    { id: 'maker',     name: '금손 지딜',       desc: '직접 만든 웹앱을 자료공유에 등록',   period: 'all',  conditions: [{ types: ['app_register'], count: 1 }] },
    { id: 'verified',  name: '찐실천 지딜',     desc: '수업 적용 기록 3회',                 period: 'all',  conditions: [{ types: ['practice'], count: 3 }] },
    { id: 'sharer',    name: '나눔천사 지딜',   desc: '자료 3건 공유',                      period: 'all',  conditions: [{ types: ['resource_share'], count: 3 }] },
    { id: 'mic',       name: '마이크 든 지딜',  desc: '웨비나나 나눔활동을 직접 진행',      period: 'all',  conditions: [{ types: ['webinar_host', 'sharing_host'], count: 1 }] },
    { id: 'booster',   name: '지딜 부스터',     desc: '다른 회원 자료에 후기 3회',          period: 'all',  conditions: [{ types: ['feedback'], count: 3 }] },
    { id: 'crew',      name: '지딜 크루장',     desc: '소모임 프로젝트 완성',               period: 'all',  conditions: [{ types: ['group_project'], count: 1 }] },
    { id: 'combo',     name: '배움을 찍고 기록한 지딜', desc: '한 학기 웨비나 3회 + 성찰 2회', period: 'term',
      conditions: [{ types: ['webinar_attend'], count: 3 }, { types: ['reflection', 'diary'], count: 2 }] },

    // 나눔활동 신청·오프라인 참여
    { id: 'applicant', name: '손 번쩍 지딜',     desc: '나눔활동에 처음 신청',                period: 'all',  conditions: [{ types: ['sharing_join'], count: 1 }] },
    { id: 'cafe',      name: '카페 나들이 지딜', desc: '카페연수 등 나눔활동 현장 참여 인증', period: 'all',  conditions: [{ types: ['sharing_attend'], count: 1 }] },
    { id: 'cafe5',     name: '발로 뛰는 지딜',   desc: '나눔활동 현장 참여 인증 5회',         period: 'all',  conditions: [{ types: ['sharing_attend'], count: 5 }] },
    { id: 'explorer',  name: '현장 탐험 지딜',   desc: '대외행사 참여 인증',                  period: 'all',  conditions: [{ types: ['event_attend'], count: 1 }] },

    // 스탬프 단계 배지 (전체 기간 누적)
    { id: 'join10',    name: '단골 지딜',        desc: '참여 스탬프 10개',                    period: 'all',  conditions: [{ types: stampTypes('join'), count: 10 }] },
    { id: 'join30',    name: '개근상 지딜',      desc: '참여 스탬프 30개',                    period: 'all',  conditions: [{ types: stampTypes('join'), count: 30 }] },
    { id: 'reflect10', name: '생각 깊은 지딜',   desc: '성찰 스탬프 10개',                    period: 'all',  conditions: [{ types: stampTypes('reflect'), count: 10 }] },
    { id: 'reflect30', name: '성찰 장인 지딜',   desc: '성찰 스탬프 30개',                    period: 'all',  conditions: [{ types: stampTypes('reflect'), count: 30 }] },
    { id: 'practice10', name: '실천 마스터 지딜', desc: '실천 스탬프 10개',                   period: 'all',  conditions: [{ types: stampTypes('practice'), count: 10 }] },
    { id: 'share10',   name: '나눔 부자 지딜',   desc: '나눔 스탬프 10개',                    period: 'all',  conditions: [{ types: stampTypes('share'), count: 10 }] },
    { id: 'mic5',      name: '명강사 지딜',      desc: '웨비나·나눔활동 진행 5회',            period: 'all',  conditions: [{ types: ['webinar_host', 'sharing_host'], count: 5 }] },
    { id: 'booster10', name: '후기 요정 지딜',   desc: '다른 회원 자료에 후기 10회',          period: 'all',  conditions: [{ types: ['feedback'], count: 10 }] },

    // 교단일기 좋아요: sum 조건은 기록 수 대신 그 필드의 합계(받은 좋아요 수)를 센다
    { id: 'liked',     name: '공감받는 지딜',    desc: '교단일기로 좋아요 10개 받기',          period: 'all',  conditions: [{ types: ['diary'], sum: 'likes', count: 10 }] },
    { id: 'liked50',   name: '마음을 울린 지딜', desc: '교단일기로 좋아요 50개 받기',          period: 'all',  conditions: [{ types: ['diary'], sum: 'likes', count: 50 }] },

    // 기간 복합 배지
    { id: 'allround',  name: '올라운더 지딜',    desc: '한 학기에 네 가지 스탬프를 모두 받기', period: 'term',
      conditions: ['join', 'reflect', 'practice', 'share'].map(function (k) { return { types: stampTypes(k), count: 1 }; }) },
    { id: 'fullyear',  name: '한 해 꽉 채운 지딜', desc: '한 학년도에 참여 10 + 성찰 5 + 실천 3', period: 'year',
      conditions: [{ types: stampTypes('join'), count: 10 }, { types: stampTypes('reflect'), count: 5 }, { types: stampTypes('practice'), count: 3 }] }
  ];

  // 학기: 3~8월 = 1학기, 9~2월 = 2학기(1·2월은 전년도 2학기)
  function termOf(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1;
    if (m >= 3 && m <= 8) return y + '-1';
    return (m <= 2 ? y - 1 : y) + '-2';
  }
  function termLabel(term) {
    var p = String(term).split('-');
    return p[0] + '년 ' + p[1] + '학기';
  }
  // 학년도: 3월 시작
  function schoolYearOf(d) {
    return d.getMonth() + 1 <= 2 ? d.getFullYear() - 1 : d.getFullYear();
  }
  // 학기 시작·끝 날짜 (포트폴리오 기간 기본값)
  function termRange(term) {
    var p = String(term).split('-'), y = Number(p[0]);
    if (p[1] === '1') return { from: new Date(y, 2, 1), to: new Date(y, 8, 0, 23, 59, 59) };
    return { from: new Date(y, 8, 1), to: new Date(y + 1, 2, 0, 23, 59, 59) };
  }

  // 대기·반려 기록은 스탬프·배지에 세지 않는다
  function counts(entry) {
    return entry.status !== 'pending' && entry.status !== 'rejected';
  }

  function inPeriod(entry, period, now) {
    if (!entry.at) return period === 'all';
    if (period === 'term') return termOf(entry.at) === termOf(now);
    if (period === 'year') return schoolYearOf(entry.at) === schoolYearOf(now);
    return true;
  }

  // 스탬프 있는 유형 + 대기·반려 제외
  function valid(entries) {
    return (entries || []).filter(function (e) { return TYPES[e.type] && TYPES[e.type].stamp && counts(e); });
  }
  // 같은 활동을 QR로 인증까지 한 신청 기록인가 (참여를 셀 때 신청+인증을 1회로 만든다)
  function shadowTest(list) {
    var attended = {};
    list.forEach(function (e) { if (ATTEND_TYPES.indexOf(e.type) !== -1 && e.targetId) attended[e.targetId] = true; });
    return function (e) { return e.type === 'sharing_join' && !!e.targetId && !!attended[e.targetId]; };
  }
  // 스탬프·통계에 세는 기록 (신청+인증 중복 제거까지)
  function countable(entries) {
    var list = valid(entries), shadowed = shadowTest(list);
    return list.filter(function (e) { return !shadowed(e); });
  }

  function stampCounts(entries, period, now) {
    var out = { join: 0, reflect: 0, practice: 0, share: 0 };
    countable(entries).forEach(function (e) {
      if (inPeriod(e, period || 'all', now || new Date())) out[TYPES[e.type].stamp]++;
    });
    return out;
  }

  // 배지 하나 평가: 모든 조건(AND)을 채우면 획득. 조건 안의 types는 합산(OR).
  function evaluateBadge(rule, entries, now) {
    now = now || new Date();
    var all = valid(entries), shadowed = shadowTest(all);
    var pool = all.filter(function (e) { return inPeriod(e, rule.period || 'all', now); });
    var conds = (rule.conditions || []).filter(function (c) { return Number(c.count) > 0; });
    var progress = conds.map(function (c) {
      var types = c.types || [];
      // 참여 인증을 함께 세는 조건에서만 중복 신청을 뺀다("첫 신청" 배지는 인증 후에도 유지)
      var dedupe = types.indexOf('*') !== -1 || ATTEND_TYPES.some(function (t) { return types.indexOf(t) !== -1; });
      var hits = pool.filter(function (e) {
        return (types.indexOf('*') !== -1 || types.indexOf(e.type) !== -1) && !(dedupe && shadowed(e));
      });
      var have = c.sum ? hits.reduce(function (s, e) { return s + (Number(e[c.sum]) || 0); }, 0) : hits.length;
      return { types: types, count: Number(c.count), have: have, sum: c.sum || '' };
    });
    var earned = progress.length > 0 && progress.every(function (p) { return p.have >= p.count; });
    var ratio = progress.length === 0 ? 0 : progress.reduce(function (s, p) {
      return s + Math.min(1, p.have / p.count);
    }, 0) / progress.length;
    return { earned: earned, progress: progress, ratio: ratio };
  }

  // 전체 배지 평가. auto가 false인 배지는 관리자 지급(grants)으로만 획득한다.
  function evaluateBadges(rules, entries, grantedIds, now) {
    grantedIds = grantedIds || [];
    return (rules || []).filter(function (r) { return r.active !== false; }).map(function (r) {
      var ev = evaluateBadge(r, entries, now);
      var granted = grantedIds.indexOf(r.id) !== -1;
      return {
        rule: r,
        earned: granted || (r.auto !== false && ev.earned),
        granted: granted,
        progress: ev.progress,
        ratio: granted ? 1 : ev.ratio
      };
    });
  }

  function conditionText(c) {
    var types = c.types || [];
    // 한 스탬프의 유형을 전부 고른 조건은 "○○ 스탬프"로 줄여 쓴다
    var whole = Object.keys(STAMPS).filter(function (k) {
      var all = stampTypes(k);
      return types.length === all.length && all.every(function (t) { return types.indexOf(t) !== -1; });
    })[0];
    if (whole && !c.sum) return STAMPS[whole].label + ' 스탬프 ' + c.count + '개';
    var names = types.map(function (t) {
      return t === '*' ? '모든 활동' : (TYPES[t] ? TYPES[t].label : t);
    });
    return names.join('·') + (c.sum === 'likes' ? ' 받은 좋아요 ' + c.count + '개' : ' ' + c.count + '회');
  }

  var api = {
    STAMPS: STAMPS, TYPES: TYPES, SELF_AUTO: SELF_AUTO, NEEDS_REVIEW: NEEDS_REVIEW, ATTEND_TYPES: ATTEND_TYPES,
    stampTypes: stampTypes, countable: countable,
    DEFAULT_BADGES: DEFAULT_BADGES,
    termOf: termOf, termLabel: termLabel, termRange: termRange, schoolYearOf: schoolYearOf,
    counts: counts, inPeriod: inPeriod, stampCounts: stampCounts,
    evaluateBadge: evaluateBadge, evaluateBadges: evaluateBadges, conditionText: conditionText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GrowthRules = api;
})(this);
