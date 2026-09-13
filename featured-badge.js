/**
 * 대표 배지 칩 — Next 빌드 페이지(홈·소개·대외행사·자료공유·교단일기·월별연수) 머리글 이름 옆에 붙인다.
 * 원본 소스가 없어 번들 안 Firebase에 접근할 수 없으므로:
 *   1) Firebase Auth가 IndexedDB에 저장한 로그인 정보에서 uid·토큰을 읽고
 *   2) Firestore REST로 users/{uid}.featuredBadge 만 조회(실패 시 성장패스가 남긴 localStorage 캐시)
 *   3) React가 머리글을 다시 그려도 MutationObserver로 다시 붙인다.
 * 대표 배지 설정은 /growth/ 에서 한다.
 */
(function () {
  'use strict';

  var API_KEY = 'AIzaSyBJsqUJK1AjhrLNzIY_79dIR2Mlg7zD09w';
  var AUTH_KEY = 'firebase:authUser:' + API_KEY + ':[DEFAULT]';
  var DOC_URL = 'https://firestore.googleapis.com/v1/projects/gdeal-page-a67e2/databases/(default)/documents/users/';
  var CHIP_CLASS = 'gdeal-featured-badge';

  var current = { uid: null, badge: null };
  var loadingUid = null;

  // Firebase가 쓰는 DB를 절대 새로 만들지 않도록 업그레이드(=DB 없음)면 중단한다
  function readAuthUser() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('firebaseLocalStorageDb');
        req.onupgradeneeded = function () { req.transaction.abort(); };
        req.onerror = function () { resolve(null); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) { db.close(); resolve(null); return; }
          var get = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').get(AUTH_KEY);
          get.onsuccess = function () { db.close(); resolve(get.result && get.result.value ? get.result.value : null); };
          get.onerror = function () { db.close(); resolve(null); };
        };
      } catch (e) { resolve(null); }
    });
  }

  function readCache(uid) {
    try { return JSON.parse(localStorage.getItem('gdeal:featuredBadge:' + uid) || 'null'); } catch (e) { return null; }
  }

  // REST 응답의 mapValue → { id, name, image }
  function parseBadge(json) {
    var f = json && json.fields && json.fields.featuredBadge;
    var m = f && f.mapValue && f.mapValue.fields;
    if (!m || !m.name || !m.name.stringValue) return null;
    return {
      id: m.id ? m.id.stringValue || '' : '',
      name: m.name.stringValue,
      image: m.image ? m.image.stringValue || '' : ''
    };
  }

  function fetchBadge(user) {
    var tm = user.stsTokenManager || {};
    if (!tm.accessToken || !(tm.expirationTime > Date.now())) return Promise.resolve(readCache(user.uid));
    return fetch(DOC_URL + encodeURIComponent(user.uid) + '?mask.fieldPaths=featuredBadge', {
      headers: { Authorization: 'Bearer ' + tm.accessToken }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(parseBadge).catch(function () { return readCache(user.uid); });
  }

  function makeChip(badge, compact) {
    var chip = document.createElement('span');
    chip.className = CHIP_CLASS;
    chip.title = '대표 배지 · ' + badge.name;
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem;flex-shrink:0;border-radius:999px;' +
      'background:#f0f9f3;border:1px solid #bbdfc6;color:#14532d;font-size:.75rem;font-weight:700;white-space:nowrap;' +
      'max-width:11rem;padding:' + (compact ? '.1rem' : '.1rem .55rem .1rem .1rem');
    var medal = document.createElement('span');
    medal.style.cssText = 'width:1.35rem;height:1.35rem;border-radius:50%;background:#66ae7d;color:#fff;display:inline-flex;' +
      'align-items:center;justify-content:center;overflow:hidden;font-size:.68rem;flex-shrink:0';
    if (/^https:\/\/[^\s]+$/i.test(badge.image || '')) {
      var img = document.createElement('img');
      img.src = badge.image;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      medal.appendChild(img);
    } else {
      medal.textContent = String(badge.name).replace(/[^가-힣A-Za-z0-9]/g, '').charAt(0) || '★';
    }
    chip.appendChild(medal);
    if (!compact) {
      var name = document.createElement('span');
      name.textContent = badge.name;
      name.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
      chip.appendChild(name);
    }
    return chip;
  }

  // 이름 버튼 앞에 칩을 맞춰 둔다. 버튼이 사라진 칩(로그아웃 등)은 지운다.
  function paint() {
    var buttons = document.querySelectorAll('button[title="개인정보 수정"]');
    Array.prototype.forEach.call(document.querySelectorAll('.' + CHIP_CLASS), function (chip) {
      var next = chip.nextElementSibling;
      var stale = !next || next.getAttribute('title') !== '개인정보 수정' || !current.badge || chip.getAttribute('data-name') !== current.badge.name;
      if (stale) chip.parentNode.removeChild(chip);
    });
    if (!current.badge) return;
    Array.prototype.forEach.call(buttons, function (btn) {
      var prev = btn.previousElementSibling;
      if (prev && prev.classList.contains(CHIP_CLASS)) return;
      var chip = makeChip(current.badge, btn.className.indexOf('text-xs') !== -1);
      chip.setAttribute('data-name', current.badge.name);
      btn.parentNode.insertBefore(chip, btn);
    });
  }

  function refresh() {
    var hasButton = !!document.querySelector('button[title="개인정보 수정"]');
    if (!hasButton) { current.uid = null; current.badge = null; paint(); return; }
    readAuthUser().then(function (user) {
      if (!user || !user.uid) { current.uid = null; current.badge = null; paint(); return; }
      if (user.uid === current.uid || user.uid === loadingUid) { paint(); return; }
      loadingUid = user.uid;
      return fetchBadge(user).then(function (badge) {
        loadingUid = null;
        current.uid = user.uid;
        current.badge = badge;
        paint();
      });
    });
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  }

  new MutationObserver(function (list) {
    // 우리가 넣은 칩 때문에 생긴 변화는 무시
    for (var i = 0; i < list.length; i++) {
      var nodes = Array.prototype.slice.call(list[i].addedNodes).concat(Array.prototype.slice.call(list[i].removedNodes));
      if (nodes.some(function (n) { return !(n.classList && n.classList.contains(CHIP_CLASS)); })) { schedule(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });

  schedule();
})();
