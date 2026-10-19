/**
 * 홈 맨 위 「제3회 지딜 한마당」 초대 배너 — 원본 소스 없는 Next 빌드 홈에 DOM으로 주입한다.
 * 한마당 사이트(hanmadang.peace.re.kr)의 초대장 카드를 옮겨 온 것으로,
 * 접수 단계·카운트다운·남은 자리는 한마당 Firestore(공개 읽기)를 REST로 읽어 같은 규칙으로 계산한다.
 * 행사가 끝나면(12.19 17:00) 저절로 사라진다.
 */
(function () {
  'use strict';

  var ID = 'gdeal-hanmadang-banner';
  var URL = 'https://hanmadang.peace.re.kr/#/';
  var END = new Date('2026-12-19T17:00:00+09:00');
  var FS = 'https://firestore.googleapis.com/v1/projects/gdeal-hanmadang/databases/(default)/documents/';
  var KEY = 'AIzaSyAm-uo720r9Lq4ZzbTgwVnCmrej6Yohf2w'; // 한마당 사이트에 공개된 웹 키
  if (new Date() >= END) return;

  var S = null, total = null, timer = null;

  function getDoc(path) {
    return fetch(FS + path + '?key=' + KEY).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { return d.fields || {}; });
  }
  function t(f) { return f && f.timestampValue ? new Date(f.timestampValue) : null; }
  function n(f) { return f && f.integerValue != null ? Number(f.integerValue) : null; }
  function md(d) { return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }); }
  function pad(x) { return ('0' + x).slice(-2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  // 한마당 사이트 phase()와 같은 규칙
  function phase(now) {
    if (!S) return 'unset';
    if (now < S.nanumStart) return 'before';
    if (now < S.baeumStart) return 'nanum';
    if (now < S.openStart) return 'baeum';
    if (now < S.closeAt) return 'open';
    return 'closed';
  }
  var STATUS = {
    before: ['나눔회원 접수가 곧 열려요', 'nanumStart', '나눔회원 접수 시작까지'],
    nanum: ['지금은 나눔회원 접수 중', 'baeumStart', '배움회원 접수 시작까지'],
    baeum: ['지금은 배움회원 접수 중 (나눔회원도 가능)', 'openStart', '모두 공개까지'],
    open: ['지금은 누구나 신청할 수 있어요'],
    closed: ['접수가 마감됐어요']
  };

  function dynamicHtml() {
    var ph = phase(new Date());
    if (ph === 'unset') return '';
    var order = ['nanum', 'baeum', 'open'], i = order.indexOf(ph);
    var steps = [['nanum', '나눔회원', 'nanumStart'], ['baeum', '배움회원', 'baeumStart'], ['open', '모두', 'openStart']].map(function (s, j) {
      var cls = ph === 'closed' || i > j ? 'done' : i === j ? 'on' : '';
      return '<div class="' + cls + '">' + s[1] + '<small>' + md(S[s[2]]) + '~</small></div>';
    }).join('');
    var st = STATUS[ph], cap = S.capacity || 300;
    var seats = total == null ? '' : total >= cap ? '자리가 모두 찼어요' : '남은 자리 ' + (cap - total) + ' / ' + cap;
    return '<div class="hm-phase">' + steps + '</div>' +
      '<div class="hm-status">' + st[0] + '</div>' +
      (st[1] ? '<div class="hm-cd-label">' + st[2] + '</div><div class="hm-cd" data-target="' + S[st[1]].getTime() + '"></div>' : '') +
      (seats ? '<div class="hm-seats">' + seats + '</div>' : '');
  }

  function html() {
    return '<a class="hm-card" href="' + URL + '" target="_blank" rel="noopener">' +
      '<div class="hm-inv">' +
        '<div class="hm-head"><div class="hm-eyebrow">G-DEAL · 제3회 지딜 한마당</div>' +
          '<div class="hm-to">부울경과 전국의 선생님께</div>' +
          '<div class="hm-title">지딜 한마당에<br>초대합니다</div>' +
          '<div class="hm-meta">2026. 12. 19. 토 · 09:00–17:00<br>' + esc((S && S.venueShort) || '마산대학교') + '</div></div>' +
        '<div class="hm-dyn">' + dynamicHtml() + '</div>' +
        '<div class="hm-cta"><span class="hm-btn">초대에 응하기 (탑승 수속)</span>' +
          '<div class="hm-from">초대한 사람들 · G-DEAL 운영진과 커뮤니티 선생님들</div></div>' +
      '</div></a>';
  }

  // 1초마다 카운트다운. 목표 시각을 지나면 다음 단계로 다시 그린다.
  function tick() {
    var el = document.getElementById(ID), cd = el && el.querySelector('.hm-cd');
    if (!cd) return;
    var ms = Number(cd.getAttribute('data-target')) - Date.now();
    if (ms <= 0) { el.querySelector('.hm-dyn').innerHTML = dynamicHtml(); return; }
    var d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    cd.innerHTML = (d ? '<div>' + d + '<small>일</small></div>' : '') +
      '<div>' + pad(h) + '<small>시간</small></div><div>' + pad(m) + '<small>분</small></div>' +
      (d ? '' : '<div>' + pad(s) + '<small>초</small></div>');
  }

  // 홈 본문 상자(성장패스 카드·최신 나눔활동이 든 곳) — 그 바깥 앞에 붙여 항상 맨 위에 오게 한다
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
    if (document.getElementById(ID)) return;
    var box = anchor();
    if (!box) return;
    var el = document.createElement('div');
    el.id = ID;
    el.innerHTML = html();
    box.parentElement.insertBefore(el, box);
    tick();
  }

  // 사이트 전역 * { font-family: Paperlogy !important } 를 이기려고 세리프 제목에만 !important
  var CSS =
    '#' + ID + '{padding:2rem 1.5rem 0}' +
    '#' + ID + ' .hm-card{display:block;text-decoration:none;color:#14402A;border-radius:1rem;padding:1.4rem;' +
      'background:#1E5B3C;background:linear-gradient(160deg,#1E5B3C 0%,#2b7a52 55%,#45AF76 100%);box-shadow:0 8px 24px rgba(20,64,42,.18);transition:transform .2s}' +
    '#' + ID + ' .hm-card:hover{transform:translateY(-2px)}' +
    '#' + ID + ' .hm-inv{position:relative;background:#FBF6E9;border-radius:.4rem;padding:1.4rem 1.2rem;text-align:center;' +
      'display:grid;gap:1rem;align-items:center;font-weight:500;line-height:1.5}' +
    '#' + ID + ' .hm-inv::before{content:"";position:absolute;inset:7px;border:1px solid #C9A24A;border-radius:3px;pointer-events:none}' +
    '#' + ID + ' .hm-eyebrow{font-family:"Gowun Batang",serif!important;letter-spacing:.15em;font-size:.75rem;color:#a07f2f}' +
    '#' + ID + ' .hm-to{font-family:"Gowun Batang",serif!important;font-size:.9rem;color:#6b5a2e;margin-top:.3rem}' +
    '#' + ID + ' .hm-title{font-family:"Gowun Batang",serif!important;font-weight:700;font-size:1.7rem;line-height:1.3;margin:.3rem 0 .5rem}' +
    '#' + ID + ' .hm-meta{font-size:.9rem;color:#3d5a4a}' +
    '#' + ID + ' .hm-phase{display:flex;gap:5px;margin-bottom:.6rem}' +
    '#' + ID + ' .hm-phase div{flex:1;border-radius:9px;padding:6px 2px;font-size:.78rem;font-weight:700;background:#ece6d5;color:#7a6f52;line-height:1.3}' +
    '#' + ID + ' .hm-phase small{display:block;font-weight:500;font-size:.7rem}' +
    '#' + ID + ' .hm-phase .on{background:#45AF76;color:#fff}' +
    '#' + ID + ' .hm-phase .done{background:#dfe9e2;color:#6b8577}' +
    '#' + ID + ' .hm-status{font-weight:700;font-size:.95rem}' +
    '#' + ID + ' .hm-cd-label{font-size:.8rem;color:#5b7566}' +
    '#' + ID + ' .hm-cd{display:flex;justify-content:center;gap:6px;margin:.4rem 0}' +
    '#' + ID + ' .hm-cd div{background:#1E5B3C;color:#fff;border-radius:8px;padding:5px 9px;font-size:1.15rem;font-weight:700;line-height:1.1;min-width:50px;font-variant-numeric:tabular-nums}' +
    '#' + ID + ' .hm-cd small{display:block;font-size:.65rem;font-weight:500;opacity:.85}' +
    '#' + ID + ' .hm-seats{font-size:.82rem;color:#5b7566}' +
    '#' + ID + ' .hm-btn{display:block;background:#45AF76;color:#fff;font-weight:800;border-radius:12px;padding:.85rem;font-size:1rem}' +
    '#' + ID + ' .hm-card:hover .hm-btn{background:#3a9a66}' +
    '#' + ID + ' .hm-from{font-size:.75rem;color:#7a6f52;margin-top:.6rem}' +
    '@media (min-width:1024px){#' + ID + ' .hm-inv{grid-template-columns:1.1fr 1.2fr 1fr;gap:2rem;padding:1.6rem 2rem}}';

  function start() {
    if (!anchor()) return false;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    // 제목 글꼴은 쓰는 글자만 받는다(text= 부분 집합)
    var f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap&text=' +
      encodeURIComponent('G-DEAL·제3회지딜한마당부울경과전국의선생님께에초대합니다');
    document.head.appendChild(f);

    Promise.all([getDoc('settings/main'), getDoc('counters/main')]).then(function (r) {
      var s = r[0];
      S = { nanumStart: t(s.nanumStart), baeumStart: t(s.baeumStart), openStart: t(s.openStart), closeAt: t(s.closeAt),
        capacity: n(s.capacity), venueShort: s.venueShort && s.venueShort.stringValue };
      if (!S.nanumStart || !S.baeumStart || !S.openStart || !S.closeAt) S = null;
      total = n(r[1].total);
    }).catch(function (e) { console.warn('한마당 정보 조회 실패:', e); })
      .then(function () {
        mount();
        if (!timer) timer = setInterval(tick, 1000);
        // React가 본문을 다시 그리면 배너를 다시 붙인다
        new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
      });
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
