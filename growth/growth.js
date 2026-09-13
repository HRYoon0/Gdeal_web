/**
 * 내 성장패스 — 오늘의 활동 · 스탬프 · 배지 · 최근 기록 · 알림 설정
 * 참여 인증(웨비나·카페연수 등 나눔활동 — QR 링크 ?w=대상ID&c=코드 또는 코드 직접 입력) → 3분 성찰 → 실천 후속 기록
 */
(function () {
  'use strict';

  var G = window.G, R = G.R, esc = G.esc;
  var main = G.shell({
    active: '/growth/',
    title: 'GDEAL 성장패스',
    subtitle: '배움을 찍고, 실천을 기록하고, 성장을 나누다.'
  });

  var state = {
    user: null, profile: null,
    entries: [], rules: [], grants: [], webinars: [], groups: [],
    period: 'term', filter: 'all',
    community: null, groupCommunity: null,
    communityView: 'public', communityGroup: '', communityType: 'all', communityTarget: '', communityShown: 20,
    checkinDone: false
  };

  var PERIODS = [['term', '이번 학기'], ['year', '올해(학년도)'], ['all', '전체']];

  // ---------- 데이터 ----------

  // 관리자 등록 웨비나 + 모든 나눔활동
  function loadWebinars() {
    return G.loadWebinarList();
  }

  function loadMyGroups(uid) {
    return G.db.collection('groups').where('memberUids', 'array-contains', uid).get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    }).catch(function () { return []; });
  }

  function reload() {
    main.innerHTML = G.loadingHtml('내 성장 기록을 불러오는 중...');
    var p = state.profile;
    return Promise.all([
      G.loadLedger(p.uid), G.loadBadgeRules(), G.loadGrants(p.uid), loadWebinars(), loadMyGroups(p.uid)
    ]).then(function (r) {
      state.entries = r[0]; state.rules = r[1]; state.grants = r[2]; state.webinars = r[3]; state.groups = r[4];
      render();
    }).catch(function (e) {
      console.error(e);
      main.innerHTML = '<div class="g-wrap g-body">' + G.errorHtml('기록을 불러오지 못했습니다. (' + (e.code || e.message) + ')', 'retryLoad') + '</div>';
      document.getElementById('retryLoad').addEventListener('click', reload);
    });
  }

  function webinarById(id) {
    for (var i = 0; i < state.webinars.length; i++) if (state.webinars[i].id === id) return state.webinars[i];
    return null;
  }
  function attended() {
    return state.entries.filter(function (e) { return R.ATTEND_TYPES.indexOf(e.type) !== -1 && R.counts(e); });
  }
  function hasAttend(targetId) {
    return state.entries.some(function (e) { return R.ATTEND_TYPES.indexOf(e.type) !== -1 && e.targetId === targetId; });
  }
  function hasLogFor(type, targetId) {
    return state.entries.some(function (e) { return e.type === type && e.targetId === targetId; });
  }

  // ---------- 배너 버튼 ----------

  function renderBannerActions() {
    var box = document.getElementById('gBannerActions');
    if (!box) return;
    if (!state.profile || !state.profile.isMember) { box.innerHTML = ''; return; }
    box.innerHTML =
      '<button class="g-btn ghost-white" data-act="checkin" title="QR을 찍을 수 없을 때 진행자가 알려 준 6자리 코드로 인증">코드로 인증</button>' +
      '<button class="g-btn ghost-white" data-act="reflect">3분 성찰 쓰기</button>' +
      '<button class="g-btn ghost-white" data-act="practice">실천 기록</button>' +
      '<button class="g-btn ghost-white" data-act="contrib">발표·프로젝트 신청</button>' +
      '<a class="g-btn ghost-white" href="/portfolio/">내 포트폴리오</a>' +
      '<button class="g-btn ghost-white" data-act="notify">알림 설정</button>';
  }

  // ---------- 화면 ----------

  function renderGuest() {
    renderBannerActions();
    main.innerHTML = '<div class="g-wrap g-body">' +
      '<div class="g-card"><div class="g-card-title">성장패스는 이렇게 쓰여요</div>' +
      '<div class="g-grid cols-4" style="margin-bottom:1rem">' +
      step('1', '참여 인증', '나눔활동에 신청하거나 웨비나·카페연수에서 QR로 인증하면 참여 스탬프가 찍혀요.') +
      step('2', '3분 성찰', '끝난 직후 세 문항만 짧게 남겨요.') +
      step('3', '실천 기록', '수업에 적용해 본 결과를 남기면 실천 스탬프가 찍혀요.') +
      step('4', '포트폴리오', '한 학기 기록을 골라 나만의 포트폴리오로 묶어요.') +
      '</div>' +
      (G.param('w') ? '<div class="g-notice" style="margin-bottom:1rem">참여 인증 링크로 들어오셨어요. 로그인하면 바로 인증됩니다.</div>' : '') +
      '<button class="g-btn" id="guestLogin">로그인하고 시작하기</button></div></div>';
    document.getElementById('guestLogin').addEventListener('click', function () {
      G.openLogin(G.param('w') ? '로그인하면 참여가 바로 인증됩니다.' : '');
    });
    if (G.param('w')) G.openLogin('로그인하면 참여가 바로 인증됩니다.');
  }

  function step(n, title, text) {
    return '<div class="g-card" style="background:#f9fafb"><div class="g-stat-num" style="font-size:1.3rem">' + n + '</div>' +
      '<div style="font-weight:700;margin:.2rem 0">' + title + '</div><div class="g-muted">' + text + '</div></div>';
  }

  function renderNotMember() {
    renderBannerActions();
    main.innerHTML = '<div class="g-wrap g-body"><div class="g-card"><div class="g-card-title">승인 후 이용할 수 있어요</div>' +
      '<p class="g-muted">성장패스 기록은 가입 승인이 끝난 회원만 남길 수 있습니다. 승인 여부는 운영사무국에 문의해주세요.</p></div></div>';
  }

  function render() {
    renderBannerActions();
    var now = new Date();
    var badges = R.evaluateBadges(state.rules, state.entries, state.grants, now);
    var earned = badges.filter(function (b) { return b.earned; });
    var locked = badges.filter(function (b) { return !b.earned; }).sort(function (a, b) { return b.ratio - a.ratio; });
    var fb = state.profile.featuredBadge;
    // 규칙이 바뀌어 대표 배지가 더 이상 획득 상태가 아니면 자동 해제(이름이 같은 배지가 있으면 유지)
    if (fb && !earned.some(function (b) { return b.rule.id === fb.id || b.rule.name === fb.name; })) {
      G.setFeaturedBadge(null).catch(function (e) { console.warn('대표 배지 해제 실패:', e); });
      fb = null;
    }
    earned.forEach(function (b) { b.featured = !!fb && (b.rule.id === fb.id || b.rule.name === fb.name); });
    celebrate(earned);

    main.innerHTML = sectionNav() + '<div class="g-wrap g-body">' +
      '<div class="g-grid cols-2">' + todayCard(locked[0]) + stampCard() + '</div>' +
      '<div class="g-section-title" id="community" data-sec>회원들의 성찰·실천</div>' +
      '<div id="communityBox">' + communityHtml() + '</div>' +
      '<div class="g-section-title" id="secBadges" data-sec>배지 <span class="g-muted" style="font-weight:500">' + earned.length + ' / ' + badges.length + '</span></div>' +
      '<div class="g-badges">' + earned.concat(locked).map(function (b) { return G.badgeHtml(b, true, badgeFoot(b)); }).join('') + '</div>' +
      '<div class="g-section-title" id="secRecords" data-sec>최근 기록</div>' + recordsCard() +
      '</div>';

    bindMain();
    bindSectionNav();
    ensureCommunity();
  }

  // 배너 아래 섹션 바로가기 (스크롤해도 위에 붙어 있음)
  var SECTIONS = [['secToday', '오늘의 활동'], ['secStamps', '내 스탬프'], ['community', '회원들의 성찰·실천'], ['secBadges', '배지'], ['secRecords', '최근 기록']];
  function sectionNav() {
    return '<nav class="g-secnav no-print" aria-label="성장패스 바로가기"><div class="g-wrap g-secnav-inner">' +
      SECTIONS.map(function (x, i) {
        return '<button type="button" class="g-chip' + (i === 0 ? ' on' : '') + '" data-goto="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div></nav>';
  }

  var navObserver = null;
  function bindSectionNav() {
    var nav = main.querySelector('.g-secnav');
    if (!nav) return;
    var inner = nav.querySelector('.g-secnav-inner');
    function mark(id) {
      var on = null;
      nav.querySelectorAll('[data-goto]').forEach(function (b) {
        var hit = b.getAttribute('data-goto') === id;
        b.classList.toggle('on', hit);
        if (hit) on = b;
      });
      // 좁은 화면에서 막대가 옆으로 넘치면 선택된 버튼이 보이게 가로로만 옮긴다
      if (on && inner.scrollWidth > inner.clientWidth) {
        var r = on.getBoundingClientRect(), box = inner.getBoundingClientRect();
        if (r.left < box.left + 72 || r.right > box.right) inner.scrollLeft += r.left - box.left - (box.width - r.width) / 2;
      }
    }
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]');
      var target = b && document.getElementById(b.getAttribute('data-goto'));
      if (!target) return;
      mark(b.getAttribute('data-goto'));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // 스크롤 위치에 따라 지금 보이는 섹션 표시
    if (navObserver) navObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;
    navObserver = new IntersectionObserver(function (items) {
      var seen = items.filter(function (it) { return it.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (seen.length) mark(seen[0].target.id);
    }, { rootMargin: '-90px 0px -60% 0px' });
    main.querySelectorAll('[data-sec]').forEach(function (el) { navObserver.observe(el); });
  }

  // 새로 받은 배지를 한 번 축하한다. 이 기기에서 처음 연 경우는 조용히 기억만 해 둔다.
  // ponytail: 본 배지 목록은 기기별 localStorage — 다른 기기에서는 한 번 더 뜰 수 있다.
  function celebrate(earned) {
    if (document.querySelector('.g-modal-back')) return; // 인증 직후 성찰 폼 등이 열려 있으면 다음 화면 갱신 때
    var key = 'gdeal:seenBadges:' + state.profile.uid, seen = null;
    try { seen = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
    var ids = earned.map(function (b) { return b.rule.id; });
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) { return; }
    if (!Array.isArray(seen)) return;
    var fresh = earned.filter(function (b) { return seen.indexOf(b.rule.id) === -1; });
    if (!fresh.length) return;
    G.openModal('<h3>새 배지를 받았어요!</h3><div class="g-badges">' + fresh.map(function (b) { return G.badgeHtml(b, false); }).join('') + '</div>' +
      '<p class="g-muted" style="margin-top:.75rem">배지 카드에서 「대표로 설정」을 누르면 이름 옆에 보여요.</p>' +
      '<div class="g-modal-actions"><button class="g-btn" data-close>좋아요</button></div>');
  }

  // 획득 배지 카드 아래 대표 배지 설정/해제 버튼
  function badgeFoot(b) {
    if (!b.earned) return '';
    return b.featured ?
      '<span class="g-tag green">대표 배지</span><button class="g-btn small secondary" data-unfeature="1">해제</button>' :
      '<button class="g-btn small secondary" data-feature="' + esc(b.rule.id) + '">대표로 설정</button>';
  }

  function todayCard(nextBadge) {
    var today = G.ymd(new Date());
    var upcoming = state.webinars.filter(function (w) { return w.date && w.date >= today && w.status !== '종료'; }).slice(0, 4);
    var tasks = [];

    // 참여했지만 성찰이 없는 웨비나 → 3분 성찰 권유
    attended().forEach(function (e) {
      if (!hasLogFor('reflection', e.targetId)) {
        tasks.push({ act: 'reflect', target: e.targetId, text: '「' + (e.title || '나눔활동') + '」 3분 성찰을 남겨 보세요' });
      } else if (!hasLogFor('practice', e.targetId) && G.daysBetween(e.at, new Date()) >= 3) {
        // 참여 3일 뒤부터 실천 후속 기록 권유
        tasks.push({ act: 'practice', target: e.targetId, text: '「' + (e.title || '나눔활동') + '」 배운 내용을 적용해 보셨나요?' });
      }
    });

    var html = '<div class="g-card" id="secToday" data-sec><div class="g-card-title">오늘의 활동</div><ul class="g-list">';
    if (!upcoming.length && !tasks.length) html += '<li class="g-item g-muted">예정된 웨비나·나눔활동이 없어요. 교단일기나 실천 기록으로 오늘을 남겨 보세요.</li>';
    upcoming.forEach(function (w) {
      var isToday = w.date === today;
      var done = hasAttend(w.id);
      html += '<li class="g-item"><div class="g-item-head"><div>' +
        '<span class="g-tag ' + (isToday ? 'green' : 'blue') + '">' + (isToday ? '오늘' : esc(G.fmtDate(w.date))) + '</span>' +
        '<div class="g-item-title">' + esc(w.title) + '</div>' +
        '<div class="g-item-meta">' + esc([w.category, w.time, w.speaker].filter(Boolean).join(' · ')) + '</div></div>' +
        (done ? '<span class="g-tag green">인증 완료</span>' :
          isToday ? '<button class="g-btn small" data-act="checkin" data-target="' + esc(w.id) + '">인증</button>' : '') +
        '</div>' + (G.safeUrl(w.link) ? '<div class="g-item-body"><a href="' + esc(G.safeUrl(w.link)) + '" target="_blank" rel="noopener noreferrer" style="color:#497e56;text-decoration:underline">참여 링크</a></div>' : '') +
        '</li>';
    });
    tasks.slice(0, 4).forEach(function (t) {
      html += '<li class="g-item"><div class="g-item-head"><div class="g-item-title" style="font-weight:500">' + esc(t.text) + '</div>' +
        '<button class="g-btn small secondary" data-act="' + t.act + '" data-target="' + esc(t.target) + '">' + (t.act === 'reflect' ? '성찰 쓰기' : '기록하기') + '</button></div></li>';
    });
    if (nextBadge && nextBadge.ratio > 0) {
      html += '<li class="g-item"><div class="g-item-meta">가장 가까운 배지</div><div class="g-item-title">' + esc(nextBadge.rule.name) + ' · ' + Math.round(nextBadge.ratio * 100) + '%</div>' +
        '<div class="g-progress"><span style="width:' + Math.round(nextBadge.ratio * 100) + '%"></span></div></li>';
    }
    return html + '</ul></div>';
  }

  function stampCard() {
    var counts = R.stampCounts(state.entries, state.period, new Date());
    var label = state.period === 'term' ? R.termLabel(R.termOf(new Date())) : state.period === 'year' ? R.schoolYearOf(new Date()) + '학년도' : '전체 기간';
    return '<div class="g-card" id="secStamps" data-sec><div class="g-card-title"><span>내 스탬프 <span class="g-muted" style="font-weight:500">' + esc(label) + '</span></span>' +
      '<div class="g-chips">' + PERIODS.map(function (p) {
        return '<button class="g-chip' + (state.period === p[0] ? ' on' : '') + '" data-period="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' + G.stampsHtml(counts) +
      '<p class="g-muted g-small" style="margin-top:.75rem">교단일기·자료공유·나눔활동 개설과 신청 기록도 함께 셉니다. 같은 활동에 신청하고 QR 인증까지 하면 참여 1회로 셉니다. 확인 대기 중인 기록은 승인 후 반영돼요.</p></div>';
  }

  function recordsCard() {
    var list = state.entries.filter(function (e) {
      return state.filter === 'all' || (R.TYPES[e.type] && R.TYPES[e.type].stamp === state.filter);
    });
    var chips = [['all', '전체', state.entries.length]].concat(Object.keys(R.STAMPS).map(function (k) {
      return [k, R.STAMPS[k].label, state.entries.filter(function (e) { return R.TYPES[e.type] && R.TYPES[e.type].stamp === k; }).length];
    }));
    var html = '<div class="g-card"><div class="g-chips" style="margin-bottom:1rem">' + chips.map(function (c) {
      if (c[0] !== 'all' && c[2] === 0) return '<span class="g-chip off" aria-disabled="true">' + c[1] + '</span>';
      return '<button class="g-chip' + (state.filter === c[0] ? ' on' : '') + '" data-filter="' + c[0] + '">' + c[1] + ' <b>' + c[2] + '</b></button>';
    }).join('') + '</div>';
    if (!list.length) return html + '<div class="g-empty">아직 기록이 없어요. 위의 버튼으로 첫 기록을 남겨 보세요.</div></div>';
    html += '<ul class="g-list">' + list.slice(0, 60).map(function (e) {
      return G.entryHtml(e, {
        showVisibility: true,
        actions: function (x) {
          if (x.source !== 'activityLog') return x.link ? '<a class="g-btn small secondary" href="' + esc(x.link) + '">원본</a>' : '';
          var editable = x.type === 'reflection' || x.type === 'practice' || x.type === 'webinar_host' || x.type === 'group_project';
          return (editable ? '<button class="g-btn small secondary" data-edit="' + esc(x.id) + '">수정</button>' : '') +
            '<button class="g-btn small danger" data-del="' + esc(x.id) + '">삭제</button>';
        }
      });
    }).join('') + '</ul>';
    if (list.length > 60) html += '<p class="g-muted g-small" style="margin-top:.5rem">최근 60건만 보여요. 전체는 포트폴리오에서 기간을 골라 확인할 수 있어요.</p>';
    return html + '</div>';
  }

  // ---------- 회원들의 성찰·실천 (전체 공개 모아보기) ----------

  // 보기: 전체 공개(public) / 내 소모임(group). 각각 처음 열 때 한 번 불러온다.
  function currentFeed() {
    return state.communityView === 'group' ? state.groupCommunity : state.community;
  }

  function ensureCommunity() {
    if (state.communityView === 'group' && !state.groups.length) state.communityView = 'public';
    if (currentFeed()) return;
    var isGroup = state.communityView === 'group';
    var key = isGroup ? 'groupCommunity' : 'community';
    state[key] = { loading: true, list: [] };
    var job = isGroup ? G.loadGroupLogs(state.groups.map(function (g) { return g.id; })) : G.loadPublicLogs();
    job.then(function (list) {
      state[key] = { list: list };
    }).catch(function (e) {
      console.error((isGroup ? '소모임' : '공개') + ' 기록 조회 실패:', e);
      state[key] = { list: [], error: e.code || e.message };
    }).then(drawCommunity);
  }

  function loadCommunity() {
    if (state.communityView === 'group') state.groupCommunity = null; else state.community = null;
    ensureCommunity();
    drawCommunity();
  }

  function drawCommunity() {
    var box = document.getElementById('communityBox');
    if (!box) return;
    box.innerHTML = communityHtml();
    bindCommunity(box);
  }

  function viewTabs() {
    var tabs = [['public', '전체 공개']];
    if (state.groups.length) tabs.push(['group', '내 소모임']);
    return '<div class="g-chips" style="margin-bottom:.85rem">' + tabs.map(function (t) {
      return '<button class="g-chip' + (state.communityView === t[0] ? ' on' : '') + '" data-cview="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + (state.groups.length ? '' : '<span class="g-muted g-small" style="align-self:center">소모임에 속하면 「내 소모임」 보기가 생겨요.</span>') + '</div>';
  }

  function communityHtml() {
    var c = currentFeed();
    var head = '<div class="g-card">' + viewTabs();
    if (!c || c.loading) return head + G.loadingHtml('회원들의 기록을 불러오는 중...') + '</div>';
    if (c.error) return head + G.errorHtml('불러오지 못했습니다. (' + c.error + ')', 'retryCommunity') + '</div>';
    var isGroup = state.communityView === 'group';
    var groupName = {};
    state.groups.forEach(function (g) { groupName[g.id] = g.name; });

    // 활동 목록(기록이 있는 활동만, 기록 많은 순)
    var byTarget = {};
    c.list.forEach(function (e) {
      if (!e.targetId) return;
      var t = byTarget[e.targetId] || (byTarget[e.targetId] = { id: e.targetId, title: e.title || '나눔활동', n: 0 });
      t.n++;
    });
    var targets = Object.keys(byTarget).map(function (k) { return byTarget[k]; }).sort(function (a, b) { return b.n - a.n; });
    if (state.communityTarget && !byTarget[state.communityTarget]) state.communityTarget = '';

    if (isGroup && state.communityGroup && !groupName[state.communityGroup]) state.communityGroup = '';
    var base = c.list.filter(function (e) { return !isGroup || !state.communityGroup || e.groupId === state.communityGroup; });
    // 유형 칩: 전체 공개는 성찰·실천, 소모임은 공유된 유형 그대로(발표·프로젝트 포함)
    var typeKeys = isGroup ? Object.keys(base.reduce(function (o, e) { o[e.type] = 1; return o; }, {})) : ['reflection', 'practice'];
    if (state.communityType !== 'all' && typeKeys.indexOf(state.communityType) === -1) state.communityType = 'all';
    var list = base.filter(function (e) {
      return (state.communityType === 'all' || e.type === state.communityType) &&
        (!state.communityTarget || e.targetId === state.communityTarget);
    });
    var types = [['all', '전체']].concat(typeKeys.map(function (k) { return [k, R.TYPES[k] ? R.TYPES[k].label : k]; }));
    var html = head + (isGroup && state.groups.length > 1 ? '<div class="g-chips" style="margin-bottom:.6rem">' +
        [['', '모든 소모임']].concat(state.groups.map(function (g) { return [g.id, g.name]; })).map(function (g) {
          return '<button class="g-chip' + (state.communityGroup === g[0] ? ' on' : '') + '" data-cgroup="' + esc(g[0]) + '">' + esc(g[1]) + '</button>';
        }).join('') + '</div>' : '') +
      '<div class="g-row" style="justify-content:space-between;margin-bottom:1rem">' +
      '<div class="g-chips">' + types.map(function (t) {
        var n = t[0] === 'all' ? base.length : base.filter(function (e) { return e.type === t[0]; }).length;
        return '<button class="g-chip' + (state.communityType === t[0] ? ' on' : '') + '" data-ctype="' + t[0] + '">' + esc(t[1]) + ' <b>' + n + '</b></button>';
      }).join('') + '</div>' +
      (targets.length ? '<select class="g-select" id="communityTarget" aria-label="활동으로 거르기" style="width:auto;max-width:100%">' +
        '<option value="">모든 활동</option>' + targets.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === state.communityTarget ? ' selected' : '') + '>' + esc(t.title) + ' (' + t.n + ')</option>';
        }).join('') + '</select>' : '') + '</div>';
    if (!list.length) {
      return html + '<div class="g-empty">' + (c.list.length ? '조건에 맞는 기록이 없어요.' :
        isGroup ? '아직 내 소모임에 공유된 기록이 없어요. 기록을 남길 때 「소모임 공유」를 고르면 구성원끼리 볼 수 있어요.' :
        '아직 전체 공개된 성찰·실천 기록이 없어요. 기록을 남길 때 「전체 공개」로 두면 여기에서 함께 볼 수 있어요.') + '</div></div>';
    }
    html += '<ul class="g-list">' + list.slice(0, state.communityShown).map(function (e) {
      var item = G.entryHtml(e, { showUser: true });
      // 소모임 보기에서는 어느 소모임에 공유됐는지 표시
      return isGroup && groupName[e.groupId] ? item.replace('<div class="g-item-meta">', '<div class="g-item-meta"><span class="g-tag blue">' + esc(groupName[e.groupId]) + '</span> ') : item;
    }).join('') + '</ul>';
    if (list.length > state.communityShown) {
      html += '<div style="text-align:center;margin-top:1rem"><button class="g-btn secondary" data-cmore>더 보기 (' + (list.length - state.communityShown) + '건 남음)</button></div>';
    }
    return html + '<p class="g-muted g-small" style="margin-top:.75rem">' + (isGroup ?
      '같은 소모임 구성원에게만 보여요.' :
      '승인된 회원에게만 보여요. 내 기록을 여기서 빼려면 최근 기록에서 수정 → 공개 범위를 「소모임 공유」로 바꿔 주세요.') + '</p></div>';
  }

  function bindCommunity(box) {
    box.querySelectorAll('[data-cview]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.communityView = b.getAttribute('data-cview');
        state.communityType = 'all'; state.communityTarget = ''; state.communityShown = 20;
        ensureCommunity();
        drawCommunity();
      });
    });
    box.querySelectorAll('[data-cgroup]').forEach(function (b) {
      b.addEventListener('click', function () { state.communityGroup = b.getAttribute('data-cgroup'); state.communityShown = 20; drawCommunity(); });
    });
    box.querySelectorAll('[data-ctype]').forEach(function (b) {
      b.addEventListener('click', function () { state.communityType = b.getAttribute('data-ctype'); state.communityShown = 20; drawCommunity(); });
    });
    var sel = box.querySelector('#communityTarget');
    if (sel) sel.addEventListener('change', function () { state.communityTarget = sel.value; state.communityShown = 20; drawCommunity(); });
    var more = box.querySelector('[data-cmore]');
    if (more) more.addEventListener('click', function () { state.communityShown += 20; drawCommunity(); });
    var retry = box.querySelector('#retryCommunity');
    if (retry) retry.addEventListener('click', loadCommunity);
  }

  function bindMain() {
    var cbox = document.getElementById('communityBox');
    if (cbox) bindCommunity(cbox);
    main.querySelectorAll('[data-period]').forEach(function (b) {
      b.addEventListener('click', function () { state.period = b.getAttribute('data-period'); render(); });
    });
    main.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () { state.filter = b.getAttribute('data-filter'); render(); });
    });
    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEntryForm(findEntry(b.getAttribute('data-edit'))); });
    });
    main.querySelectorAll('[data-feature]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-feature');
        var rule = state.rules.filter(function (r) { return r.id === id; })[0];
        if (!rule) return;
        btn.disabled = true;
        G.setFeaturedBadge({ id: rule.id, name: rule.name, image: rule.image }).then(function () {
          G.toast('「' + rule.name + '」을 대표 배지로 정했어요.');
          render();
        }).catch(function (e) {
          btn.disabled = false;
          G.toast('저장하지 못했습니다. (' + (e.code || e.message) + ')', 'error');
        });
      });
    });
    main.querySelectorAll('[data-unfeature]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        G.setFeaturedBadge(null).then(function () { G.toast('대표 배지를 해제했어요.'); render(); })
          .catch(function (e) { btn.disabled = false; G.toast('해제하지 못했습니다. (' + (e.code || e.message) + ')', 'error'); });
      });
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { deleteEntry(findEntry(b.getAttribute('data-del'))); });
    });
  }

  // 배너·목록의 data-act 버튼 (이벤트 위임 — 배너는 main 밖이라 document에 건다)
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !state.profile || !state.profile.isMember) return;
    var act = el.getAttribute('data-act'), target = el.getAttribute('data-target') || '';
    if (act === 'checkin') openCheckin(target);
    else if (act === 'reflect') openEntryForm({ type: 'reflection', targetId: target });
    else if (act === 'practice') openEntryForm({ type: 'practice', targetId: target });
    else if (act === 'contrib') openEntryForm({ type: 'webinar_host' });
    else if (act === 'notify') openNotifySettings();
  });

  function findEntry(id) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return state.entries[i];
    return null;
  }

  // ---------- 참여 인증 (웨비나·나눔활동) ----------

  function openCheckin(webinarId) {
    var today = new Date();
    // 최근 7일 ~ 오늘 활동 중 아직 인증 안 한 것
    var choices = state.webinars.filter(function (w) {
      var d = G.toDate(w.date);
      return d && G.daysBetween(d, today) >= 0 && G.daysBetween(d, today) <= 7 && !hasAttend(w.id);
    });
    if (webinarId && !choices.some(function (w) { return w.id === webinarId; })) {
      var w0 = webinarById(webinarId);
      if (w0 && !hasAttend(w0.id)) choices.unshift(w0);
    }
    if (!choices.length) {
      G.openModal('<h3>참여 인증</h3><p class="g-muted">최근 7일 안에 인증할 수 있는 웨비나·나눔활동이 없어요. 이미 인증했거나 아직 등록되지 않은 활동일 수 있습니다.</p>' +
        '<div class="g-modal-actions"><button class="g-btn" data-close>닫기</button></div>');
      return;
    }
    var m = G.openModal('<h3>참여 인증</h3><form id="checkinForm">' +
      '<div class="g-field"><label class="g-label" for="ckW">활동</label><select class="g-select" id="ckW" name="webinar">' +
      choices.map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (w.id === webinarId ? ' selected' : '') + '>' + esc(G.fmtDate(w.date) + ' · [' + (w.category || '웨비나') + '] ' + w.title) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="g-field"><label class="g-label" for="ckC">인증 코드 <span class="g-muted">(진행자가 안내한 숫자 6자리)</span></label>' +
      '<input class="g-input" id="ckC" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="off"></div>' +
      '<div id="ckErr" class="g-error" style="display:none"></div>' +
      '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>취소</button><button type="submit" class="g-btn">인증하기</button></div></form>');
    var form = m.el.querySelector('#checkinForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      doCheckin(form.webinar.value, form.code.value.trim()).then(function (ok) {
        if (ok) m.close();
        else btn.disabled = false;
      }, function (err) {
        var box = form.querySelector('#ckErr');
        box.textContent = err;
        box.style.display = 'block';
        btn.disabled = false;
      });
    });
  }

  // 성공하면 true. 실패 사유는 reject(문구)
  function doCheckin(webinarId, code) {
    var p = state.profile;
    var docId = p.uid + '_attend_' + webinarId;
    var ref = G.db.collection('activityLog').doc(docId);
    return ref.get().then(function (snap) {
      if (snap.exists) {
        G.toast('이미 인증한 활동이에요.');
        return 'exists';
      }
      // 관리자는 규칙상 코드 대조 없이 기록이 만들어지므로, 회원과 같은 결과가 나오게 여기서 대조한다
      var adminCheck = p.isAdmin ? G.db.collection('webinarSecrets').doc(webinarId).get().then(function (s) {
        if (!s.exists || s.data().open !== true || s.data().code !== code) throw '인증 코드가 맞지 않거나 인증이 마감된 활동입니다.';
      }) : Promise.resolve();
      return adminCheck.then(function () {
        var found = webinarById(webinarId);
        if (found) return found;
        return loadWebinars().then(function (list) { state.webinars = list; return webinarById(webinarId); });
      }).then(function (w) {
        if (!w) throw '등록되지 않은 활동입니다.';
        return G.addLog(p, {
          type: G.attendTypeOf(w),
          status: 'auto',
          targetId: webinarId,
          targetTitle: w.title || '나눔활동',
          checkinCode: code,
          visibility: 'private'
        }, docId).then(function () { return 'new'; });
      });
    }).then(function (result) {
      return reloadQuiet().then(function () {
        if (result === 'new') {
          G.toast('참여 스탬프가 찍혔어요!');
          openEntryForm({ type: 'reflection', targetId: webinarId }, '인증 완료! 기억이 생생할 때 3분만 남겨 볼까요?');
        }
        return true;
      });
    }).catch(function (e) {
      if (typeof e === 'string') throw e;
      console.error('참여 인증 실패:', e);
      if (e && e.code === 'permission-denied') throw '인증 코드가 맞지 않거나 인증이 마감된 활동입니다.';
      throw '인증 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    });
  }

  // QR 링크로 들어온 경우 1회 자동 인증
  function handleCheckinLink() {
    var w = G.param('w'), c = G.param('c');
    if (!w || state.checkinDone) return;
    state.checkinDone = true;
    history.replaceState(null, '', location.pathname); // 새로고침 시 재시도 방지
    if (!c) { openCheckin(w); return; }
    doCheckin(w, c).catch(function (msg) {
      G.openModal('<h3>참여 인증</h3><div class="g-error">' + esc(msg) + '</div>' +
        '<div class="g-modal-actions"><button class="g-btn" data-close>닫기</button></div>');
    });
  }

  function reloadQuiet() {
    state.community = null; state.groupCommunity = null; // 공개 범위가 바뀌었을 수 있으니 모아보기도 다시 불러온다
    return G.loadLedger(state.profile.uid).then(function (entries) {
      state.entries = entries;
      render();
    });
  }

  // ---------- 성찰·실천·기여 기록 폼 ----------

  // 나만 보기는 두지 않는다(사용자 지시). 예전에 나만 보기로 남긴 기록을 고칠 때는 전체 공개가 선택된다.
  var VIS_OPTIONS = [['public', '전체 공개'], ['group', '소모임 공유']];

  function visField(cur, groupId) {
    if (cur !== 'group') cur = 'public';
    var groupSel = state.groups.length ?
      '<select class="g-select" name="groupId" style="margin-top:.5rem;display:' + (cur === 'group' ? 'block' : 'none') + '">' +
      state.groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select>' : '';
    return '<div class="g-field"><span class="g-label">공개 범위</span><div class="g-radio-row">' +
      VIS_OPTIONS.map(function (v) {
        var disabled = v[0] === 'group' && !state.groups.length;
        return '<label' + (disabled ? ' style="opacity:.45" title="소속 소모임이 없어요"' : '') + '><input type="radio" name="visibility" value="' + v[0] + '"' +
          (cur === v[0] ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' + v[1] + '</label>';
      }).join('') + '</div>' + groupSel +
      '<p class="g-muted g-small" style="margin-top:.35rem">학생 얼굴·이름·작품 등 개인정보가 들어가지 않게 해주세요.</p></div>';
  }

  function textField(name, label, value, placeholder, required) {
    return '<div class="g-field"><label class="g-label" for="f_' + name + '">' + label + (required ? ' *' : '') + '</label>' +
      '<textarea class="g-textarea" id="f_' + name + '" name="' + name + '" rows="2"' + (required ? ' required' : '') +
      ' placeholder="' + esc(placeholder || '') + '">' + esc(value || '') + '</textarea></div>';
  }

  function evidenceFields(list) {
    list = (list || []).slice(0, 3);
    while (list.length < 3) list.push({ url: '', label: '' });
    return '<div class="g-field"><span class="g-label">관련 링크 <span class="g-muted">(수업자료·사진 폴더·웹앱 등, 선택)</span></span>' +
      list.map(function (ev, i) {
        return '<div class="g-row" style="margin-bottom:.4rem"><input class="g-input" name="evLabel" placeholder="이름" value="' + esc(ev.label) + '" style="flex:1;min-width:120px">' +
          '<input class="g-input" name="evUrl" type="url" placeholder="https://" value="' + esc(ev.url) + '" style="flex:2;min-width:180px" aria-label="링크 ' + (i + 1) + '"></div>';
      }).join('') + '</div>';
  }

  var OTHER_TARGET = '__other'; // 나눔활동 밖에서 배운 것(직접 적기)

  // 성찰·실천 대상으로 고를 활동: 인증한 활동 → 신청한 활동 → 최근 14일 안의 활동. '직접 적기'는 맨 끝.
  function targetList(cur) {
    var seen = {}, list = [];
    function add(id, title, tag) {
      if (!id || seen[id]) return;
      seen[id] = 1;
      list.push({ id: id, title: title || '나눔활동', tag: tag });
    }
    var w0 = cur ? webinarById(cur) : null;
    if (w0) add(w0.id, w0.title, w0.category || '웨비나');
    attended().forEach(function (e) { add(e.targetId, e.title, '참여 인증'); });
    state.entries.forEach(function (e) { if (e.type === 'sharing_join') add(e.targetId, e.title, '신청'); });
    var today = new Date();
    state.webinars.forEach(function (w) {
      var d = G.toDate(w.date);
      if (d && G.daysBetween(d, today) >= 0 && G.daysBetween(d, today) <= 14) add(w.id, w.title, w.category || '웨비나');
    });
    return list;
  }

  function targetTitleOf(id) {
    var hit = targetList().filter(function (x) { return x.id === id; })[0];
    return hit ? hit.title : '';
  }

  function targetOptions(cur) {
    var list = targetList(cur);
    var sel = cur && list.some(function (x) { return x.id === cur; }) ? cur : (list[0] ? list[0].id : OTHER_TARGET);
    return list.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>[' + esc(x.tag) + '] ' + esc(x.title) + '</option>';
    }).join('') + '<option value="' + OTHER_TARGET + '"' + (sel === OTHER_TARGET ? ' selected' : '') + '>그 밖의 배움 (직접 적기)</option>';
  }

  /**
   * entry: 새 기록이면 { type, targetId }, 수정이면 원장 항목 전체
   */
  function openEntryForm(entry, lead) {
    if (!entry) return;
    var isEdit = !!entry.id;
    var a = entry.answers || {};
    var type = entry.type;
    var title, body = '';

    if (type === 'reflection') {
      title = isEdit ? '3분 성찰 수정' : '3분 디지털 성찰';
      body = (isEdit ? '' : '<div class="g-field"><label class="g-label" for="f_target">어떤 배움에 대한 성찰인가요?</label><select class="g-select" id="f_target" name="targetId">' + targetOptions(entry.targetId) + '</select></div>' +
        '<div class="g-field" id="f_otherBox" style="display:none"><label class="g-label" for="f_other">어떤 배움이었나요? *</label>' +
        '<input class="g-input" id="f_other" name="otherTitle" maxlength="120" placeholder="예: 학교 자체 AI 연수, 책 『AI 시대의 수업』"></div>') +
        textField('learned', '오늘 새롭게 알게 된 것은 무엇인가요?', a.learned, '한두 문장이면 충분해요', true) +
        textField('apply', '내 수업이나 업무에 적용해 볼 것은 무엇인가요?', a.apply, '') +
        textField('record', '적용한 결과나 자료를 나중에 어떻게 남길까요?', a.record, '예: 활동지 사진을 실천 기록에 올리기');
    } else if (type === 'practice') {
      title = isEdit ? '실천 기록 수정' : '실천 후속 기록';
      body = (isEdit ? '' : '<div class="g-field"><label class="g-label" for="f_target">무엇을 적용했나요?</label><select class="g-select" id="f_target" name="targetId">' + targetOptions(entry.targetId) + '</select></div>' +
        '<div class="g-field"><label class="g-label" for="f_title">기록 제목</label><input class="g-input" id="f_title" name="title" placeholder="예: 5학년 사회 수업에 퀴즈 웹앱 적용"></div>') +
        '<div class="g-field"><span class="g-label">실제 적용 여부 *</span><div class="g-radio-row">' +
        [['yes', '적용함'], ['partly', '일부 적용'], ['no', '아직 못 함']].map(function (o) {
          return '<label><input type="radio" name="applied" value="' + o[0] + '" required' + (a.applied === o[0] ? ' checked' : '') + '>' + o[1] + '</label>';
        }).join('') + '</div></div>' +
        '<div class="g-field"><label class="g-label" for="f_gs">활용한 학년·교과</label><input class="g-input" id="f_gs" name="gradeSubject" value="' + esc(a.gradeSubject || '') + '" placeholder="예: 5학년 사회"></div>' +
        textField('good', '잘된 점', a.good) + textField('hard', '어려웠던 점', a.hard) + textField('next', '다음에 바꾸고 싶은 점', a.next) +
        evidenceFields(entry.evidence);
    } else {
      title = isEdit ? '기록 수정' : '발표·진행 / 소모임 프로젝트 신청';
      body = (isEdit ? '' :
        '<div class="g-notice" style="margin-bottom:1rem">나눔활동에서 직접 개설한 웨비나·모임은 개설 기록이 자동으로 반영돼 신청하지 않아도 돼요. 나눔활동으로 열지 않은 발표·진행이나 소모임 프로젝트만 신청해주세요.</div>' +
        '<div class="g-field"><span class="g-label">종류 *</span><div class="g-radio-row">' +
        '<label><input type="radio" name="type" value="webinar_host" checked>웨비나 발표·진행</label>' +
        '<label><input type="radio" name="type" value="group_project">소모임 프로젝트</label></div></div>' +
        '<div class="g-field"><label class="g-label" for="f_title">제목 *</label><input class="g-input" id="f_title" name="title" required placeholder="예: 9월 디지털 수업실천 웨비나 발표"></div>') +
        textField('note', '내용', a.note, '무엇을 했는지 짧게 적어주세요') +
        evidenceFields(entry.evidence) +
        (isEdit ? '' : '<p class="g-muted g-small">운영진 확인 후 스탬프와 배지에 반영됩니다.</p>');
    }

    var m = G.openModal('<h3>' + esc(title) + '</h3>' +
      (lead ? '<div class="g-notice" style="margin-bottom:1rem">' + esc(lead) + '</div>' : '') +
      '<form id="entryForm">' + body + visField(entry.visibility || 'private', entry.groupId) +
      '<div id="entryErr" class="g-error" style="display:none"></div>' +
      '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>' + (lead ? '나중에' : '취소') + '</button>' +
      '<button type="submit" class="g-btn">저장</button></div></form>');

    var form = m.el.querySelector('#entryForm');
    // '그 밖의 배움'을 고르면 무엇을 배웠는지 적는 칸을 연다(성찰 폼)
    var targetSel = form.querySelector('#f_target'), otherBox = form.querySelector('#f_otherBox');
    function syncOther() {
      if (!targetSel || !otherBox) return;
      var on = targetSel.value === OTHER_TARGET;
      otherBox.style.display = on ? 'block' : 'none';
      otherBox.querySelector('input').required = on;
    }
    if (targetSel) targetSel.addEventListener('change', syncOther);
    syncOther();

    form.querySelectorAll('input[name=visibility]').forEach(function (r) {
      r.addEventListener('change', function () {
        var sel = form.querySelector('select[name=groupId]');
        if (sel) sel.style.display = form.visibility.value === 'group' ? 'block' : 'none';
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = G.formData(form);
      var btn = form.querySelector('[type=submit]');
      var err = form.querySelector('#entryErr');
      var answers = {};
      ['learned', 'apply', 'record', 'applied', 'gradeSubject', 'good', 'hard', 'next', 'note'].forEach(function (k) {
        if (typeof d[k] === 'string' && d[k]) answers[k] = d[k].slice(0, 2000);
      });
      var labels = [].concat(d.evLabel || []), urls = [].concat(d.evUrl || []);
      var evidence = [];
      for (var i = 0; i < urls.length; i++) {
        if (!urls[i]) continue;
        if (!G.safeUrl(urls[i])) { err.textContent = 'https:// 로 시작하는 링크만 넣을 수 있어요.'; err.style.display = 'block'; return; }
        evidence.push({ url: urls[i], label: (labels[i] || '').slice(0, 60) });
      }
      var visibility = d.visibility === 'group' ? 'group' : 'public';
      var groupId = visibility === 'group' ? (d.groupId || '') : '';
      btn.disabled = true;

      var job;
      if (isEdit) {
        job = G.db.collection('activityLog').doc(entry.id).update({
          answers: answers, evidence: evidence, visibility: visibility, groupId: groupId, updatedAt: G.FV.serverTimestamp()
        });
      } else {
        var newType = type === 'webinar_host' ? (d.type || 'webinar_host') : type;
        var targetId = d.targetId === OTHER_TARGET ? '' : (d.targetId || '');
        var targetTitle = d.otherTitle || d.title || (targetId ? targetTitleOf(targetId) : '');
        if (!targetTitle && newType === 'reflection') targetTitle = '3분 성찰';
        if (!targetTitle && newType === 'practice') targetTitle = '실천 기록';
        job = G.addLog(state.profile, {
          type: newType,
          status: R.NEEDS_REVIEW.indexOf(newType) !== -1 ? 'pending' : 'auto',
          targetId: targetId,
          targetTitle: targetTitle.slice(0, 120),
          answers: answers, evidence: evidence, visibility: visibility, groupId: groupId
        });
      }
      job.then(function () {
        m.close();
        G.toast(isEdit ? '수정했어요.' : (R.NEEDS_REVIEW.indexOf(type) !== -1 || d.type === 'group_project' ? '신청했어요. 운영진 확인 후 반영됩니다.' : '기록했어요!'));
        return reloadQuiet();
      }).catch(function (ex) {
        console.error('기록 저장 실패:', ex);
        err.textContent = '저장하지 못했습니다. (' + (ex.code || ex.message) + ')';
        err.style.display = 'block';
        btn.disabled = false;
      });
    });
  }

  function deleteEntry(entry) {
    if (!entry) return;
    var msg = R.ATTEND_TYPES.indexOf(entry.type) !== -1 ?
      '참여 인증을 삭제하면 참여 스탬프도 사라지고, 인증이 마감된 뒤에는 다시 인증할 수 없어요. 삭제할까요?' :
      '이 기록을 삭제할까요? 되돌릴 수 없어요.';
    G.confirmModal(msg, '삭제').then(function (ok) {
      if (!ok) return;
      G.db.collection('activityLog').doc(entry.id).delete().then(function () {
        G.toast('삭제했어요.');
        return reloadQuiet();
      }).catch(function (e) {
        G.toast('삭제하지 못했습니다. (' + (e.code || e.message) + ')', 'error');
      });
    });
  }

  // ---------- 알림 설정 ----------
  // 기기마다 fcm_tokens/{토큰} 문서가 하나씩 있고, uid로 내 기기들을 찾아 구독 항목을 함께 바꾼다.

  var VAPID_KEY = 'BKlQ4qeoh17M93lKA6xST-9zoXO5XJ4Q4SfyPVCbgOidT4zeybU_d9Znd0NuiCHnbtWYI5q9Erig927u_sVkpRc';
  var SUBS = [
    ['growth', '성장패스', '신청한 나눔활동의 참여 인증 시작 · 기록 승인 결과 · 실천 기록 권유'],
    ['sharing', '나눔활동', '새 나눔활동 개설'],
    ['resources', '자료공유', '새 자료 등록'],
    ['diary', '교단일기', '새 교단일기'],
    ['events', '대외행사', '새 대외행사'],
    ['training', '월별연수', '새 월별연수']
  ];

  function defaultSubs() {
    var o = {};
    SUBS.forEach(function (x) { o[x[0]] = true; });
    return o;
  }

  function localToken() {
    try { return localStorage.getItem('fcm_token') || ''; } catch (e) { return ''; }
  }

  function myTokens() {
    return G.db.collection('fcm_tokens').where('uid', '==', state.profile.uid).get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .filter(function (t) { return t.isActive !== false; });
    });
  }

  function loadMessaging() {
    if (typeof firebase.messaging === 'function') return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js';
      el.onload = resolve;
      el.onerror = function () { reject('알림 기능을 불러오지 못했어요. 네트워크를 확인해주세요.'); };
      document.head.appendChild(el);
    });
  }

  // 이 기기에서 알림 받기: 권한 → 서비스 워커 → 토큰 → fcm_tokens 저장(규칙: uid가 본인이어야 함)
  function enableThisDevice(subs) {
    if (Notification.permission === 'denied') {
      return Promise.reject('이 브라우저에서 G-DEAL 알림이 차단돼 있어요. 주소창 왼쪽 아이콘 → 알림 → 허용으로 바꾼 뒤 다시 눌러주세요.');
    }
    var uid = state.profile.uid;
    return loadMessaging().then(function () {
      return Promise.resolve(firebase.messaging.isSupported());
    }).then(function (ok) {
      if (!ok) throw '이 브라우저는 웹 알림을 지원하지 않아요.';
      return Notification.requestPermission();
    }).then(function (perm) {
      if (perm !== 'granted') throw '알림 권한을 허용해야 알림을 받을 수 있어요.';
      return navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; });
    }).then(function (reg) {
      return firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    }).then(function (token) {
      if (!token) throw '알림 토큰을 받지 못했어요. 잠시 후 다시 시도해주세요.';
      var ref = G.db.collection('fcm_tokens').doc(token);
      return ref.get().then(function (snap) {
        var ua = navigator.userAgent;
        var data = {
          token: token, uid: uid, isActive: true, subscriptions: subs,
          platform: /iPad|iPhone|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'web',
          userAgent: ua, updatedAt: G.FV.serverTimestamp()
        };
        if (!snap.exists) data.createdAt = G.FV.serverTimestamp();
        return ref.set(data, { merge: true });
      }).then(function () {
        try { localStorage.setItem('fcm_token', token); localStorage.setItem('fcm_subscribed', 'true'); } catch (e) {}
      });
    });
  }

  function openNotifySettings() {
    var m = G.openModal('<h3>알림 설정</h3><div id="ntBody">' + G.loadingHtml() + '</div>' +
      '<div class="g-modal-actions"><button class="g-btn secondary" data-close>닫기</button></div>');
    var box = m.el.querySelector('#ntBody');

    function draw() {
      myTokens().then(function (tokens) {
        var subs = Object.assign(defaultSubs(), tokens[0] && tokens[0].subscriptions);
        var supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
        var local = localToken();
        var here = supported && Notification.permission === 'granted' && tokens.some(function (t) { return t.id === local; });
        var ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        var device = !supported ?
          '<p class="g-muted">' + (ios ? '아이폰·아이패드는 Safari 공유 버튼 → 「홈 화면에 추가」로 설치한 G-DEAL 앱에서 알림을 켤 수 있어요.' : '이 브라우저는 웹 알림을 지원하지 않아요.') + '</p>' :
          here ? '<span class="g-tag green">이 기기에서 알림을 받고 있어요</span>' :
          '<p class="g-muted" style="margin-bottom:.6rem">이 기기는 아직 알림이 꺼져 있어요. 누르면 브라우저가 알림 허용을 물어봐요.</p>' +
          '<button type="button" class="g-btn" id="ntEnable">이 기기에서 알림 받기</button>';

        box.innerHTML =
          '<div class="g-card" style="background:#f9fafb"><div style="font-weight:700;margin-bottom:.4rem">이 기기</div>' + device + '</div>' +
          '<form id="ntForm" style="margin-top:1rem"><div class="g-label">받을 알림 <span class="g-muted">' +
          (tokens.length ? '(알림을 켠 기기 ' + tokens.length + '대에 함께 적용)' : '(먼저 기기에서 알림을 켜 주세요)') + '</span></div>' +
          SUBS.map(function (x) {
            return '<label class="g-check" style="display:flex;align-items:flex-start;margin:.55rem 0">' +
              '<input type="checkbox" name="sub" value="' + x[0] + '"' + (subs[x[0]] ? ' checked' : '') + (tokens.length ? '' : ' disabled') + ' style="margin-top:.2rem">' +
              '<span><b>' + esc(x[1]) + '</b> <span class="g-muted g-small">' + esc(x[2]) + '</span></span></label>';
          }).join('') +
          '<div id="ntErr" class="g-error" style="display:none"></div>' +
          '<button type="submit" class="g-btn secondary"' + (tokens.length ? '' : ' disabled') + '>설정 저장</button></form>';

        var err = box.querySelector('#ntErr');
        function showErr(msg) { err.textContent = msg; err.style.display = 'block'; }
        function picked() {
          var o = {};
          box.querySelectorAll('input[name=sub]').forEach(function (c) { o[c.value] = c.checked; });
          return o;
        }

        var enable = box.querySelector('#ntEnable');
        if (enable) enable.addEventListener('click', function () {
          enable.disabled = true;
          enableThisDevice(tokens.length ? picked() : defaultSubs()).then(function () {
            G.toast('이 기기에서 알림을 받아요.');
            draw();
          }).catch(function (e) {
            console.error('알림 켜기 실패:', e);
            enable.disabled = false;
            showErr(typeof e === 'string' ? e : '알림을 켜지 못했습니다. (' + (e.code || e.message) + ')');
          });
        });

        box.querySelector('#ntForm').addEventListener('submit', function (e) {
          e.preventDefault();
          var btn = e.target.querySelector('[type=submit]');
          var val = picked();
          var b = G.db.batch();
          tokens.forEach(function (t) {
            b.update(G.db.collection('fcm_tokens').doc(t.id), { subscriptions: val, updatedAt: G.FV.serverTimestamp() });
          });
          btn.disabled = true;
          b.commit().then(function () { G.toast('알림 설정을 저장했어요.'); btn.disabled = false; })
            .catch(function (ex) { btn.disabled = false; showErr('저장하지 못했습니다. (' + (ex.code || ex.message) + ')'); });
        });
      }).catch(function (e) {
        box.innerHTML = G.errorHtml('알림 설정을 불러오지 못했습니다. (' + (e.code || e.message) + ')');
      });
    }
    draw();
  }

  // ---------- 시작 ----------

  G.onUser(function (user, profile) {
    state.user = user;
    state.profile = profile;
    if (!user) { renderGuest(); return; }
    if (!profile.isMember) { renderNotMember(); return; }
    reload().then(handleCheckinLink);
  });
})();
