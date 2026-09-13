/**
 * G-DEAL 성장패스 공용 모듈 (window.G)
 * - Firebase 초기화, 로그인·회원 프로필
 * - 사이트 공통 사이드바/헤더/푸터 셸
 * - 활동 기록 원장 읽기: 새 원장(activityLog) + 기존 교단일기·자료공유·나눔활동을 같은 모양으로 합친다
 * - 이스케이프·토스트·모달·CSV 등 작은 도구
 * 필요 스크립트 순서: firebase compat(app·auth·firestore) → /growth/rules.js → /growth/common.js
 */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: 'AIzaSyBJsqUJK1AjhrLNzIY_79dIR2Mlg7zD09w',
    authDomain: 'gdeal-page-a67e2.firebaseapp.com',
    projectId: 'gdeal-page-a67e2',
    storageBucket: 'gdeal-page-a67e2.firebasestorage.app',
    messagingSenderId: '654155447220',
    appId: '1:654155447220:web:be9c45c91314842d0150e1'
  };
  try { firebase.app(); } catch (e) { firebase.initializeApp(firebaseConfig); }

  var auth = firebase.auth();
  var db = firebase.firestore();
  var FV = firebase.firestore.FieldValue;
  var R = window.GrowthRules;

  // ---------- 작은 도구 ----------

  // 텍스트·속성값 어디에 넣어도 안전하도록 따옴표까지 이스케이프
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 사용자가 넣은 링크는 http(s)만 허용 (javascript: 등 차단)
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
  }
  function toDate(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var p = v.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]); // 날짜 문자열은 현지 자정으로
    }
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { d = toDate(d); return d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : ''; }
  function fmtDate(d) { d = toDate(d); return d ? d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) : ''; }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function randomCode(len) {
    var a = new Uint32Array(len || 6), s = '';
    crypto.getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += String(a[i] % 10);
    return s;
  }
  function daysBetween(a, b) { return Math.floor((toDate(b) - toDate(a)) / 86400000); }

  var toastEl = null, toastTimer = null;
  function toast(msg, type) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'g-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = 'g-toast' + (type === 'error' ? ' error' : '');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  // 모달: 바깥(배경) 클릭·Esc·data-close 요소로 닫힌다(나눔활동·기존 탭과 같게).
  // 작성 중인 입력이 있으면 바깥 클릭·Esc로 닫기 전에 한 번 묻는다(내용 보호).
  function formDirty(root) {
    return Array.prototype.some.call(root.querySelectorAll('input, textarea, select'), function (el) {
      if (el.type === 'hidden' || el.readOnly || el.disabled) return false;
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
      if (el.tagName === 'SELECT') {
        return Array.prototype.some.call(el.options, function (o) { return o.selected !== o.defaultSelected; });
      }
      return el.value !== el.defaultValue;
    });
  }

  function openModal(html, opts) {
    var back = document.createElement('div');
    back.className = 'g-modal-back';
    back.innerHTML = '<div class="g-modal' + (opts && opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    function close() {
      if (!back.parentNode) return;
      back.parentNode.removeChild(back);
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.g-modal-back')) document.body.style.overflow = '';
    }
    function softClose() {
      if (formDirty(back) && !window.confirm('작성 중인 내용이 사라져요. 닫을까요?')) return;
      close();
    }
    function onKey(e) {
      // 모달이 겹쳐 있으면 맨 위 모달만 닫는다
      var all = document.querySelectorAll('.g-modal-back');
      if (e.key === 'Escape' && all[all.length - 1] === back) softClose();
    }
    // 드래그로 글자를 고르다 배경에서 손을 떼는 경우는 닫지 않도록, 누른 곳과 뗀 곳이 모두 배경일 때만
    var downOnBack = false;
    back.addEventListener('mousedown', function (e) { downOnBack = e.target === back; });
    back.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target === back && downOnBack) softClose();
      downOnBack = false;
    });
    document.addEventListener('keydown', onKey);
    return { el: back.firstChild, close: close };
  }

  function confirmModal(message, okLabel) {
    return new Promise(function (resolve) {
      var m = openModal('<h3>확인</h3><p class="g-item-body">' + esc(message) + '</p>' +
        '<div class="g-modal-actions"><button class="g-btn secondary" data-close>취소</button>' +
        '<button class="g-btn" data-ok>' + esc(okLabel || '확인') + '</button></div>');
      m.el.querySelector('[data-close]').addEventListener('click', function () { resolve(false); });
      m.el.querySelector('[data-ok]').addEventListener('click', function () { m.close(); resolve(true); });
    });
  }

  // 수식 주입 방지(엑셀이 =, +, -, @로 시작하는 칸을 수식으로 해석)
  function downloadCsv(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function formData(form) {
    var out = {};
    new FormData(form).forEach(function (v, k) {
      if (out[k] === undefined) out[k] = typeof v === 'string' ? v.trim() : v;
      else out[k] = [].concat(out[k], typeof v === 'string' ? v.trim() : v);
    });
    return out;
  }

  // ---------- 셸 (사이드바·헤더·푸터) ----------

  var NAV_STYLE = 'display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;border-radius:0.5rem;font-weight:500;text-decoration:none;transition:all 0.2s ease-in-out;border:none;outline:none;';
  function icon(viewBox, paths) {
    return '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="' + viewBox + '" aria-hidden="true" height="1em" width="1em" style="font-size:1.125rem;flex-shrink:0;color:__C__">' +
      paths.map(function (d) { return '<path d="' + d + '"></path>'; }).join('') + '</svg>';
  }
  var NAV = [
    ['/home/', '홈', icon('0 0 20 20', ['M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z'])],
    ['/about/', '소개', icon('0 0 16 16', ['M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16', 'm8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0'])],
    ['/events/', '대외행사', icon('0 0 24 24', ['M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z'])],
    ['/growth/', '성장패스', icon('0 0 20 20', ['M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z'])],
    ['/sharing/', '나눔활동', icon('0 0 20 20', ['M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z'])],
    ['/resources/', '자료공유', icon('0 0 20 20', ['M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z'])],
    ['/diary/', '교단일기', icon('0 0 24 24', ['M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'])],
  ];
  var ICON_LOGOUT = '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>';

  function navHtml(active) {
    return NAV.map(function (n) {
      var on = active && n[0] === active;
      return '<a href="' + n[0] + '" style="' + NAV_STYLE + 'background-color:' + (on ? '#66ae7d' : 'transparent') + ';color:' + (on ? '#fff' : '#374151') + '">' +
        n[2].replace('__C__', on ? '#fff' : '#66ae7d') +
        '<span style="font-size:1rem;font-weight:500">' + n[1] + '</span></a>';
    }).join('');
  }

  /**
   * 페이지 뼈대를 body에 그리고 본문 컨테이너를 돌려준다.
   * opts: { active:'/growth/', title, subtitle, bare:true(사이드바 없이 — 공개 포트폴리오 등) }
   */
  function shell(opts) {
    opts = opts || {};
    var logo = '<a class="flex items-center justify-center mb-2" href="/home/"><img src="/G-DEAL_green.svg" alt="G-DEAL 로고" class="w-40 h-40" style="object-fit:contain;object-position:center;margin-top:-16%;margin-bottom:-16%"/></a>';
    var banner = opts.title ?
      '<div class="g-banner"><div class="g-wrap"><h1>' + esc(opts.title) + '</h1>' +
      (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : '') +
      '<div class="g-banner-actions" id="gBannerActions"></div></div>' +
      '<div class="g-banner-corner" id="gBannerCorner"></div></div>' : '';
    var footer = '<footer class="bg-[#66ae7d] mt-auto no-print"><div class="g-wrap" style="padding-top:2rem;padding-bottom:2rem;color:rgba(255,255,255,.85);font-size:.9rem">' +
      '<div style="font-weight:700;color:#fff;margin-bottom:.35rem">G-DEAL</div>교육 혁신을 위한 플랫폼 · 더 나은 교육을 위한 소통과 나눔의 공간' +
      '<div style="margin-top:1rem;font-size:.82rem;opacity:.8">&copy; 2024 G-DEAL. All rights reserved.</div></div></footer>';

    if (opts.bare) {
      document.body.innerHTML = '<div class="g-page" style="min-height:100vh;display:flex;flex-direction:column;background:#fff">' +
        '<header class="no-print" style="padding:.75rem 1.5rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">' +
        '<a href="/home/"><img src="/G-DEAL_green.svg" alt="G-DEAL" style="height:44px"/></a><div id="gAuth" style="display:flex;align-items:center;gap:.5rem"></div></header>' +
        banner + '<main style="flex:1"><div id="gMain"></div></main>' + footer + '</div>';
    } else {
      document.body.innerHTML =
        '<div class="flex flex-col min-h-screen bg-white"><div class="flex flex-1 min-h-0 overflow-visible">' +
        '<button id="mobileMenuBtn" class="fixed top-4 left-4 md:hidden bg-white rounded-lg p-2 shadow-lg border border-gray-200 w-11 h-11 flex items-center justify-center z-[30]" aria-label="메뉴 열기">' +
        '<svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>' +
        '<div class="desktop-sidebar-container hidden md:block w-60 min-h-screen bg-white relative z-30 overflow-visible"><div class="p-2 min-h-full bg-white flex flex-col desktop-sidebar-content overflow-visible">' +
        logo + '<nav class="space-y-2 desktop-nav">' + navHtml(opts.active) + '</nav><div class="flex-1 bg-white"></div></div></div>' +
        '<div id="mobileSidebar" class="mobile-sidebar-container md:hidden fixed top-0 left-0 h-screen bg-white z-[60] transform transition-transform duration-300 -translate-x-full w-64"><div class="min-h-full bg-white flex flex-col mobile-sidebar-content overflow-visible"><div class="pt-16 px-2 pb-2 min-h-full flex flex-col">' +
        logo + '<nav class="space-y-2 mobile-nav">' + navHtml(opts.active) + '</nav></div></div></div>' +
        '<div id="mobileSidebarOverlay" class="md:hidden fixed inset-0 bg-black/50 z-[55]" style="display:none"></div>' +
        '<div class="flex-1 flex flex-col md:ml-0 bg-white" style="min-width:0">' +
        '<header class="bg-white px-6 py-4 no-print"><div class="flex items-center justify-end" style="gap:.75rem">' +
        '<div class="relative" id="gSearch" style="z-index:50"></div>' +
        '<div id="gAuth" style="display:flex;align-items:center;gap:.5rem;min-height:2.25rem"></div></div></header>' +
        '<main class="flex-1 bg-white g-page" style="min-width:0">' + banner + '<div id="gMain"></div></main>' +
        '</div></div>' + footer + '</div>';

      var btn = document.getElementById('mobileMenuBtn');
      var side = document.getElementById('mobileSidebar');
      var over = document.getElementById('mobileSidebarOverlay');
      btn.addEventListener('click', function () {
        side.classList.toggle('-translate-x-full');
        over.style.display = side.classList.contains('-translate-x-full') ? 'none' : 'block';
      });
      over.addEventListener('click', function () {
        side.classList.add('-translate-x-full');
        over.style.display = 'none';
      });
      mountSearch(document.getElementById('gSearch'));
    }
    return document.getElementById('gMain');
  }

  // ---------- 머리글 검색 ----------
  // 다른 탭(Next 머리글) SEARCH와 같은 동작: 대외행사·자료 최근 50건씩에서 제목·설명 부분 일치,
  // 제목에 들어간 것 먼저·최신순, 결과를 누르면 그 페이지 #문서ID로 이동. 최근 검색어는 같은 localStorage 키.
  var SEARCH_SOURCES = [
    { col: 'events', type: '대외행사', link: '/events/', title: 'title', content: 'description', date: 'date' },
    { col: 'resources', type: '자료', link: '/resources/', title: 'title', content: 'description', date: 'createdAt' }
  ];
  var ICON_SEARCH = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>';
  var ICON_CLOSE = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>';

  var searchPool = null; // 한 페이지에서 한 번만 불러온다
  function searchDocs() {
    if (searchPool) return searchPool;
    searchPool = Promise.all(SEARCH_SOURCES.map(function (src) {
      return db.collection(src.col).orderBy(src.date, 'desc').limit(50).get().then(function (snap) {
        return snap.docs.map(function (d) {
          var x = d.data();
          return { title: String(x[src.title] || '').trim(), content: String(x[src.content] || ''), type: src.type, link: src.link + '#' + d.id, at: toDate(x[src.date]) };
        }).filter(function (r) { return r.title; });
      }).catch(function (e) { console.warn(src.col + ' 검색 실패:', e); return []; });
    })).then(function (lists) { return [].concat.apply([], lists); });
    return searchPool;
  }

  function searchFor(q) {
    q = q.trim().toLowerCase();
    if (!q) return Promise.resolve([]);
    return searchDocs().then(function (all) {
      return all.filter(function (r) { return (r.title + ' ' + r.content + ' ' + r.type).toLowerCase().indexOf(q) !== -1; })
        .sort(function (a, b) {
          var ai = a.title.toLowerCase().indexOf(q) !== -1, bi = b.title.toLowerCase().indexOf(q) !== -1;
          if (ai !== bi) return ai ? -1 : 1;
          return (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0);
        }).slice(0, 15);
    });
  }

  function readSearchHistory() {
    try {
      return JSON.parse(localStorage.getItem('searchHistory') || '[]').filter(function (h) { return h && typeof h.query === 'string' && h.query.trim(); });
    } catch (e) { return []; }
  }
  function saveSearchHistory(q) {
    try {
      var list = readSearchHistory().filter(function (h) { return h.query !== q; });
      list.unshift({ query: q, timestamp: new Date().toISOString() });
      localStorage.setItem('searchHistory', JSON.stringify(list.slice(0, 10)));
    } catch (e) {}
  }

  function mountSearch(wrap) {
    if (!wrap) return;
    var open = false, timer = null;

    function item(title, sub, attr) {
      return '<button type="button" class="g-search-item" ' + attr + '>' +
        '<span class="g-search-item-title">' + esc(title) + '</span><span class="g-search-item-sub">' + esc(sub) + '</span></button>';
    }
    function showHistory(list) {
      var hist = readSearchHistory().slice(0, 5);
      list.innerHTML = hist.length ?
        '<div class="g-search-note" style="display:flex;justify-content:space-between"><span>최근 검색어</span><button type="button" data-clear class="g-search-clear">삭제</button></div>' +
        hist.map(function (h) { return item(h.query, '검색 기록', 'data-q="' + esc(h.query) + '"'); }).join('') :
        '<div class="g-search-empty">최근 검색어가 없습니다.</div>';
    }
    function showResults(list, q) {
      list.innerHTML = '<div class="g-search-empty">검색 중...</div>';
      searchFor(q).then(function (rows) {
        if (!wrap.querySelector('#gSearchInput') || wrap.querySelector('#gSearchInput').value.trim() !== q) return; // 그사이 검색어가 바뀜
        list.innerHTML = rows.length ?
          '<div class="g-search-note">검색 결과 ' + rows.length + '개</div>' +
          rows.map(function (r) { return item(r.title, '[' + r.type + ']', 'data-link="' + esc(r.link) + '"'); }).join('') :
          '<div class="g-search-empty">검색 결과가 없습니다.</div>';
      });
    }
    function draw() {
      wrap.innerHTML = '<button type="button" class="p-2 text-gray-600 hover:text-black transition-colors relative" style="z-index:50" id="gSearchBtn" title="' + (open ? '검색 닫기' : '검색') + '" aria-label="' + (open ? '검색 닫기' : '검색') + '">' + (open ? ICON_CLOSE : ICON_SEARCH) + '</button>' +
        (open ? '<div class="g-search-panel"><div class="bg-gradient-to-br from-[#66ae7d] to-[#5a9a69] rounded-3xl shadow-xl g-search-box">' +
          '<h2 class="text-white text-sm font-bold tracking-wide" style="margin-bottom:1rem">SEARCH</h2>' +
          '<div class="bg-white rounded-full shadow-lg g-search-field"><input id="gSearchInput" type="text" placeholder="검색어를 입력해주세요." class="text-gray-800 text-sm" autocomplete="off"></div>' +
          '<div id="gSearchList" class="g-search-list"></div></div></div>' : '');
      wrap.querySelector('#gSearchBtn').addEventListener('click', function () { open = !open; draw(); });
      if (!open) return;
      var input = wrap.querySelector('#gSearchInput'), list = wrap.querySelector('#gSearchList');
      showHistory(list);
      setTimeout(function () { input.focus(); }, 30);
      input.addEventListener('input', function () {
        clearTimeout(timer);
        var q = input.value.trim();
        if (!q) { showHistory(list); return; }
        timer = setTimeout(function () { showResults(list, q); }, 300);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { open = false; draw(); return; }
        if (e.key !== 'Enter' || !input.value.trim()) return;
        clearTimeout(timer);
        saveSearchHistory(input.value.trim());
        showResults(list, input.value.trim());
      });
      list.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.hasAttribute('data-clear')) {
          try { localStorage.removeItem('searchHistory'); } catch (ex) {}
          showHistory(list);
        } else if (b.hasAttribute('data-q')) {
          input.value = b.getAttribute('data-q');
          saveSearchHistory(input.value);
          showResults(list, input.value);
        } else if (b.hasAttribute('data-link')) {
          var link = b.getAttribute('data-link');
          var samePage = location.pathname === link.split('#')[0];
          location.href = link;
          if (samePage) location.reload(); // 같은 페이지면 해시만 바뀌므로 다시 불러 해당 항목으로 스크롤
        }
      });
    }
    draw();
  }

  // 머리글 등급 배지 — Next 페이지·나눔활동(sharing.js)과 같은 색·문구(등급 변경 연도 두 자리 붙임)
  function tierText(p) {
    if (!p) return '';
    if (p.role === 'superAdmin') return '최고 관리자';
    var yy = p.tierChangedAt ? String(p.tierChangedAt.getFullYear()).slice(-2) : '';
    if (p.memberTier === 'operations-office') return yy + '운영사무국';
    if (p.memberTier === 'sharing-member') return yy + '나눔회원';
    if (p.memberTier === 'learning-member') return '배움회원';
    return '일반회원';
  }
  function tierClass(p) {
    if (!p) return '';
    if (p.role === 'superAdmin') return 'bg-[#66ae7d] text-white';
    if (p.memberTier === 'operations-office') return 'bg-purple-100 text-purple-800';
    if (p.memberTier === 'sharing-member') return 'bg-blue-100 text-blue-800';
    if (p.memberTier === 'learning-member') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  }

  function renderAuth(user, profile) {
    var box = document.getElementById('gAuth');
    if (!box) return;
    if (!user) {
      box.innerHTML = '<button class="g-btn small" id="gLoginBtn">로그인</button>';
      box.querySelector('#gLoginBtn').addEventListener('click', function () { openLogin(); });
      return;
    }
    var name = (profile && profile.displayName) || user.displayName || user.email || '회원';
    var tier = profile && profile.isMember ? tierText(profile) : '';
    // 다른 탭(Next 머리글)과 같은 마크업: [관리자 패널] [대표 배지] [등급 배지 + 이름] [로그아웃]
    box.innerHTML = '<div class="flex items-center space-x-2">' +
      (profile && profile.isAdmin ? '<button class="text-sm font-medium transition-colors" title="관리자 패널" id="gAdminBtn" style="color:#66ae7d">관리자 패널</button>' : '') +
      featuredBadgeHtml(profile && profile.featuredBadge) +
      '<button class="text-sm text-gray-600 hover:text-[#66ae7d] transition-colors font-medium" title="개인정보 수정" id="gProfileBtn">' +
      (tier ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ' + tierClass(profile) + '">' + esc(tier) + '</span>' : '') + esc(name) + '</button>' +
      '<button class="p-2 text-gray-600 hover:text-black transition-colors" id="gLogoutBtn" title="로그아웃" aria-label="로그아웃">' +
      ICON_LOGOUT.replace('width="20" height="20"', 'class="w-5 h-5"') + '</button></div>';
    var adminBtn = box.querySelector('#gAdminBtn');
    if (adminBtn) adminBtn.addEventListener('click', function () { location.href = '/admin/'; });
    // 개인정보 수정은 홈 머리글에서 한다
    box.querySelector('#gProfileBtn').addEventListener('click', function () { location.href = '/home/'; });
    box.querySelector('#gLogoutBtn').addEventListener('click', function () { auth.signOut(); });
  }

  function loginErrorText(code) {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials': return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'auth/wrong-password': return '비밀번호가 올바르지 않습니다.';
      case 'auth/invalid-email': return '유효하지 않은 이메일 주소입니다.';
      case 'auth/too-many-requests': return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
      default: return '로그인 중 오류가 발생했습니다.';
    }
  }

  function openLogin(message) {
    var m = openModal(
      '<h3>로그인</h3>' +
      (message ? '<div class="g-notice" style="margin-bottom:1rem">' + esc(message) + '</div>' : '') +
      '<form id="gLoginForm" class="g-login">' +
      '<div class="g-field"><label class="g-label" for="gEmail">이메일</label><input class="g-input" id="gEmail" name="email" type="email" autocomplete="email" required></div>' +
      '<div class="g-field"><label class="g-label" for="gPw">비밀번호</label><input class="g-input" id="gPw" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div id="gLoginErr" class="g-error" style="display:none"></div>' +
      '<p class="g-muted g-small" style="margin-top:.75rem">회원가입과 비밀번호 찾기는 <a href="/home/" style="color:#497e56;text-decoration:underline">홈</a>에서 할 수 있어요.</p>' +
      '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>취소</button><button type="submit" class="g-btn">로그인</button></div>' +
      '</form>');
    var form = m.el.querySelector('#gLoginForm');
    setTimeout(function () { form.email.focus(); }, 30);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      var err = form.querySelector('#gLoginErr');
      btn.disabled = true;
      err.style.display = 'none';
      auth.signInWithEmailAndPassword(form.email.value.trim(), form.password.value).then(function () {
        m.close();
      }).catch(function (ex) {
        err.textContent = loginErrorText(ex && ex.code);
        err.style.display = 'block';
        btn.disabled = false;
      });
    });
  }

  // ---------- 로그인·프로필 ----------

  var currentProfile = null;
  function loadProfile(user) {
    return db.collection('users').doc(user.uid).get().then(function (doc) {
      var d = doc.exists ? doc.data() : {};
      var isMember = doc.exists && (!d.status || d.status === 'approved');
      return {
        uid: user.uid,
        email: d.email || user.email || '',
        displayName: d.displayName || user.displayName || user.email || '',
        role: d.role || '',
        memberTier: d.memberTier || '',
        tierChangedAt: toDate(d.tierChangedAt),
        isMember: isMember,
        isAdmin: isMember && (d.role === 'superAdmin' || d.memberTier === 'operations-office'),
        school: d.school || '',   // 회원가입 교육기관 구분(초등·중등·고등·대학·기타 등)
        favApps: Array.isArray(d.favApps) ? d.favApps : [],
        featuredBadge: d.featuredBadge && d.featuredBadge.name ? d.featuredBadge : null
      };
    });
  }

  // cb(user|null, profile|null) — 로그인 상태가 바뀔 때마다 호출
  function onUser(cb) {
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        currentProfile = null;
        renderAuth(null, null);
        cb(null, null);
        return;
      }
      loadProfile(user).then(function (p) {
        currentProfile = p;
        cacheFeatured(p.uid, p.featuredBadge);
        renderAuth(user, p);
        cb(user, p);
      }).catch(function (e) {
        console.error('회원 정보 조회 실패:', e);
        currentProfile = { uid: user.uid, email: user.email || '', displayName: user.displayName || user.email || '', isMember: false, isAdmin: false, favApps: [] };
        renderAuth(user, currentProfile);
        cb(user, currentProfile);
      });
    });
  }

  // ---------- 활동 기록 원장 ----------

  var VIS = { 'private': '나만 보기', group: '소모임 공유', 'public': '전체 공개' };

  function normLog(doc) {
    var d = doc.data();
    return {
      id: doc.id,
      source: 'activityLog',
      uid: d.uid || '',
      userName: d.userName || '',
      type: d.type,
      status: d.status || 'auto',
      at: toDate(d.occurredAt) || toDate(d.createdAt),
      title: d.targetTitle || '',
      targetId: d.targetId || '',
      groupId: d.groupId || '',
      visibility: d.visibility || 'private',
      answers: d.answers || {},
      evidence: Array.isArray(d.evidence) ? d.evidence : [],
      adminNote: d.adminNote || ''
    };
  }

  var LEGACY = [
    { col: 'diaries', owner: 'authorId', map: function (id, d) {
      // likes: 다른 회원에게 받은 좋아요 수(본인 좋아요 제외) — '공감받는 지딜' 배지의 sum 조건이 센다
      var likes = (Array.isArray(d.likes) ? d.likes : []).filter(function (u) { return u && u !== d.authorId; }).length;
      return { type: 'diary', title: d.title || '교단일기', at: toDate(d.createdAt) || toDate(d.date), userName: d.authorName, body: d.content || '', likes: likes, link: '/diary/' };
    } },
    { col: 'resources', owner: 'createdBy', map: function (id, d) {
      // 웹앱 광장 통합: 직접 만든 웹앱(kind=webapp)은 '웹앱 자료 등록'으로 센다
      return { type: d.kind === 'webapp' ? 'app_register' : 'resource_share', title: d.title || '공유 자료', at: toDate(d.createdAt) || toDate(d.date), body: d.description || '', targetId: id, link: '/resources/#' + id };
    } },
    { col: 'sharingActivities', owner: 'creatorUid', map: function (id, d) {
      return { type: 'sharing_host', title: (d.category ? '[' + d.category + '] ' : '') + (d.name || '나눔활동'), at: toDate(d.activityDate) || toDate(d.createdAt), userName: d.creator, targetId: id, link: '/sharing/' };
    } },
    { col: 'sharingApplications', owner: 'applicantUid', map: function (id, d) {
      return { type: 'sharing_join', title: '', at: toDate(d.date) || toDate(d.createdAt), userName: d.applicant, targetId: d.activityId || '', link: '/sharing/' };
    } }
  ];

  function normLegacy(spec, doc) {
    var d = doc.data();
    var e = spec.map(doc.id, d);
    return Object.assign({
      id: spec.col + '_' + doc.id,
      source: spec.col,
      uid: d[spec.owner] || '',
      status: 'auto',
      visibility: 'public',
      answers: {},
      evidence: []
    }, e);
  }

  // 나눔활동 신청 기록에 활동명 채우기
  function fillSharingTitles(entries) {
    var need = entries.filter(function (e) { return e.type === 'sharing_join' && !e.title && e.targetId; });
    var ids = need.map(function (e) { return e.targetId; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    return Promise.all(ids.map(function (id) {
      return db.collection('sharingActivities').doc(id).get().then(function (s) {
        return [id, s.exists ? s.data() : null];
      }).catch(function () { return [id, null]; });
    })).then(function (pairs) {
      var names = {};
      pairs.forEach(function (p) { if (p[1]) names[p[0]] = (p[1].category ? '[' + p[1].category + '] ' : '') + (p[1].name || ''); });
      need.forEach(function (e) { e.title = names[e.targetId] || '나눔활동 신청'; });
      return entries;
    });
  }

  function sortDesc(entries) {
    return entries.sort(function (a, b) { return (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0); });
  }

  // 한 회원의 전체 기록. 새 원장 조회 실패는 그대로 알린다(규칙 미배포 등). 기존 컬렉션은 실패해도 빈 목록.
  // ponytail: 기존 컬렉션을 매번 읽어 합친다. 기록이 많아져 느려지면 Cloud Functions 트리거로 activityLog에 복제할 것.
  function loadLedger(uid) {
    var logs = db.collection('activityLog').where('uid', '==', uid).get();
    var legacy = LEGACY.map(function (spec) {
      return db.collection(spec.col).where(spec.owner, '==', uid).get().then(function (s) {
        return s.docs.map(function (doc) { return normLegacy(spec, doc); });
      }).catch(function (e) { console.warn(spec.col + ' 조회 실패:', e); return []; });
    });
    return Promise.all([logs].concat(legacy)).then(function (r) {
      var all = r[0].docs.map(normLog);
      for (var i = 1; i < r.length; i++) all = all.concat(r[i]);
      return fillSharingTitles(all);
    }).then(sortDesc);
  }

  // 관리자용: 전체 회원 기록
  function loadAllLedger() {
    var logs = db.collection('activityLog').get();
    var legacy = LEGACY.map(function (spec) {
      return db.collection(spec.col).get().then(function (s) {
        return s.docs.map(function (doc) { return normLegacy(spec, doc); });
      }).catch(function (e) { console.warn(spec.col + ' 조회 실패:', e); return []; });
    });
    return Promise.all([logs].concat(legacy)).then(function (r) {
      var all = r[0].docs.map(normLog);
      for (var i = 1; i < r.length; i++) all = all.concat(r[i]);
      return fillSharingTitles(all);
    }).then(sortDesc);
  }

  // 회원들의 전체 공개 성찰·실천 (승인 회원 규칙: visibility=='public' 조건이 있어야 조회가 허용된다)
  // ponytail: 단일 필드 조건만 써서 복합 색인 없이 전부 받아 브라우저에서 정렬·거른다. 공개 기록이 수천 건이 되면
  //           firestore.indexes.json에 (visibility, occurredAt desc) 색인을 추가하고 orderBy+limit 페이지로 바꿀 것.
  var PUBLIC_FEED_TYPES = ['reflection', 'practice'];
  function publicFeed(s) {
    return sortDesc(s.docs.map(normLog).filter(function (e) {
      return PUBLIC_FEED_TYPES.indexOf(e.type) !== -1 && e.status !== 'rejected';
    }));
  }
  function loadPublicLogs() {
    return db.collection('activityLog').where('visibility', '==', 'public').get().then(publicFeed);
  }
  // 한 활동의 공개 성찰·실천 (나눔활동 상세). 등호 조건 두 개라 색인 불필요
  function loadActivityLogs(targetId) {
    return db.collection('activityLog').where('visibility', '==', 'public').where('targetId', '==', targetId).get().then(publicFeed);
  }

  // 내 소모임에 공유된 기록 (규칙: 구성원만, groupId·visibility를 == 조건으로 걸어야 조회 허용)
  function loadGroupLogs(groupIds) {
    return Promise.all((groupIds || []).map(function (gid) {
      return db.collection('activityLog').where('groupId', '==', gid).where('visibility', '==', 'group').get()
        .then(function (s) { return s.docs.map(normLog); });
    })).then(function (lists) {
      return sortDesc([].concat.apply([], lists).filter(function (e) { return e.status !== 'rejected'; }));
    });
  }

  // 원장에 새 기록 추가. docId를 주면 그 ID로(중복 방지용), 아니면 자동 ID.
  function addLog(profile, data, docId) {
    var col = db.collection('activityLog');
    var ref = docId ? col.doc(docId) : col.doc();
    var now = FV.serverTimestamp();
    var doc = Object.assign({
      uid: profile.uid,
      userName: profile.displayName || profile.email || '',
      visibility: 'private',
      answers: {},
      evidence: [],
      targetId: '',
      targetTitle: '',
      groupId: '',
      term: R.termOf(new Date()),
      occurredAt: now,
      createdAt: now
    }, data);
    return ref.set(doc).then(function () { return ref.id; });
  }

  function loadBadgeRules() {
    return db.collection('badgeRules').get().then(function (s) {
      if (s.empty) return R.DEFAULT_BADGES.map(function (b) { return JSON.parse(JSON.stringify(b)); });
      return s.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    }).catch(function (e) {
      console.warn('배지 규칙 조회 실패, 기본값 사용:', e);
      return R.DEFAULT_BADGES.slice();
    });
  }

  function loadGrants(uid) {
    return db.collection('badgeGrants').where('uid', '==', uid).get().then(function (s) {
      return s.docs.map(function (d) { return d.data().ruleId; });
    }).catch(function () { return []; });
  }

  // ---------- 참여 인증 대상 목록 ----------
  // 관리자 화면에서 등록한 웨비나(webinars) + 모든 나눔활동(웨비나·카페연수·별뉘·독서모임·미니스터디)
  var SHARING_WEBINAR_CATEGORY = '디지털 수업실천 웨비나';

  // 인증 기록 유형: 웨비나는 webinar_attend, 그 밖의 나눔활동은 sharing_attend
  function attendTypeOf(w) {
    if (w && w.source === 'events') return 'event_attend';
    return w && w.source === 'sharing' && w.category !== SHARING_WEBINAR_CATEGORY ? 'sharing_attend' : 'webinar_attend';
  }
  function isWebinar(w) { return attendTypeOf(w) === 'webinar_attend'; }

  function loadWebinarList() {
    var admin = db.collection('webinars').get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id, source: 'admin', category: '웨비나' }); });
    }).catch(function (e) { console.warn('웨비나 조회 실패:', e); return []; });
    var sharing = db.collection('sharingActivities').get().then(function (s) {
      return s.docs.map(function (d) {
        var x = d.data();
        return {
          id: d.id,
          source: 'sharing',
          title: x.name || '나눔활동',
          category: x.category || '나눔활동',
          date: x.activityDate || '',
          time: x.activityTime || '',
          speaker: x.creator || '',
          link: safeUrl(x.location),
          creatorUid: x.creatorUid || '',
          status: x.status || '활동중'
        };
      });
    }).catch(function (e) { console.warn('나눔활동 조회 실패:', e); return []; });
    // 대외행사: 인증 코드는 운영진만 연다(관리자 참여 인증 탭). 신청자 명단이 없어 인증 시작 알림은 없다.
    var events = db.collection('events').get().then(function (s) {
      return s.docs.map(function (d) {
        var x = d.data();
        return { id: d.id, source: 'events', title: x.title || '대외행사', category: '대외행사', date: ymd(x.date), time: '', speaker: '', link: '', status: '활동중' };
      });
    }).catch(function (e) { console.warn('대외행사 조회 실패:', e); return []; });
    return Promise.all([admin, sharing, events]).then(function (r) {
      return r[0].concat(r[1], r[2]).sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    });
  }

  // ---------- 렌더러 (성장패스·포트폴리오 공용) ----------

  var ANSWER_LABELS = {
    learned: '새롭게 알게 된 것',
    apply: '내 수업·업무에 적용해 볼 것',
    record: '적용 결과를 남길 방법',
    applied: '실제 적용 여부',
    gradeSubject: '학년·교과',
    good: '잘된 점',
    hard: '어려웠던 점',
    next: '다음에 바꾸고 싶은 점',
    note: '내용'
  };
  var CHOICE_TEXT = {
    applied: { yes: '적용함', partly: '일부 적용', no: '아직 못 함' }
  };

  function stampsHtml(counts) {
    return '<div class="g-stamps">' + Object.keys(R.STAMPS).map(function (k) {
      var s = R.STAMPS[k];
      return '<div class="g-stamp" style="color:' + s.color + ';background:' + s.bg + '">' +
        '<div class="g-stamp-num">' + (Number(counts[k]) || 0) + '</div>' +
        '<div class="g-stamp-label">' + s.label + ' 스탬프</div></div>';
    }).join('') + '</div>';
  }

  // 배지 이름 첫 글자(이미지 없는 메달용)
  function badgeInitial(name) {
    return String(name || '?').replace(/[^가-힣A-Za-z0-9]/g, '').charAt(0) || '★';
  }

  // 대표 배지 칩 (오른쪽 위 이름 옆). 좁은 화면에서는 CSS가 이름을 숨기고 메달만 남긴다.
  function featuredBadgeHtml(fb) {
    if (!fb || !fb.name) return '';
    var img = safeUrl(fb.image);
    return '<span class="g-fbadge" title="대표 배지 · ' + esc(fb.name) + '">' +
      '<span class="g-fbadge-medal">' + (img ? '<img src="' + esc(img) + '" alt="">' : esc(badgeInitial(fb.name))) + '</span>' +
      '<span class="g-fbadge-name">' + esc(fb.name) + '</span></span>';
  }

  // Next 빌드 페이지 주입 스크립트(/featured-badge.js)가 서버 조회 실패 시 쓰는 캐시
  function cacheFeatured(uid, fb) {
    try {
      if (fb) localStorage.setItem('gdeal:featuredBadge:' + uid, JSON.stringify(fb));
      else localStorage.removeItem('gdeal:featuredBadge:' + uid);
    } catch (e) {}
  }

  // 대표 배지 저장/해제(null). 본인 users 문서 수정이라 기존 규칙으로 허용된다.
  function setFeaturedBadge(fb) {
    var p = currentProfile;
    if (!p || !p.isMember) return Promise.reject(new Error('승인된 회원만 설정할 수 있어요.'));
    var val = fb ? { id: String(fb.id || ''), name: String(fb.name || '').slice(0, 40), image: safeUrl(fb.image) } : null;
    return db.collection('users').doc(p.uid).update({ featuredBadge: val, updatedAt: FV.serverTimestamp() }).then(function () {
      p.featuredBadge = val;
      cacheFeatured(p.uid, val);
      renderAuth(auth.currentUser, p);
    });
  }

  // footHtml: 카드 아래에 붙일 버튼 등(성장패스의 대표 배지 설정)
  function badgeHtml(b, showProgress, footHtml) {
    var r = b.rule;
    var img = safeUrl(r.image);
    var medal = img ? '<img src="' + esc(img) + '" alt="">' : esc(badgeInitial(r.name));
    var prog = '';
    if (showProgress && !b.earned) {
      prog = '<div class="g-progress" aria-hidden="true"><span style="width:' + Math.round((Number(b.ratio) || 0) * 100) + '%"></span></div>' +
        '<div class="g-badge-desc">' + (b.progress || []).map(function (p) {
          return esc(R.conditionText({ types: p.types, count: p.count, sum: p.sum })) + ' 중 ' + Number(p.have) + (p.sum ? '개' : '회');
        }).join('<br>') + '</div>';
    }
    return '<div class="g-badge' + (b.earned ? '' : ' locked') + (b.featured ? ' featured' : '') + '">' +
      '<div class="g-badge-medal">' + medal + '</div>' +
      '<div class="g-badge-name">' + esc(r.name) + '</div>' +
      '<div class="g-badge-desc">' + esc(r.desc || '') + '</div>' + prog + (footHtml ? '<div class="g-badge-foot">' + footHtml + '</div>' : '') + '</div>';
  }

  function typeTag(type) {
    var t = R.TYPES[type];
    // 스탬프가 없는 유형은 회색 태그
    if (!t || !t.stamp) return '<span class="g-tag">' + esc(t ? t.label : type) + '</span>';
    var s = R.STAMPS[t.stamp];
    return '<span class="g-tag" style="background:' + s.bg + ';color:' + s.color + '">' + esc(t.label) + '</span>';
  }

  function answersHtml(answers) {
    var keys = Object.keys(ANSWER_LABELS).filter(function (k) { return answers && answers[k]; });
    if (!keys.length) return '';
    return keys.map(function (k) {
      var v = answers[k];
      if (CHOICE_TEXT[k]) v = CHOICE_TEXT[k][v] || v;
      return '<div class="g-item-body"><b style="color:#374151">' + ANSWER_LABELS[k] + '</b> · ' + esc(v) + '</div>';
    }).join('');
  }

  function evidenceHtml(list) {
    var links = (list || []).map(function (ev) {
      var u = safeUrl(ev && ev.url);
      return u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" style="color:#497e56;text-decoration:underline;margin-right:.75rem;word-break:break-all">' + esc(ev.label || u) + '</a>' : '';
    }).join('');
    return links ? '<div class="g-item-body">' + links + '</div>' : '';
  }

  // 기록 한 줄. opts.actions(html) 로 오른쪽 버튼을 붙인다.
  function entryHtml(e, opts) {
    opts = opts || {};
    var status = e.status === 'pending' ? '<span class="g-tag yellow">확인 대기</span>' :
      e.status === 'rejected' ? '<span class="g-tag red">반려</span>' : '';
    var vis = e.source === 'activityLog' && opts.showVisibility ? '<span class="g-tag">' + esc(VIS[e.visibility] || '') + '</span>' : '';
    var body = e.body ? '<div class="g-item-body">' + esc(String(e.body).slice(0, 180)) + (String(e.body).length > 180 ? '…' : '') + '</div>' : '';
    return '<li class="g-item" data-id="' + esc(e.id) + '">' +
      '<div class="g-item-head"><div>' + typeTag(e.type) + status + vis +
      '<div class="g-item-title">' + esc(e.title || (R.TYPES[e.type] ? R.TYPES[e.type].label : '')) + '</div>' +
      '<div class="g-item-meta">' + fmtDate(e.at) + (opts.showUser && e.userName ? ' · ' + esc(e.userName) : '') + '</div></div>' +
      (opts.actions ? '<div class="g-row" style="gap:.35rem;flex-shrink:0">' + opts.actions(e) + '</div>' : '') + '</div>' +
      answersHtml(e.answers) + body + evidenceHtml(e.evidence) +
      (e.adminNote ? '<div class="g-item-body g-muted">운영진 메모 · ' + esc(e.adminNote) + '</div>' : '') +
      '</li>';
  }

  function loadingHtml(text) {
    return '<div class="g-loading"><div class="g-spinner"></div>' + esc(text || '불러오는 중...') + '</div>';
  }

  function errorHtml(text, retryId) {
    return '<div class="g-error">' + esc(text) + (retryId ? ' <button class="g-btn small secondary" id="' + esc(retryId) + '" style="margin-left:.5rem">다시 시도</button>' : '') + '</div>';
  }

  window.G = {
    auth: auth, db: db, FV: FV, R: R,
    esc: esc, safeUrl: safeUrl, toDate: toDate, ymd: ymd, fmtDate: fmtDate, param: param,
    randomCode: randomCode, daysBetween: daysBetween, formData: formData,
    toast: toast, openModal: openModal, confirmModal: confirmModal, downloadCsv: downloadCsv,
    shell: shell, onUser: onUser, openLogin: openLogin, profile: function () { return currentProfile; },
    mountSearch: mountSearch,
    VIS: VIS, ANSWER_LABELS: ANSWER_LABELS,
    loadLedger: loadLedger, loadAllLedger: loadAllLedger, addLog: addLog, loadPublicLogs: loadPublicLogs, loadActivityLogs: loadActivityLogs, loadGroupLogs: loadGroupLogs,
    loadBadgeRules: loadBadgeRules, loadGrants: loadGrants,
    loadWebinarList: loadWebinarList, SHARING_WEBINAR_CATEGORY: SHARING_WEBINAR_CATEGORY,
    attendTypeOf: attendTypeOf, isWebinar: isWebinar,
    setFeaturedBadge: setFeaturedBadge, featuredBadgeHtml: featuredBadgeHtml,
    stampsHtml: stampsHtml, badgeHtml: badgeHtml, typeTag: typeTag, entryHtml: entryHtml,
    answersHtml: answersHtml, evidenceHtml: evidenceHtml, loadingHtml: loadingHtml, errorHtml: errorHtml
  };
})();
