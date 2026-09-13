/**
 * 자료공유 — 기존 Next 자료공유 기능 + (옛 웹앱 광장) 분류·즐겨찾기·사용 기록·후기
 * - resources 컬렉션 필드는 기존과 호환: title, description, downloadUrl, author, tags[], type, format, createdBy, createdAt, updatedAt
 * - 새 선택 필드: kind('resource'|'webapp'), grades/subjects/activityTypes[], imageUrl, problem, features, howToUse, cautions,
 *   loginRequired, personalData, relatedWebinarId, featured(관리자), usedCount
 * - 등록은 기존처럼 바로 공개(검토 없음)
 */
(function () {
  'use strict';

  var G = window.G, esc = G.esc;

  var AXES = [
    { key: 'grades', label: '학년', options: ['초1-2', '초3-4', '초5-6', '중학교', '고등학교'] },
    { key: 'subjects', label: '교과', options: ['국어', '수학', '사회', '과학', '영어', '음악·미술·체육', '실과·정보', '창체·학급', '교과 공통'] },
    { key: 'activityTypes', label: '활동 유형', options: ['수업 도구', '평가·퀴즈', '학급 운영', '업무 효율', '기타'] }
  ];
  var SORTS = [['recent', '최근 등록'], ['used', '많이 사용'], ['name', '이름순']];
  var REUSE = { yes: '있어요', maybe: '고민 중', no: '없어요' };
  var FILE_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip', '.rar', '.7z', '.mp4', '.mp3', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.txt', '.hwp', '.ai', '.psd', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv'];
  var FILE_HOSTS = ['dropbox.com', 'dl.dropboxusercontent.com', 'onedrive.live.com', '1drv.ms', 'box.com', 'app.box.com', 'we.tl', 'wetransfer.com', 'mega.nz', 'mega.co.nz', 'mediafire.com', '4shared.com'];
  var NO_FRAME = ['google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'amazon.com', 'netflix.com', 'microsoft.com', 'apple.com', 'github.com', 'stackoverflow.com', 'reddit.com', 'wikipedia.org', 'litt.ly', 'bit.ly', 'tinyurl.com', 'short.ly', 'naver.com', 'daum.net', 'kakao.com', 'tistory.com', 'notion.so', 'gw.googleforeducation.org'];
  var GOOGLE_HOSTS = ['script.google.com', 'docs.google.com', 'forms.google.com', 'sites.google.com', 'drive.google.com'];

  var main = G.shell({
    active: '/resources/',
    title: '자료공유',
    subtitle: '실전에서 검증된 디지털 교육 자료를 공유하고 활용하세요'
  });

  var state = {
    user: null, profile: null, favs: [],
    items: [], webinars: [], loaded: false, started: false,
    q: '', tags: [], f: { grades: '', subjects: '', activityTypes: '' }, webOnly: false, favOnly: false, sort: 'recent'
  };
  var detail = null; // { m, item, used, usedKnown, reviews, rs }

  // ---------- 도구 ----------

  function isMember() { return !!(state.profile && state.profile.isMember); }
  function canManage(a) { return !!state.user && (!!(state.profile && state.profile.isAdmin) || a.createdBy === state.user.uid); }
  function created(a) { var d = G.toDate(a.createdAt); return d ? d.getTime() : 0; }
  function tagsOf(a) { return Array.isArray(a.tags) ? a.tags : []; }
  function findItem(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }
  function webinarById(id) { for (var i = 0; i < state.webinars.length; i++) if (state.webinars[i].id === id) return state.webinars[i]; return null; }
  function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } }
  function hasAny(host, list) { return list.some(function (h) { return host.indexOf(h) !== -1; }); }

  // 기존 청크와 같은 링크 종류 판별
  function linkKind(url) {
    var h = hostOf(url);
    if (!h) return { title: '유효하지 않은 URL입니다', site: '' };
    if (h.indexOf('drive.google.com') !== -1) return { title: 'Google Drive 자료', site: 'Google Drive' };
    if (h.indexOf('docs.google.com') !== -1) return { title: 'Google 문서', site: 'Google Docs' };
    if (h.indexOf('script.google.com') !== -1) {
      var m = url.match(/\/macros\/s\/([a-zA-Z0-9-_]+)\//);
      return { title: m ? 'Apps Script (' + m[1].substring(0, 8) + '...)' : 'Google Apps Script 웹 앱', site: 'Google Apps Script' };
    }
    if (h.indexOf('youtube.com') !== -1 || h.indexOf('youtu.be') !== -1) return { title: 'YouTube 동영상', site: 'YouTube' };
    if (h.indexOf('github.com') !== -1) return { title: 'GitHub 리포지토리', site: 'GitHub' };
    if (h.indexOf('notion.so') !== -1) return { title: 'Notion 페이지', site: 'Notion' };
    if (h.indexOf('canva.com') !== -1) return { title: 'Canva 디자인', site: 'Canva' };
    if (h.indexOf('figma.com') !== -1) return { title: 'Figma 디자인', site: 'Figma' };
    return { title: h, site: h };
  }
  function isFileLink(url) {
    try {
      var u = new URL(url), p = u.pathname.toLowerCase(), h = u.hostname.toLowerCase();
      return FILE_EXT.some(function (e) { return p.slice(-e.length) === e; }) ||
        (h.indexOf('drive.google.com') !== -1 && p.indexOf('/file/d/') !== -1) || hasAny(h, FILE_HOSTS) ||
        h.indexOf('sharepoint.com') !== -1 || (h.indexOf('icloud.com') !== -1 && p.indexOf('iclouddrive') !== -1) ||
        (h.indexOf('github.com') !== -1 && p.indexOf('/releases/download/') !== -1) ||
        p.indexOf('/download/') !== -1 || u.search.indexOf('download') !== -1;
    } catch (e) { return false; }
  }
  // iframe 미리보기 가능 여부(기존 청크 규칙)
  function canFrame(url) {
    try {
      var u = new URL(url), h = u.hostname, p = u.pathname.toLowerCase();
      if (hasAny(h, GOOGLE_HOSTS)) return false;
      if (FILE_EXT.some(function (e) { return p.slice(-e.length) === e; }) || hasAny(h, FILE_HOSTS) || p.indexOf('/download/') !== -1 || u.search.indexOf('download') !== -1) return false;
      return !hasAny(h, NO_FRAME);
    } catch (e) { return false; }
  }

  // ---------- 데이터 ----------

  function load() {
    main.innerHTML = '<div class="g-wrap g-body">' + G.loadingHtml('자료를 불러오는 중...') + '</div>';
    return Promise.all([
      G.db.collection('resources').get(),
      G.loadWebinarList().catch(function () { return []; })
    ]).then(function (r) {
      state.items = r[0].docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .sort(function (a, b) { return created(b) - created(a); });
      state.webinars = r[1].filter(G.isWebinar).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      state.loaded = true;
      renderFrame();
      renderList();
      scrollToHash();
    }).catch(function (e) {
      console.error('자료 로드 실패:', e);
      main.innerHTML = '<div class="g-wrap g-body">' + G.errorHtml('자료 목록을 불러오지 못했습니다. (' + (e.code || e.message) + ')', 'retryLoad') + '</div>';
      document.getElementById('retryLoad').addEventListener('click', load);
    });
  }

  function refresh() {
    return G.db.collection('resources').get().then(function (s) {
      state.items = s.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); })
        .sort(function (a, b) { return created(b) - created(a); });
      renderList();
    }).catch(function (e) { console.warn('자료 새로고침 실패:', e); });
  }

  function loadFavs() {
    if (!isMember()) { state.favs = []; return Promise.resolve(); }
    return G.db.collection('users').doc(state.profile.uid).get().then(function (s) {
      var v = s.exists ? s.data().favResources : null;
      state.favs = Array.isArray(v) ? v : [];
    }).catch(function () { state.favs = []; });
  }

  // 사이트 검색이 /resources/#문서ID 로 연결 — 해당 카드로 스크롤 후 잠시 강조
  function scrollToHash() {
    function go() {
      var id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('r-highlight');
      setTimeout(function () { el.classList.remove('r-highlight'); }, 3000);
    }
    setTimeout(go, 500);
    setTimeout(go, 1500);
  }
  window.addEventListener('hashchange', scrollToHash);

  // ---------- 필터 ----------

  function textOf(a) {
    return [a.title, a.description, a.author].concat(tagsOf(a), a.grades || [], a.subjects || [], a.activityTypes || []).join(' ').toLowerCase();
  }
  function matches(a, f, skip) {
    if (state.q && textOf(a).indexOf(state.q.toLowerCase()) === -1) return false;
    if (state.tags.length && !state.tags.some(function (s) {
      return tagsOf(a).some(function (t) { return String(t).toLowerCase().indexOf(s.toLowerCase()) !== -1; });
    })) return false;
    if (state.webOnly && a.kind !== 'webapp') return false;
    if (state.favOnly && state.favs.indexOf(a.id) === -1) return false;
    for (var i = 0; i < AXES.length; i++) {
      var k = AXES[i].key;
      if (k === skip || !f[k]) continue;
      if ((a[k] || []).indexOf(f[k]) === -1) return false;
    }
    return true;
  }
  function filtering() {
    return !!(state.q || state.tags.length || state.webOnly || state.favOnly || AXES.some(function (ax) { return state.f[ax.key]; }));
  }
  function setAxis(axis, val) {
    state.f[axis] = state.f[axis] === val ? '' : val;
    // 결과가 0이 되면 다른 축을 풀어 넓힌다
    AXES.forEach(function (ax) {
      if (ax.key !== axis && state.f[ax.key] && !state.items.some(function (a) { return matches(a, state.f); })) state.f[ax.key] = '';
    });
    renderList();
  }
  function resetFilters() {
    state.q = '';
    state.tags = [];
    state.webOnly = false;
    state.favOnly = false;
    AXES.forEach(function (ax) { state.f[ax.key] = ''; });
    var input = document.getElementById('resSearch');
    if (input) input.value = '';
    renderList();
  }
  function sorted(list) {
    if (state.sort === 'used') list.sort(function (a, b) { return (Number(b.usedCount) || 0) - (Number(a.usedCount) || 0) || created(b) - created(a); });
    else if (state.sort === 'name') list.sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'ko'); });
    else list.sort(function (a, b) { return created(b) - created(a); });
    return list;
  }

  // ---------- 화면 ----------

  function renderBanner() {
    // 대외행사의 「+ 행사 등록」과 같은 자리·모양(배너 오른쪽 아래)
    var box = document.getElementById('gBannerCorner');
    if (box) box.innerHTML = isMember() ?
      '<button class="bg-white text-[#66ae7d] px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center space-x-2" data-act="register"><span class="text-lg">+</span><span>자료 등록</span></button>' : '';
  }

  function renderFrame() {
    main.innerHTML = '<div class="g-wrap g-body">' +
      '<div id="guestBox"></div>' +
      '<div class="g-card">' +
      '<div class="g-row" style="margin-bottom:.85rem">' +
      '<input class="g-input" id="resSearch" type="search" placeholder="자료 제목, 내용, 작성자, 태그로 검색..." aria-label="자료 검색" style="flex:1;min-width:200px" value="' + esc(state.q) + '">' +
      '<select class="g-select" id="resSort" aria-label="정렬" style="width:auto">' +
      SORTS.map(function (s) { return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') +
      '</select></div><div id="tagBox"></div><div id="chipBox"></div></div>' +
      '<div id="featuredBox"></div>' +
      '<p style="margin:1.5rem 0 .75rem;color:#4b5563">총 <b style="color:#497e56" id="countNum">0</b>개의 자료</p>' +
      '<div id="gridBox"></div></div>';
    document.getElementById('resSearch').addEventListener('input', function () {
      state.q = this.value.trim();
      // 검색은 명시적 의도라 분류 칩보다 우선 — 범위를 넓힌다(태그 선택은 기존처럼 유지)
      if (state.q) {
        state.webOnly = false;
        state.favOnly = false;
        AXES.forEach(function (ax) { state.f[ax.key] = ''; });
      }
      renderList();
    });
    document.getElementById('resSort').addEventListener('change', function () { state.sort = this.value; renderList(); });
    renderGuest();
  }

  function renderGuest() {
    var box = document.getElementById('guestBox');
    if (!box) return;
    box.innerHTML = state.user ? '' :
      '<div class="g-notice" style="margin-bottom:1rem"><b>로그인하시면 자료를 다운로드할 수 있습니다</b>' +
      '<div style="margin:.35rem 0 .7rem">현재 자료 목록만 확인할 수 있습니다. 로그인하시면 자료의 상세 정보를 보고 다운로드할 수 있습니다.</div>' +
      '<div class="g-row" style="gap:.5rem"><button class="g-btn small" data-act="login">로그인하기</button>' +
      '<a class="g-btn small secondary" href="/home/">회원가입하기</a></div></div>';
  }

  function popularTags() {
    var seen = [];
    state.items.forEach(function (a) { tagsOf(a).forEach(function (t) { if (t && seen.indexOf(t) === -1) seen.push(t); }); });
    return seen.slice(0, 8);
  }

  function renderTags() {
    var box = document.getElementById('tagBox');
    if (!box) return;
    var tags = popularTags();
    box.innerHTML = tags.length ? '<div class="g-row" style="gap:.4rem;margin-bottom:.6rem"><span class="g-muted g-small">인기 태그:</span>' +
      tags.map(function (t) {
        var on = state.tags.indexOf(t) !== -1;
        return '<button class="g-chip r-tagchip' + (on ? ' on' : '') + '" data-act="tag" data-val="' + esc(t) + '" aria-pressed="' + on + '">#' + esc(t) + '</button>';
      }).join('') + '</div>' +
      (state.tags.length ? '<p class="g-muted g-small" style="margin-bottom:.6rem">선택된 태그 (' + state.tags.length + '개): ' + esc(state.tags.join(', ')) + '</p>' : '') : '';
  }

  function chipsHtml() {
    var html = AXES.map(function (ax) {
      return '<div class="g-row" style="gap:.5rem;margin-bottom:.5rem;align-items:flex-start;flex-wrap:nowrap">' +
        '<span class="g-label" style="margin:0;padding-top:.35rem;min-width:4.5rem;flex-shrink:0">' + ax.label + '</span><div class="g-chips">' +
        '<button class="g-chip' + (!state.f[ax.key] ? ' on' : '') + '" data-act="axis" data-axis="' + ax.key + '" data-val="">전체</button>' +
        ax.options.map(function (o) {
          var on = state.f[ax.key] === o;
          var n = state.items.filter(function (a) { return matches(a, state.f, ax.key) && (a[ax.key] || []).indexOf(o) !== -1; }).length;
          if (n === 0 && !on) return '<span class="g-chip off" aria-disabled="true" title="이 조합에는 자료가 없어요">' + esc(o) + '</span>';
          return '<button class="g-chip' + (on ? ' on' : '') + '" data-act="axis" data-axis="' + ax.key + '" data-val="' + esc(o) + '">' + esc(o) + ' <b>' + n + '</b></button>';
        }).join('') + '</div></div>';
    }).join('');
    var webCount = state.items.filter(function (a) { return a.kind === 'webapp'; }).length;
    var favCount = state.items.filter(function (a) { return state.favs.indexOf(a.id) !== -1; }).length;
    return html + '<div class="g-row" style="gap:.5rem;margin-top:.25rem"><span class="g-label" style="margin:0;min-width:4.5rem">보기</span>' +
      '<button class="g-chip' + (state.webOnly ? ' on' : '') + '" data-act="webonly" aria-pressed="' + state.webOnly + '">웹앱만 <b>' + webCount + '</b></button>' +
      '<button class="g-chip' + (state.favOnly ? ' on' : '') + '" data-act="favonly" aria-pressed="' + state.favOnly + '">★ 즐겨찾기만 <b>' + favCount + '</b></button>' +
      (filtering() ? '<button class="g-chip" data-act="reset">검색 조건 초기화</button>' : '') + '</div>';
  }

  function axisTags(a) {
    return (a.grades || []).map(function (t) { return '<span class="g-tag blue">' + esc(t) + '</span>'; }).join('') +
      (a.subjects || []).map(function (t) { return '<span class="g-tag green">' + esc(t) + '</span>'; }).join('') +
      (a.activityTypes || []).map(function (t) { return '<span class="g-tag">' + esc(t) + '</span>'; }).join('');
  }

  function cardHtml(a, featuredRow) {
    var fav = state.favs.indexOf(a.id) !== -1;
    var img = G.safeUrl(a.imageUrl);
    return '<div class="g-card r-card"' + (featuredRow ? '' : ' id="' + esc(a.id) + '"') + '>' +
      '<div class="r-card-head"><div>' +
      '<span class="g-tag green">' + (a.kind === 'webapp' ? '웹앱' : '자료') + '</span>' +
      (a.featured ? '<span class="g-tag yellow">추천</span>' : '') + '</div>' +
      (canManage(a) ? '<div class="g-row" style="gap:.3rem;flex-shrink:0">' +
        '<button class="g-btn small secondary" data-act="edit" data-id="' + esc(a.id) + '">수정</button>' +
        '<button class="g-btn small danger" data-act="del" data-id="' + esc(a.id) + '">삭제</button></div>' : '') + '</div>' +
      (img ? '<div class="r-thumb"><img src="' + esc(img) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="r-card-title">' + esc(a.title) + '</div>' +
      '<div class="r-desc">' + esc(a.description || '') + '</div>' +
      '<div class="r-card-foot">' +
      '<div>' + tagsOf(a).map(function (t) { return '<span class="g-tag">#' + esc(t) + '</span>'; }).join('') + axisTags(a) + '</div>' +
      '<div class="r-meta"><span>' + esc(a.author || '') + '</span><span>' + esc(G.fmtDate(a.createdAt)) +
      (Number(a.usedCount) ? ' · 사용 ' + Number(a.usedCount) + '회' : '') + '</span>' +
      (state.user ? '<button class="g-fav' + (fav ? ' on' : '') + '" data-act="fav" data-id="' + esc(a.id) + '" aria-pressed="' + fav + '" aria-label="즐겨찾기" title="즐겨찾기">★</button>' : '') + '</div>' +
      (state.user ?
        '<button class="g-btn" data-act="open" data-id="' + esc(a.id) + '" style="width:100%">자료 보기</button>' :
        '<button class="g-btn secondary" data-act="login" style="width:100%">로그인 후 이용가능</button>') +
      '</div></div>';
  }

  function renderList() {
    var chipBox = document.getElementById('chipBox');
    if (!chipBox) return;
    renderTags();
    chipBox.innerHTML = chipsHtml();
    var list = sorted(state.items.filter(function (a) { return matches(a, state.f); }));
    document.getElementById('countNum').textContent = list.length;
    var grid = document.getElementById('gridBox');
    if (!list.length) {
      grid.innerHTML = '<div class="g-card g-empty">' + (state.items.length ? '검색 조건에 맞는 자료가 없습니다. <button class="g-btn small secondary" data-act="reset" style="margin-left:.5rem">검색 조건 초기화</button>' : '아직 등록된 자료가 없어요.') + '</div>';
    } else {
      grid.innerHTML = '<div class="g-grid cols-3">' + list.map(function (a) { return cardHtml(a, false); }).join('') + '</div>';
    }
    var fbox = document.getElementById('featuredBox');
    var feat = sorted(state.items.filter(function (a) { return a.featured; }));
    fbox.innerHTML = filtering() || !feat.length ? '' :
      '<div class="g-section-title">추천 자료</div><div class="g-grid cols-3">' + feat.slice(0, 3).map(function (a) { return cardHtml(a, true); }).join('') + '</div>';
  }

  // ---------- 권한 ----------

  function requireMember(msg) {
    if (!state.user) { G.openLogin(msg || '로그인한 회원만 이용할 수 있어요.'); return false; }
    if (!isMember()) { G.toast('가입 승인 후 이용할 수 있어요.', 'error'); return false; }
    return true;
  }

  function toggleFav(id) {
    if (!requireMember('즐겨찾기는 로그인한 회원만 쓸 수 있어요.')) return;
    var on = state.favs.indexOf(id) !== -1;
    G.db.collection('users').doc(state.profile.uid).update({
      favResources: on ? G.FV.arrayRemove(id) : G.FV.arrayUnion(id)
    }).then(function () {
      state.favs = on ? state.favs.filter(function (x) { return x !== id; }) : state.favs.concat([id]);
      G.toast(on ? '즐겨찾기에서 뺐어요.' : '즐겨찾기에 담았어요.');
      renderList();
      if (detailAlive() && detail.item.id === id) renderActions();
    }).catch(function (e) {
      console.error('즐겨찾기 저장 실패:', e);
      G.toast('즐겨찾기를 저장하지 못했습니다.', 'error');
    });
  }

  // ---------- 상세 ----------

  function detailAlive() {
    if (detail && detail.m.el.isConnected) return true;
    detail = null;
    return false;
  }

  function openDetail(id) {
    if (!state.user) { G.openLogin('로그인하시면 자료의 상세 정보를 보고 다운로드할 수 있습니다.'); return; }
    var a = findItem(id);
    if (!a) return;
    detail = { item: a, used: false, usedKnown: !isMember(), reviews: [], rs: 'idle' };
    detail.m = G.openModal('', { wide: true });
    renderDetail();
    loadExtras(detail);
  }

  function loadExtras(d) {
    if (!isMember()) return;
    var ref = G.db.collection('resources').doc(d.item.id);
    ref.collection('uses').doc(state.profile.uid).get().then(function (s) { d.used = s.exists; })
      .catch(function (e) { console.warn('사용 기록 조회 실패:', e); })
      .then(function () { d.usedKnown = true; if (detail === d && detailAlive()) renderActions(); });
    loadReviews(d);
  }

  function loadReviews(d) {
    d.rs = 'loading';
    if (detail === d && detailAlive()) renderReviews();
    G.db.collection('resources').doc(d.item.id).collection('reviews').get().then(function (s) {
      d.reviews = s.docs.map(function (x) { return Object.assign({}, x.data(), { id: x.id }); })
        .sort(function (a, b) { return (G.toDate(b.updatedAt) || 0) - (G.toDate(a.updatedAt) || 0); });
      d.rs = 'ok';
    }).catch(function (e) {
      console.warn('후기 조회 실패:', e);
      d.rs = 'error';
    }).then(function () { if (detail === d && detailAlive()) renderReviews(); });
  }

  function infoBlock(label, text) {
    return text ? '<div><div class="g-label">' + label + '</div><div class="g-item-body" style="margin-top:0">' + esc(text) + '</div></div>' : '';
  }

  function previewHtml(url) {
    var safe = G.safeUrl(url);
    if (!safe) return '<div class="g-error">유효하지 않은 URL입니다</div>';
    var frame = canFrame(safe), google = hasAny(hostOf(safe), GOOGLE_HOSTS);
    var script = hostOf(safe).indexOf('script.google.com') !== -1, file = isFileLink(safe);
    var heading = frame ? '페이지 미리보기' : google ? (script ? '스크립트 미리보기' : '페이지 미리보기') : file ? '파일 정보' : '링크 미리보기';
    var open = function (label) {
      return '<a class="g-btn" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    };
    var body;
    if (frame) {
      body = '<iframe src="' + esc(safe) + '" title="페이지 미리보기" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>' +
        '<div style="padding:1rem;text-align:center;border-top:1px solid #e5e7eb">' +
        '<p class="g-muted g-small" style="margin-bottom:.5rem">미리보기가 보이지 않으면 새 탭에서 열어 주세요.</p>' + open('새 탭에서 열기') + '</div>';
    } else if (google) {
      body = '<div class="r-preview-box"><h4>' + (script ? 'Google Apps Script 웹 앱' : file ? '파일 공유' : '웹 애플리케이션') + '</h4>' +
        (script ? '' : '<p class="g-muted g-small" style="margin-bottom:1rem">' + (file ? '아래 버튼을 클릭하여 파일을 확인하고 다운로드 받으세요' : '아래 버튼을 클릭하여 새 탭에서 확인하세요') + '</p>') +
        open(script ? '스크립트 확인하기' : file ? '파일 다운로드' : '자료 확인하기') + '</div>';
    } else {
      body = '<div class="r-preview-box"><h4>웹페이지 공유</h4>' + open('링크 방문하기') + '</div>';
    }
    return '<div class="g-label" style="margin:1rem 0 .5rem">' + heading + '</div>' +
      '<div class="r-preview"><div class="r-preview-bar">' + esc(safe) + '</div>' + body + '</div>';
  }

  // 전체는 열 때 한 번만, 이후엔 버튼 줄·후기만 부분 갱신(작성 중인 후기 보호)
  function renderDetail() {
    if (!detailAlive()) return;
    var a = detail.item;
    var kind = linkKind(a.downloadUrl || '');
    var img = G.safeUrl(a.imageUrl);
    var w = a.relatedWebinarId ? webinarById(a.relatedWebinarId) : null;
    var webapp = a.kind === 'webapp';
    detail.m.el.innerHTML =
      '<div class="g-row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap;margin-bottom:.5rem">' +
      '<h3 style="margin:0;word-break:break-word">' + esc(a.title) + (a.featured ? ' <span class="g-tag yellow" style="vertical-align:middle">추천</span>' : '') + '</h3>' +
      '<button class="g-btn secondary small" data-close>닫기</button></div>' +
      '<p class="g-item-body" style="margin:0 0 .75rem">' + esc(a.description || '') + '</p>' +
      (img ? '<div class="r-thumb" style="margin-bottom:.75rem"><img src="' + esc(img) + '" alt="' + esc(a.title) + ' 대표 이미지"></div>' : '') +
      '<div class="g-grid cols-2" style="margin-bottom:.5rem">' +
      '<div class="g-muted"><b style="color:#374151">자료 제작자:</b> ' + esc(a.author || '') + '</div>' +
      '<div class="g-muted"><b style="color:#374151">등록일:</b> ' + esc(G.fmtDate(a.createdAt)) + '</div>' +
      '<div class="g-muted"><b style="color:#374151">링크 종류:</b> ' + esc(kind.title) + '</div>' +
      (w ? '<div class="g-muted"><b style="color:#374151">관련 웨비나:</b> ' + esc(w.title || '') + '</div>' : '') + '</div>' +
      '<div style="margin-bottom:.5rem">' + tagsOf(a).map(function (t) { return '<span class="g-tag">#' + esc(t) + '</span>'; }).join('') + axisTags(a) + '</div>' +
      (webapp ? '<div class="g-grid cols-2" style="margin:.75rem 0">' +
        infoBlock('해결하려는 교육 문제', a.problem) + infoBlock('주요 기능', a.features) +
        infoBlock('실제 활용 방법', a.howToUse) + infoBlock('사용 시 주의점', a.cautions) + '</div>' +
        '<div class="g-notice">로그인 필요: <b>' + (a.loginRequired ? '예' : '아니오') + '</b> · 학생 개인정보 입력: <b>' + (a.personalData ? '있음' : '없음') + '</b></div>' : '') +
      previewHtml(a.downloadUrl || '') +
      '<div id="dActions"></div><hr class="g-sep"><div id="dReviews"></div>';
    renderActions();
    renderReviews();
  }

  function renderActions() {
    if (!detailAlive()) return;
    var box = detail.m.el.querySelector('#dActions');
    if (!box) return;
    var a = detail.item;
    var fav = state.favs.indexOf(a.id) !== -1;
    box.innerHTML = '<div class="g-row" style="margin-top:1rem">' +
      (detail.used ? '<button class="g-btn secondary" disabled>사용해 봤어요 ✓</button>' :
        '<button class="g-btn secondary" data-act="used" data-id="' + esc(a.id) + '"' + (detail.usedKnown ? '' : ' disabled') + '>사용해 봤어요</button>') +
      '<button class="g-btn secondary' + (fav ? ' on' : '') + '" data-act="fav" data-id="' + esc(a.id) + '" aria-pressed="' + fav + '">' + (fav ? '★ 즐겨찾기됨' : '☆ 즐겨찾기') + '</button>' +
      '<span class="g-muted">' + (Number(a.usedCount) || 0) + '명이 사용해 봤어요</span></div>';
  }

  function markUsed(id) {
    if (!requireMember('사용 기록은 로그인한 회원만 남길 수 있어요.')) return;
    var d = detail;
    if (!d || !detailAlive() || d.item.id !== id || d.used) return;
    var ref = G.db.collection('resources').doc(id);
    var batch = G.db.batch();
    // 규칙: uses/{내uid}를 같은 배치에서 처음 만들 때만 usedCount +1 허용
    batch.set(ref.collection('uses').doc(state.profile.uid), { uid: state.profile.uid, at: G.FV.serverTimestamp() });
    batch.update(ref, { usedCount: G.FV.increment(1) });
    d.used = true;
    renderActions();
    batch.commit().then(function () {
      d.item.usedCount = (Number(d.item.usedCount) || 0) + 1;
      G.toast('사용 기록을 남겼어요. 후기도 남겨 주시면 제작자에게 큰 도움이 돼요.');
      if (detail === d) renderActions();
      renderList();
    }).catch(function (e) {
      console.error('사용 기록 저장 실패:', e);
      d.used = false;
      if (detail === d) renderActions();
      G.toast('사용 기록을 남기지 못했습니다. (' + (e.code || e.message) + ')', 'error');
    });
  }

  // ---------- 후기 ----------

  function qa(label, text) {
    return text ? '<div class="g-item-body"><b style="color:#374151">' + label + '</b> · ' + esc(text) + '</div>' : '';
  }

  function renderReviews() {
    if (!detailAlive()) return;
    var d = detail;
    var box = d.m.el.querySelector('#dReviews');
    if (!box) return;
    var title = '<div class="g-card-title">활용 후기</div>';
    if (!isMember()) { box.innerHTML = title + '<p class="g-muted">가입 승인 후 후기를 보고 남길 수 있어요.</p>'; return; }
    if (d.rs === 'idle' || d.rs === 'loading') { box.innerHTML = title + G.loadingHtml('후기를 불러오는 중...'); return; }
    if (d.rs === 'error') {
      box.innerHTML = title + G.errorHtml('후기를 불러오지 못했습니다.', 'retryReviews');
      box.querySelector('#retryReviews').addEventListener('click', function () { loadReviews(d); });
      return;
    }
    var uid = state.profile.uid;
    var mine = d.reviews.filter(function (r) { return r.id === uid; })[0] || {};
    box.innerHTML = title +
      (d.reviews.length ? '<ul class="g-list">' + d.reviews.map(function (r) {
        return '<li class="g-item"><div class="g-item-head"><div class="g-item-title">' + esc(r.userName || '회원') + '</div>' +
          '<div class="g-item-meta">' + esc(G.fmtDate(r.updatedAt || r.createdAt)) + '</div></div>' +
          qa('어떤 수업에서 사용했나요?', r.lesson) + qa('가장 도움이 된 점', r.helpful) + qa('개선되면 좋을 점', r.improve) +
          (REUSE[r.reuse] ? qa('다시 활용할 의향', REUSE[r.reuse]) : '') + '</li>';
      }).join('') + '</ul>' : '<p class="g-muted">아직 후기가 없어요. 써 보셨다면 첫 후기를 남겨 주세요.</p>') +
      '<form id="reviewForm" class="g-card" style="background:#f9fafb;margin-top:1rem">' +
      '<div class="g-card-title">' + (mine.uid ? '내 후기 수정' : '후기 남기기') + '</div>' +
      '<div class="g-field"><label class="g-label" for="rvLesson">어떤 수업에서 사용했나요?</label>' +
      '<input class="g-input" id="rvLesson" name="lesson" maxlength="300" value="' + esc(mine.lesson || '') + '"></div>' +
      '<div class="g-field"><label class="g-label" for="rvHelpful">가장 도움이 된 점은 무엇인가요?</label>' +
      '<textarea class="g-textarea" id="rvHelpful" name="helpful" rows="2" maxlength="1000">' + esc(mine.helpful || '') + '</textarea></div>' +
      '<div class="g-field"><label class="g-label" for="rvImprove">개선되면 좋을 점은 무엇인가요?</label>' +
      '<textarea class="g-textarea" id="rvImprove" name="improve" rows="2" maxlength="1000">' + esc(mine.improve || '') + '</textarea></div>' +
      '<div class="g-field"><span class="g-label">다시 활용할 의향이 있나요? *</span><div class="g-radio-row">' +
      Object.keys(REUSE).map(function (k) {
        return '<label><input type="radio" name="reuse" value="' + k + '" required' + (mine.reuse === k ? ' checked' : '') + '>' + REUSE[k] + '</label>';
      }).join('') + '</div></div>' +
      '<div id="rvErr" class="g-error" style="display:none"></div>' +
      '<div class="g-modal-actions" style="margin-top:.5rem"><button type="submit" class="g-btn">' + (mine.uid ? '후기 수정' : '후기 등록') + '</button></div></form>';
    box.querySelector('#reviewForm').addEventListener('submit', function (e) {
      e.preventDefault();
      saveReview(d, e.target, mine.uid ? mine : null);
    });
  }

  function saveReview(d, form, mine) {
    var p = state.profile, a = d.item;
    var data = G.formData(form);
    var err = form.querySelector('#rvErr');
    var btn = form.querySelector('[type=submit]');
    if (!data.lesson && !data.helpful && !data.improve) {
      err.textContent = '세 문항 중 하나 이상 적어 주세요.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    btn.disabled = true;
    var now = G.FV.serverTimestamp();
    var doc = {
      uid: p.uid,
      userName: String(p.displayName || p.email || '').slice(0, 40),
      lesson: String(data.lesson || '').slice(0, 300),
      helpful: String(data.helpful || '').slice(0, 1000),
      improve: String(data.improve || '').slice(0, 1000),
      reuse: REUSE[data.reuse] ? data.reuse : 'maybe',
      updatedAt: now
    };
    var ref = G.db.collection('resources').doc(a.id).collection('reviews').doc(p.uid);
    (mine ? ref.update(doc) : ref.set(Object.assign({ createdAt: now }, doc))).then(function () {
      // 남의 자료에 처음 쓴 후기만 성장패스 '피드백 제공'으로 (자료당 1회)
      if (mine || a.createdBy === p.uid) return false;
      var logId = p.uid + '_feedback_' + a.id;
      return G.db.collection('activityLog').doc(logId).get().then(function (s) {
        if (s.exists) return false;
        return G.addLog(p, { type: 'feedback', status: 'auto', targetId: a.id, targetTitle: String(a.title || '자료').slice(0, 120), visibility: 'private' }, logId)
          .then(function () { return true; });
      }).catch(function (e) { console.warn('피드백 기록 생략:', e); return false; });
    }).then(function (logged) {
      G.toast(mine ? '후기를 수정했어요.' : logged ? '후기를 남겼어요. 성장패스에 피드백 기록이 쌓였어요.' : '후기를 남겼어요.');
      if (detail === d) loadReviews(d);
    }).catch(function (e) {
      console.error('후기 저장 실패:', e);
      err.textContent = '후기를 저장하지 못했습니다. (' + (e.code || e.message) + ')';
      err.style.display = 'block';
      btn.disabled = false;
    });
  }

  // ---------- 등록·수정·삭제 ----------

  function field(name, label, value, opts) {
    opts = opts || {};
    return '<div class="g-field"><label class="g-label" for="rf_' + name + '">' + label + (opts.required ? ' *' : '') + '</label>' +
      '<input class="g-input" id="rf_' + name + '" name="' + name + '" type="' + (opts.type || 'text') + '" value="' + esc(value || '') + '"' +
      (opts.required ? ' required' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + ' placeholder="' + esc(opts.ph || '') + '"></div>';
  }
  function area(name, label, value, opts) {
    opts = opts || {};
    return '<div class="g-field"><label class="g-label" for="rf_' + name + '">' + label + (opts.required ? ' *' : '') + '</label>' +
      '<textarea class="g-textarea" id="rf_' + name + '" name="' + name + '" rows="' + (opts.rows || 2) + '" maxlength="' + (opts.max || 1000) + '"' +
      (opts.required ? ' required' : '') + ' placeholder="' + esc(opts.ph || '') + '">' + esc(value || '') + '</textarea></div>';
  }
  function checks(name, options, selected) {
    selected = selected || [];
    return '<div class="g-radio-row">' + options.map(function (o) {
      return '<label><input type="checkbox" name="' + name + '" value="' + esc(o) + '"' + (selected.indexOf(o) !== -1 ? ' checked' : '') + '>' + esc(o) + '</label>';
    }).join('') + '</div>';
  }
  function yesNo(name, label, value) {
    return '<div class="g-field"><span class="g-label">' + label + '</span><div class="g-radio-row">' +
      '<label><input type="radio" name="' + name + '" value="yes"' + (value === true ? ' checked' : '') + '>예</label>' +
      '<label><input type="radio" name="' + name + '" value="no"' + (value === false ? ' checked' : '') + '>아니오</label></div></div>';
  }

  // 회원가입 교육기관 구분 → 새 자료의 학년 기본 선택.
  // 목록 필터에는 기본값을 걸지 않는다(기존 자료 대부분이 학년 미분류라 걸면 거의 다 숨는다).
  function gradesForSchool(school) {
    if (/^초등/.test(school || '')) return ['초1-2', '초3-4', '초5-6'];
    if (school === '중등') return ['중학교'];
    if (school === '고등') return ['고등학교'];
    return [];
  }

  function openForm(item) {
    if (!requireMember('자료 등록은 로그인한 회원만 할 수 있어요.')) return;
    var isEdit = !!item;
    var a = item || { author: state.profile.displayName || '', grades: gradesForSchool(state.profile.school) };
    var webapp = a.kind === 'webapp';
    var m = G.openModal('<h3>' + (isEdit ? '자료 수정' : '새 자료 등록') + '</h3><form id="resForm">' +
      field('title', '자료 제목', a.title, { required: true, max: 120, ph: '자료 제목을 입력하세요' }) +
      area('description', '자료 설명', a.description, { required: true, rows: 4, max: 3000, ph: '자료에 대한 상세 설명을 입력하세요' }) +
      field('author', '자료 제작자', a.author, { required: true, max: 60, ph: '자료 제작자명을 입력하세요' }) +
      field('downloadUrl', '자료 링크', a.downloadUrl, { required: true, type: 'url', ph: 'https://drive.google.com/... 또는 온라인 자료 링크를 입력하세요' }) +
      field('tags', '태그 (쉼표로 구분)', tagsOf(a).join(', '), { max: 300, ph: 'ChatGPT, AI, 수업설계, 가이드' }) +
      '<details style="margin-bottom:.9rem"' + ((a.grades && a.grades.length) || (a.subjects && a.subjects.length) || (a.activityTypes && a.activityTypes.length) || a.imageUrl ? ' open' : '') + '><summary class="g-label" style="cursor:pointer">분류·대표 이미지 <span class="g-muted">(선택)</span></summary>' +
      AXES.map(function (ax) { return '<div class="g-field"><span class="g-label">' + ax.label + '</span>' + checks(ax.key, ax.options, a[ax.key]) + '</div>'; }).join('') +
      field('imageUrl', '대표 이미지 주소', a.imageUrl, { type: 'url', ph: 'https:// (선택)' }) + '</details>' +
      '<label class="g-check" style="margin-bottom:.75rem"><input type="checkbox" name="webapp" value="1"' + (webapp ? ' checked' : '') + '> 직접 만든 웹앱이에요</label>' +
      '<div class="r-webapp' + (webapp ? ' open' : '') + '" id="webappBox">' +
      area('problem', '해결하려는 교육 문제', a.problem) + area('features', '주요 기능', a.features) +
      area('howToUse', '실제 활용 방법', a.howToUse, { rows: 3 }) + area('cautions', '사용 시 주의점', a.cautions) +
      '<div class="g-grid cols-2">' + yesNo('loginRequired', '로그인이 필요한가요?', webapp ? !!a.loginRequired : undefined) +
      yesNo('personalData', '학생 개인정보를 입력하나요?', webapp ? !!a.personalData : undefined) + '</div>' +
      '<div class="g-field"><label class="g-label" for="rf_web">관련 웨비나 <span class="g-muted">(선택)</span></label>' +
      '<select class="g-select" id="rf_web" name="relatedWebinarId"><option value="">없음</option>' +
      state.webinars.map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (a.relatedWebinarId === w.id ? ' selected' : '') + '>' + esc(G.fmtDate(w.date) + ' · ' + (w.title || '')) + '</option>';
      }).join('') + '</select></div></div>' +
      '<div id="rfErr" class="g-error" style="display:none"></div>' +
      '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>취소</button>' +
      '<button type="submit" class="g-btn">' + (isEdit ? '수정하기' : '등록하기') + '</button></div></form>', { wide: true });

    var form = m.el.querySelector('#resForm');
    form.querySelector('input[name=webapp]').addEventListener('change', function () {
      m.el.querySelector('#webappBox').classList.toggle('open', this.checked);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = G.formData(form);
      var err = form.querySelector('#rfErr');
      var btn = form.querySelector('[type=submit]');
      function fail(msg) { err.textContent = msg; err.style.display = 'block'; btn.disabled = false; }
      if (!/^https:\/\/[^\s]+$/i.test(d.downloadUrl || '')) return fail('자료 링크는 https:// 로 시작해야 해요.');
      if (d.imageUrl && !G.safeUrl(d.imageUrl)) return fail('대표 이미지 주소는 https:// 로 시작해야 해요.');
      var isWeb = d.webapp === '1';
      function pick(ax) { return [].concat(d[ax.key] || []).filter(function (v) { return ax.options.indexOf(v) !== -1; }); }
      var now = G.FV.serverTimestamp();
      var body = {
        title: String(d.title || '').slice(0, 120),
        description: String(d.description || '').slice(0, 3000),
        author: String(d.author || '').slice(0, 60),
        downloadUrl: d.downloadUrl,
        tags: String(d.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 20),
        kind: isWeb ? 'webapp' : 'resource',
        grades: pick(AXES[0]), subjects: pick(AXES[1]), activityTypes: pick(AXES[2]),
        imageUrl: d.imageUrl || '',
        problem: isWeb ? String(d.problem || '').slice(0, 1000) : '',
        features: isWeb ? String(d.features || '').slice(0, 1000) : '',
        howToUse: isWeb ? String(d.howToUse || '').slice(0, 1000) : '',
        cautions: isWeb ? String(d.cautions || '').slice(0, 1000) : '',
        loginRequired: isWeb && d.loginRequired === 'yes',
        personalData: isWeb && d.personalData === 'yes',
        relatedWebinarId: isWeb ? (d.relatedWebinarId || '') : '',
        updatedAt: now
      };
      err.style.display = 'none';
      btn.disabled = true;
      var col = G.db.collection('resources');
      // 수정은 createdBy·featured·usedCount를 보내지 않는다(규칙이 거부)
      var job = isEdit ? col.doc(item.id).update(body) :
        col.add(Object.assign(body, { type: 'resource', format: 'LINK', createdBy: state.profile.uid, featured: false, usedCount: 0, createdAt: now }));
      job.then(function () {
        m.close();
        G.toast(isEdit ? '자료를 수정했어요.' : '자료를 등록했어요.');
        return refresh();
      }).catch(function (ex) {
        console.error('자료 저장 실패:', ex);
        fail('자료 저장에 실패했습니다. (' + (ex.code || ex.message) + ')');
      });
    });
  }

  function deleteItem(id) {
    var a = findItem(id);
    if (!a || !canManage(a)) return;
    G.confirmModal('정말로 이 자료를 삭제하시겠습니까?', '삭제').then(function (ok) {
      if (!ok) return;
      // ponytail: 하위 uses/reviews 문서는 남는다. 관리자 화면에서 정리.
      G.db.collection('resources').doc(id).delete().then(function () {
        G.toast('삭제했어요.');
        return refresh();
      }).catch(function (e) {
        console.error('자료 삭제 실패:', e);
        G.toast('자료 삭제에 실패했습니다.', 'error');
      });
    });
  }

  // ---------- 이벤트 ----------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id') || '';
    if (act === 'open') openDetail(id);
    else if (act === 'fav') toggleFav(id);
    else if (act === 'used') markUsed(id);
    else if (act === 'tag') {
      var t = el.getAttribute('data-val');
      state.tags = state.tags.indexOf(t) !== -1 ? state.tags.filter(function (x) { return x !== t; }) : state.tags.concat([t]);
      renderList();
    }
    else if (act === 'axis') setAxis(el.getAttribute('data-axis'), el.getAttribute('data-val') || '');
    else if (act === 'webonly') { state.webOnly = !state.webOnly; renderList(); }
    else if (act === 'favonly') { if (requireMember('즐겨찾기는 로그인한 회원만 쓸 수 있어요.')) { state.favOnly = !state.favOnly; renderList(); } }
    else if (act === 'reset') resetFilters();
    else if (act === 'register') openForm(null);
    else if (act === 'edit') { var it = findItem(id); if (it && canManage(it)) openForm(it); }
    else if (act === 'del') deleteItem(id);
    else if (act === 'login') G.openLogin('로그인하시면 자료의 상세 정보를 보고 다운로드할 수 있습니다.');
  });

  G.onUser(function (user, profile) {
    state.user = user;
    state.profile = profile;
    if (!isMember()) { state.favOnly = false; state.favs = []; }
    renderBanner();
    loadFavs().then(function () {
      if (!state.started) { state.started = true; load(); return; }
      if (!state.loaded) return;
      renderGuest();
      renderList();
      if (detailAlive()) {
        if (!user) detail.m.close();
        else { detail.used = false; detail.usedKnown = !isMember(); renderDetail(); loadExtras(detail); }
      }
    });
  });
})();
