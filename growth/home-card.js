/**
 * 홈 「내 성장패스」 요약 카드 — 원본 소스 없는 Next 빌드 홈에 DOM으로 주입한다.
 * - 회원: 이번 학기 스탬프 4종 · 배지 현황과 가장 가까운 배지 · 오늘 참여 인증할 활동
 * - 비회원·승인 전: 성장패스 소개 한 줄
 * 계산은 성장패스와 같은 /growth/rules.js · /growth/common.js 를 불러 쓴다(원장 합치기·배지 규칙 공유).
 * 로그인 상태는 compat Auth가 Next 번들과 같은 IndexedDB 세션을 읽어 알아낸다.
 */
(function () {
  'use strict';

  var CARD_ID = 'gdeal-growth-card';
  var html = null; // 마지막으로 그린 내용 — React가 다시 그려 카드가 사라지면 다시 붙인다

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
    if (html === null || document.getElementById(CARD_ID)) return;
    var box = anchor();
    if (!box) return;
    var el = document.createElement('div');
    el.id = CARD_ID;
    el.className = 'g-page';
    el.style.marginBottom = '2rem';
    el.innerHTML = html;
    box.insertBefore(el, box.firstChild);
  }

  function paint(h) {
    html = h;
    var el = document.getElementById(CARD_ID);
    if (el) el.innerHTML = h;
    else mount();
  }

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
          if (!user || !profile || !profile.isMember) { paint(guestHtml(G)); return; }
          Promise.all([G.loadLedger(profile.uid), G.loadBadgeRules(), G.loadGrants(profile.uid), G.loadWebinarList()]).then(function (r) {
            paint(memberHtml(G, { entries: r[0], rules: r[1], grants: r[2], webinars: r[3] }));
          }).catch(function (e) {
            console.warn('성장패스 카드 계산 실패:', e);
            paint(guestHtml(G));
          });
        });
      })
      .catch(function (e) { console.warn('성장패스 카드 로드 실패:', e); });

    // React가 본문을 다시 그리면 카드를 다시 붙인다
    new MutationObserver(function () {
      if (html !== null && !document.getElementById(CARD_ID)) mount();
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
