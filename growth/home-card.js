/**
 * 홈 「내 성장패스」 요약 카드 — 원본 소스 없는 Next 빌드 홈에 DOM으로 주입한다.
 * - 회원: 이번 학기 스탬프 4종 · 배지 현황과 가장 가까운 배지 · 오늘 참여 인증할 활동
 * - 비회원·승인 전: 성장패스 소개 한 줄
 * - 모두: 성장패스 점수판(접기 가능) — 이름은 로그인한 사용자에게만
 * 계산은 성장패스와 같은 /growth/rules.js · /growth/common.js 를 불러 쓴다(원장 합치기·배지 규칙 공유).
 * 로그인 상태는 compat Auth가 Next 번들과 같은 IndexedDB 세션을 읽어 알아낸다.
 */
(function () {
  'use strict';

  var CARD_ID = 'gdeal-growth-card';
  var cardPart = null; // 마지막으로 그린 카드 — React가 다시 그려 카드가 사라지면 다시 붙인다
  var board = null;    // 점수판 데이터 { named, uid, d }
  function fullHtml() { return cardPart + boardHtml(); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = function () { reject(new Error('로드 실패: ' + src)); };
      document.head.appendChild(el);
    });
  }

  // 홈 본문 맨 위(최신 나눔활동·교육활동 그리드 앞)
  function anchor() {
    var hs = document.querySelectorAll('h3');
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.trim() !== 'G-DEAL과 함께 성장하세요') continue;
      var cta = hs[i].closest('.mt-12');
      return cta && cta.parentElement;
    }
    return null;
  }

  function mount() {
    if (cardPart === null || document.getElementById(CARD_ID)) return;
    var box = anchor();
    if (!box) return;
    var el = document.createElement('div');
    el.id = CARD_ID;
    el.className = 'g-page';
    el.style.marginBottom = '2rem';
    el.innerHTML = fullHtml();
    box.insertBefore(el, box.firstChild);
  }

  function paint(h, b) {
    cardPart = h;
    board = b || null;
    var el = document.getElementById(CARD_ID);
    if (el) el.innerHTML = fullHtml();
    else mount();
  }

  // ---------- 성장패스 점수판 (Cloud Function이 30분마다 계산해 둔 leaderboard 문서) ----------
  var BOARD_ID = 'gdeal-growth-board', BOARD_OPEN_KEY = 'gdeal:boardOpen', BOARD_VIEW_KEY = 'gdeal:boardView';

  function pref(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // 로그인하면 이름이 든 members, 아니면 이름 없는 public (규칙도 같은 기준으로 막는다)
  function loadBoard(G, user) {
    var col = G.db.collection('leaderboard');
    var named = user ? col.doc('members').get().catch(function () { return null; }) : Promise.resolve(null);
    return named.then(function (s) {
      if (s && s.exists) return { named: true, uid: user.uid, d: s.data() };
      return col.doc('public').get().then(function (p) { return p.exists ? { named: false, uid: null, d: p.data() } : null; });
    }).catch(function (e) { console.warn('점수판 조회 실패:', e); return null; });
  }

  function boardHtml() {
    var G = window.G;
    if (!board || !G) return '';
    var esc = G.esc, R = G.R, d = board.d;
    var view = pref(BOARD_VIEW_KEY, 'all') === 'term' ? 'term' : 'all';
    var list = (d.boards && d.boards[view]) || [];
    var top = list.slice(0, 10);
    var mine = board.uid ? list.filter(function (x) { return x.uid === board.uid; })[0] : null;

    function row(x) {
      var me = !!mine && x.uid === mine.uid;
      var who = board.named ?
        esc(x.name) + (me ? ' <span class="g-tag green">나</span>' : '') + (x.featured ? '<div class="g-board-sub">' + esc(x.featured) + '</div>' : '') :
        '<span class="g-board-hidden">로그인하면 보여요</span>';
      var stamps = ['join', 'reflect', 'practice', 'share'].map(function (k) {
        return '<span style="color:' + R.STAMPS[k].color + '">' + esc(R.STAMPS[k].label) + ' ' + Number((x.stamps || {})[k] || 0) + '</span>';
      }).join('');
      return '<li class="g-board-row' + (me ? ' me' : '') + '">' +
        '<span class="g-board-rank r' + Math.min(Number(x.rank) || 4, 4) + '">' + Number(x.rank) + '</span>' +
        '<span class="g-board-who">' + who + '</span>' +
        '<span class="g-board-stamps">' + stamps + '</span>' +
        '<span class="g-board-badges">배지 ' + Number(x.badges || 0) + '</span>' +
        '<span class="g-board-score">' + Number(x.score) + '<small>점</small></span></li>';
    }

    var body = top.length ?
      '<ol class="g-board-list">' + top.map(row).join('') + '</ol>' +
        (mine && top.indexOf(mine) === -1 ? '<div class="g-board-gap">⋮</div><ol class="g-board-list">' + row(mine) + '</ol>' : '') :
      '<div class="g-empty">' + (view === 'term' ? '이번 학기 기록이 아직 없어요.' : '아직 기록이 없어요.') + '</div>';
    var at = G.toDate(d.updatedAt);
    var when = at ? ' · ' + G.fmtDate(at) + ' ' + ('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2) + ' 기준(30분마다 갱신)' : '';

    // 기본은 접힘('0') — 홈 첫 화면을 점수판이 차지하지 않게. 펼쳐 둔 회원은 저장값이 그대로 이긴다.
    return '<details class="g-card g-board" id="' + BOARD_ID + '"' + (pref(BOARD_OPEN_KEY, '0') === '1' ? ' open' : '') + '>' +
      '<summary class="g-board-summary"><span>성장패스 점수판</span></summary>' +
      '<div class="g-chips" style="margin:.75rem 0">' + [['all', '전체 누적'], ['term', d.term || '이번 학기']].map(function (v) {
        return '<button type="button" class="g-chip' + (view === v[0] ? ' on' : '') + '" data-board-view="' + v[0] + '">' + esc(v[1]) + '</button>';
      }).join('') + '</div>' + body +
      '<p class="g-muted g-small" style="margin-top:.6rem">' +
      (board.named ? '' : '<a href="/growth/" style="color:#497e56;font-weight:600">로그인</a>하면 회원 이름이 보여요. ') +
      '스탬프 1개가 1점이고, 같은 점수면 배지가 많은 순서예요.' + when + '</p></details>';
  }

  // 탭 전환·접기 상태 기억 (카드가 다시 그려져도 유지)
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-board-view]');
    if (!b) return;
    setPref(BOARD_VIEW_KEY, b.getAttribute('data-board-view'));
    var el = document.getElementById(BOARD_ID);
    if (el) el.outerHTML = boardHtml();
  });
  // toggle은 버블링되지 않아 캡처 단계에서 받는다
  document.addEventListener('toggle', function (e) {
    if (e.target && e.target.id === BOARD_ID) setPref(BOARD_OPEN_KEY, e.target.open ? '1' : '0');
  }, true);

  function guestHtml(G) {
    return '<div class="g-card" style="border-color:#bbdfc6;background:#f7fbf8;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem">' +
      '<div><div style="font-weight:700;font-size:1.05rem;color:#14532d">GDEAL 성장패스</div>' +
      '<div class="g-muted">나눔활동 신청과 QR 참여 인증, 성찰·실천 기록이 스탬프와 배지로 쌓여요.</div></div>' +
      '<a class="g-btn" href="/growth/">성장패스 둘러보기</a></div>';
  }

  function memberHtml(G, d) {
    var R = G.R, esc = G.esc, now = new Date(), today = G.ymd(now);
    var counts = R.stampCounts(d.entries, 'term', now);
    var badges = R.evaluateBadges(d.rules, d.entries, d.grants, now);
    var earned = badges.filter(function (b) { return b.earned; }).length;
    var next = badges.filter(function (b) { return !b.earned; }).sort(function (a, b) { return b.ratio - a.ratio; })[0];
    var attended = {};
    d.entries.forEach(function (e) { if (R.ATTEND_TYPES.indexOf(e.type) !== -1) attended[e.targetId] = true; });
    var todays = d.webinars.filter(function (w) { return w.date === today && !attended[w.id] && w.status !== '종료'; });

    var badgeBox = '<div style="font-weight:700;margin-bottom:.35rem">배지 ' + earned + ' / ' + badges.length + '</div>' +
      (next ? '<div class="g-muted">가장 가까운 배지 · <b style="color:#374151">' + esc(next.rule.name) + '</b> ' + Math.round(next.ratio * 100) + '%</div>' +
        '<div class="g-progress"><span style="width:' + Math.round(next.ratio * 100) + '%"></span></div>' : '<div class="g-muted">모든 배지를 모았어요!</div>');
    var todayBox = '<div style="font-weight:700;margin-bottom:.35rem">오늘 참여 인증</div>' + (todays.length ?
      todays.slice(0, 3).map(function (w) {
        return '<div class="g-row" style="justify-content:space-between;gap:.5rem;margin-bottom:.35rem"><span style="min-width:0"><span class="g-tag blue">' + esc(w.category || '웨비나') + '</span>' + esc(w.title) + '</span>' +
          '<a class="g-btn small" href="/growth/?w=' + encodeURIComponent(w.id) + '">인증하기</a></div>';
      }).join('') : '<div class="g-muted">오늘 인증할 활동이 없어요.</div>');

    return '<div class="g-card" style="border-color:#bbdfc6">' +
      '<div class="g-card-title"><span>내 성장패스 <span class="g-muted" style="font-weight:500">' + esc(R.termLabel(R.termOf(now))) + '</span></span>' +
      '<a class="g-btn small" href="/growth/">성장패스 열기</a></div>' +
      G.stampsHtml(counts) +
      '<div class="g-grid cols-2" style="margin-top:1rem">' +
      '<div class="g-card" style="background:#f9fafb">' + badgeBox + '</div>' +
      '<div class="g-card" style="background:#f9fafb">' + todayBox + '</div></div></div>';
  }

  function start() {
    if (!anchor()) return false;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/growth/growth.css';
    document.head.appendChild(css);

    var ready = window.gdealLoadFirebase ? window.gdealLoadFirebase(['auth', 'firestore']) : Promise.reject(new Error('fcm-client.js 로더 없음'));
    ready.then(function () { return window.GrowthRules ? null : loadScript('/growth/rules.js'); })
      .then(function () { return window.G ? null : loadScript('/growth/common.js'); })
      .then(function () {
        var G = window.G;
        G.onUser(function (user, profile) {
          var boardJob = loadBoard(G, user);
          if (!user || !profile || !profile.isMember) { boardJob.then(function (b) { paint(guestHtml(G), b); }); return; }
          Promise.all([G.loadLedger(profile.uid), G.loadBadgeRules(), G.loadGrants(profile.uid), G.loadWebinarList(), boardJob]).then(function (r) {
            paint(memberHtml(G, { entries: r[0], rules: r[1], grants: r[2], webinars: r[3] }), r[4]);
          }).catch(function (e) {
            console.warn('성장패스 카드 계산 실패:', e);
            boardJob.then(function (b) { paint(guestHtml(G), b); });
          });
        });
      })
      .catch(function (e) { console.warn('성장패스 카드 로드 실패:', e); });

    // React가 본문을 다시 그리면 카드를 다시 붙인다
    new MutationObserver(function () {
      if (cardPart !== null && !document.getElementById(CARD_ID)) mount();
    }).observe(document.body, { childList: true, subtree: true });
    return true;
  }

  // 하이드레이션 뒤 본문이 생길 때까지 잠깐 기다린다
  var tries = 0;
  function tryStart() {
    if (start()) return;
    if (++tries < 25) setTimeout(tryStart, 400);
  }
  if (document.readyState === 'complete') setTimeout(tryStart, 300);
  else window.addEventListener('load', function () { setTimeout(tryStart, 300); });
})();
