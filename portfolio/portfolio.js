/**
 * 성장 포트폴리오
 * - 목록(/portfolio/) · 만들기(?new=1) · 수정(?edit=문서ID) · 보기(?id=문서ID)
 * - 저장본은 스냅샷: 저장 시점의 원장 항목을 복사해 두고, 보기 화면은 저장된 items만 그린다(원장 재조회 없음)
 * - 공유: shareMode 'link'면 링크를 아는 사람 누구나 읽기(문서 ID는 추측 불가한 자동 ID), 'off'면 본인·관리자만
 */
(function () {
  'use strict';

  var G = window.G, R = G.R, esc = G.esc;
  var MAX_ITEMS = 300;
  var viewId = G.param('id');
  var editId = G.param('edit');
  var isNew = G.param('new') === '1';

  var main = viewId ? G.shell({ bare: true }) : G.shell({
    active: '/growth/',
    title: isNew ? '새 포트폴리오 만들기' : editId ? '포트폴리오 수정' : '내 포트폴리오',
    subtitle: '쌓인 기록 중 담고 싶은 것만 골라 한 권으로 묶어요.'
  });

  var state = { profile: null, ledger: [], builder: null };

  function wrap(html) { return '<div class="g-wrap g-body">' + html + '</div>'; }

  function showError(msg, retry) {
    main.innerHTML = wrap(G.errorHtml(msg, retry ? 'pfRetry' : ''));
    if (retry) document.getElementById('pfRetry').addEventListener('click', retry);
  }

  function stampOf(type) { return R.TYPES[type] ? R.TYPES[type].stamp : 'other'; }
  var GROUP_ORDER = Object.keys(R.STAMPS).concat(['other']);
  function groupLabel(k) { return R.STAMPS[k] ? R.STAMPS[k].label : '기타'; }

  // ---------- 기간 ----------

  // key: term(이번 학기) | prev(지난 학기) | year(학년도) | custom(직접 선택, from·to는 YYYY-MM-DD)
  function periodOf(key, from, to) {
    var now = new Date();
    if (key === 'custom') {
      var f = G.toDate(from), t = G.toDate(to);
      if (!f || !t || f > t) return null;
      t = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);
      return { key: key, from: f, to: t, label: G.fmtDate(f) + ' ~ ' + G.fmtDate(t) };
    }
    if (key === 'year') {
      var sy = R.schoolYearOf(now);
      return { key: key, from: new Date(sy, 2, 1), to: new Date(sy + 1, 2, 0, 23, 59, 59), label: sy + '학년도' };
    }
    var term = R.termOf(now);
    if (key === 'prev') {
      var p = term.split('-');
      term = p[1] === '2' ? p[0] + '-1' : (Number(p[0]) - 1) + '-2';
    }
    var rg = R.termRange(term);
    return { key: key, from: rg.from, to: rg.to, label: R.termLabel(term) };
  }

  var PERIOD_KEYS = [['term', '이번 학기'], ['prev', '지난 학기'], ['year', '올해(학년도)'], ['custom', '직접 선택']];

  // ---------- 목록 ----------

  function renderList() {
    var actions = document.getElementById('gBannerActions');
    if (actions) actions.innerHTML = '<a class="g-btn white" href="/portfolio/?new=1">새 포트폴리오 만들기</a><a class="g-btn ghost-white" href="/growth/">성장패스로</a>';
    main.innerHTML = G.loadingHtml('포트폴리오를 불러오는 중...');
    G.db.collection('portfolios').where('uid', '==', state.profile.uid).get().then(function (s) {
      var list = s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (p) { return p.kind === 'personal'; });
      list.sort(function (a, b) {
        var ta = G.toDate(a.updatedAt) || G.toDate(a.createdAt), tb = G.toDate(b.updatedAt) || G.toDate(b.createdAt);
        return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
      });
      if (!list.length) {
        main.innerHTML = wrap('<div class="g-card g-empty">아직 만든 포트폴리오가 없어요.<br><br><a class="g-btn" href="/portfolio/?new=1">새 포트폴리오 만들기</a></div>');
        return;
      }
      main.innerHTML = wrap('<div class="g-grid cols-3">' + list.map(function (p) {
        var shared = p.shareMode === 'link';
        return '<div class="g-card">' +
          '<span class="g-tag ' + (shared ? 'green' : '') + '">' + (shared ? '링크 공유 중' : '비공개') + '</span>' +
          '<div class="g-item-title" style="margin:.35rem 0">' + esc(p.title || '제목 없음') + '</div>' +
          '<div class="g-item-meta">' + esc(p.period && p.period.label || '') + ' · 기록 ' + (Array.isArray(p.items) ? p.items.length : 0) + '건</div>' +
          '<div class="g-item-meta">수정 ' + esc(G.fmtDate(p.updatedAt || p.createdAt)) + '</div>' +
          '<div class="g-row" style="gap:.35rem;margin-top:.75rem">' +
          '<a class="g-btn small" href="/portfolio/?id=' + encodeURIComponent(p.id) + '">열기</a>' +
          '<a class="g-btn small secondary" href="/portfolio/?edit=' + encodeURIComponent(p.id) + '">수정</a>' +
          '<button class="g-btn small danger" data-del="' + esc(p.id) + '">삭제</button></div></div>';
      }).join('') + '</div>');
      main.querySelectorAll('[data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          G.confirmModal('이 포트폴리오를 삭제할까요? 공유 링크도 더 이상 열리지 않아요. 원래 활동 기록은 남습니다.', '삭제').then(function (ok) {
            if (!ok) return;
            G.db.collection('portfolios').doc(b.getAttribute('data-del')).delete().then(function () {
              G.toast('삭제했어요.');
              renderList();
            }).catch(function (e) { G.toast('삭제하지 못했습니다. (' + (e.code || e.message) + ')', 'error'); });
          });
        });
      });
    }).catch(function (e) {
      console.error('포트폴리오 목록 조회 실패:', e);
      showError('포트폴리오를 불러오지 못했습니다. (' + (e.code || e.message) + ')', renderList);
    });
  }

  // ---------- 만들기·수정 ----------

  function startBuilder() {
    main.innerHTML = G.loadingHtml('기록을 불러오는 중...');
    var p = state.profile;
    var docJob = editId ? G.db.collection('portfolios').doc(editId).get() : Promise.resolve(null);
    Promise.all([G.loadLedger(p.uid), docJob]).then(function (r) {
      state.ledger = r[0].filter(function (e) { return e.status !== 'rejected' && e.at; });
      var b = {
        editId: editId || '', key: 'term', from: '', to: '',
        checked: {}, defaultOn: true,
        title: '', titleTouched: false, intro: '', goal: ''
      };
      if (editId) {
        var snap = r[1];
        if (!snap || !snap.exists) { showError('포트폴리오를 찾을 수 없습니다.'); return; }
        var d = snap.data();
        if (d.uid !== p.uid || d.kind !== 'personal') { showError('내가 만든 개인 포트폴리오만 수정할 수 있어요.'); return; }
        var per = d.period || {};
        // 저장한 날짜 범위를 그대로 유지(학기가 바뀌어도 범위가 밀리지 않게)
        b.key = 'custom';
        b.from = per.from || ''; b.to = per.to || '';
        b.customLabel = per.label || '';
        b.title = d.title || ''; b.titleTouched = true;
        b.intro = d.intro || ''; b.goal = d.goal || '';
        b.defaultOn = false;
        (d.itemSourceIds || []).forEach(function (id) { b.checked[id] = true; });
      }
      state.builder = b;
      renderBuilder();
    }).catch(function (e) {
      console.error('포트폴리오 준비 실패:', e);
      showError('기록을 불러오지 못했습니다. (' + (e.code || e.message) + ')', startBuilder);
    });
  }

  function currentPeriod() {
    var b = state.builder;
    var per = periodOf(b.key, b.from, b.to);
    if (per && b.key === 'custom' && b.customLabel && b.editId) per.label = b.customLabel;
    return per;
  }

  function inRange(per) {
    if (!per) return [];
    return state.ledger.filter(function (e) { return e.at >= per.from && e.at <= per.to; });
  }

  function isChecked(e) {
    var b = state.builder;
    if (Object.prototype.hasOwnProperty.call(b.checked, e.id)) return b.checked[e.id];
    return b.defaultOn && e.status !== 'pending';
  }

  function defaultTitle(per) {
    var name = state.profile.displayName || '나';
    return name + '의 ' + (per ? per.label : '') + ' 성장 포트폴리오';
  }

  function renderBuilder() {
    var b = state.builder;
    var per = currentPeriod();
    if (!b.titleTouched) b.title = defaultTitle(per);
    var items = inRange(per);

    var periodCard = '<div class="g-card"><div class="g-card-title">1. 기간</div><div class="g-chips">' +
      PERIOD_KEYS.map(function (k) {
        return '<button type="button" class="g-chip' + (b.key === k[0] ? ' on' : '') + '" data-key="' + k[0] + '">' + k[1] + '</button>';
      }).join('') + '</div>' +
      (b.key === 'custom' ? '<div class="g-row" style="margin-top:.75rem">' +
        '<input class="g-input" type="date" id="pfFrom" value="' + esc(b.from) + '" style="max-width:200px" aria-label="시작일"> ~ ' +
        '<input class="g-input" type="date" id="pfTo" value="' + esc(b.to) + '" style="max-width:200px" aria-label="종료일"></div>' : '') +
      '<p class="g-muted" style="margin-top:.6rem">' + (per ? esc(per.label) + ' (' + G.fmtDate(per.from) + ' ~ ' + G.fmtDate(per.to) + ')' : '시작일과 종료일을 골라주세요.') + '</p></div>';

    var pickCard = '<div class="g-card"><div class="g-card-title"><span>2. 담을 기록 <span class="g-muted" id="pfCount" style="font-weight:500"></span></span>' +
      '<span class="g-row" style="gap:.35rem"><button type="button" class="g-btn small secondary" data-all="1">전체 선택</button>' +
      '<button type="button" class="g-btn small secondary" data-all="0">전체 해제</button></span></div>';
    if (!items.length) {
      pickCard += '<div class="g-empty">이 기간에 남긴 기록이 없어요. 기간을 바꿔 보세요.</div>';
    } else {
      GROUP_ORDER.forEach(function (k) {
        var group = items.filter(function (e) { return stampOf(e.type) === k; });
        if (!group.length) return;
        pickCard += '<div style="margin-top:.75rem;font-weight:700;color:#374151">' + groupLabel(k) + ' <span class="g-muted">' + group.length + '</span></div>' +
          group.map(function (e) {
            return '<label class="g-select-item"><input type="checkbox" data-pick="' + esc(e.id) + '"' + (isChecked(e) ? ' checked' : '') + '>' +
              '<span>' + G.typeTag(e.type) + (e.status === 'pending' ? '<span class="g-tag yellow">확인 대기</span>' : '') +
              '<span class="g-item-title" style="display:block">' + esc(e.title || (R.TYPES[e.type] ? R.TYPES[e.type].label : '')) + '</span>' +
              '<span class="g-item-meta">' + G.fmtDate(e.at) + '</span></span></label>';
          }).join('');
      });
    }
    pickCard += '</div>';

    var textCard = '<div class="g-card"><div class="g-card-title">3. 소개와 목표</div>' +
      '<div class="g-field"><label class="g-label" for="pfTitle">제목 *</label><input class="g-input" id="pfTitle" maxlength="120" value="' + esc(b.title) + '"></div>' +
      '<div class="g-field"><label class="g-label" for="pfIntro">소개</label><textarea class="g-textarea" id="pfIntro" rows="3" maxlength="2000" placeholder="이 기간에 무엇에 집중했는지 짧게 적어 보세요">' + esc(b.intro) + '</textarea></div>' +
      '<div class="g-field"><label class="g-label" for="pfGoal">다음 학기 성장 목표</label><textarea class="g-textarea" id="pfGoal" rows="3" maxlength="2000">' + esc(b.goal) + '</textarea></div>' +
      '<p class="g-muted g-small">저장하면 선택한 기록이 이 시점 그대로 복사돼요. 처음에는 나만 볼 수 있고, 보기 화면에서 링크 공유를 켤 수 있어요.</p>' +
      '<div id="pfErr" class="g-error" style="display:none;margin-top:.75rem"></div>' +
      '<div class="g-modal-actions"><a class="g-btn secondary" href="/portfolio/">취소</a><button type="button" class="g-btn" id="pfSave">저장</button></div></div>';

    main.innerHTML = wrap(periodCard + pickCard + textCard);
    updateCount();
    bindBuilder();
  }

  function updateCount() {
    var el = document.getElementById('pfCount');
    if (!el) return;
    var items = inRange(currentPeriod());
    var n = items.filter(isChecked).length;
    el.textContent = '선택 ' + n + ' / ' + items.length;
  }

  function bindBuilder() {
    var b = state.builder;
    main.querySelectorAll('[data-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        b.key = btn.getAttribute('data-key');
        b.customLabel = '';
        if (b.key === 'custom' && !b.from) {
          var cur = periodOf('term');
          b.from = G.ymd(cur.from); b.to = G.ymd(cur.to);
        }
        renderBuilder();
      });
    });
    ['pfFrom', 'pfTo'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () {
        if (id === 'pfFrom') b.from = el.value; else b.to = el.value;
        b.customLabel = '';
        renderBuilder();
      });
    });
    main.querySelectorAll('[data-pick]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        b.checked[cb.getAttribute('data-pick')] = cb.checked;
        updateCount();
      });
    });
    main.querySelectorAll('[data-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var on = btn.getAttribute('data-all') === '1';
        inRange(currentPeriod()).forEach(function (e) { b.checked[e.id] = on; });
        main.querySelectorAll('[data-pick]').forEach(function (cb) { cb.checked = on; });
        updateCount();
      });
    });
    document.getElementById('pfTitle').addEventListener('input', function (e) { b.title = e.target.value; b.titleTouched = true; });
    document.getElementById('pfIntro').addEventListener('input', function (e) { b.intro = e.target.value; });
    document.getElementById('pfGoal').addEventListener('input', function (e) { b.goal = e.target.value; });
    document.getElementById('pfSave').addEventListener('click', save);
  }

  // Firestore는 undefined를 못 받으므로 문자열 값만 복사
  function cleanAnswers(a) {
    var out = {};
    Object.keys(a || {}).forEach(function (k) { if (typeof a[k] === 'string' && a[k]) out[k] = a[k]; });
    return out;
  }

  function snapshotItem(e) {
    return {
      type: e.type,
      title: String(e.title || '').slice(0, 200),
      at: G.ymd(e.at),
      status: e.status || 'auto',
      answers: cleanAnswers(e.answers),
      evidence: (e.evidence || []).filter(function (ev) { return ev && G.safeUrl(ev.url); }).map(function (ev) {
        return { url: G.safeUrl(ev.url), label: String(ev.label || '').slice(0, 60) };
      }),
      body: String(e.body || '').slice(0, 500),
      userName: String(e.userName || '')
    };
  }

  function save() {
    var b = state.builder;
    var err = document.getElementById('pfErr');
    var btn = document.getElementById('pfSave');
    function fail(msg) { err.textContent = msg; err.style.display = 'block'; btn.disabled = false; }
    var per = currentPeriod();
    if (!per) return fail('기간을 올바르게 골라주세요.');
    var selected = inRange(per).filter(isChecked);
    if (!selected.length) return fail('담을 기록을 하나 이상 골라주세요.');
    if (selected.length > MAX_ITEMS) return fail('기록은 최대 ' + MAX_ITEMS + '개까지 담을 수 있어요. 지금 ' + selected.length + '개가 선택됐어요.');
    var title = String(b.title || '').trim();
    if (!title) return fail('제목을 입력해주세요.');
    err.style.display = 'none';
    btn.disabled = true;

    var p = state.profile;
    Promise.all([G.loadBadgeRules(), G.loadGrants(p.uid)]).then(function (r) {
      var badges = R.evaluateBadges(r[0], state.ledger, r[1], new Date()).filter(function (x) { return x.earned; }).map(function (x) {
        return { name: String(x.rule.name || ''), desc: String(x.rule.desc || ''), image: G.safeUrl(x.rule.image) };
      });
      var data = {
        ownerName: p.displayName || p.email || '',
        ownerSchool: p.school || '',  // 회원가입 교육기관 구분 (초등·중등 등)
        title: title.slice(0, 120),
        intro: String(b.intro || '').trim().slice(0, 2000),
        goal: String(b.goal || '').trim().slice(0, 2000),
        period: { key: per.key, from: G.ymd(per.from), to: G.ymd(per.to), label: per.label },
        items: selected.map(snapshotItem),
        itemSourceIds: selected.map(function (e) { return e.id; }),
        stamps: R.stampCounts(selected, 'all'),
        badges: badges,
        updatedAt: G.FV.serverTimestamp()
      };
      if (b.editId) {
        return G.db.collection('portfolios').doc(b.editId).update(data).then(function () { return b.editId; });
      }
      data.kind = 'personal';
      data.uid = p.uid;
      data.shareMode = 'off';
      data.createdAt = G.FV.serverTimestamp();
      return G.db.collection('portfolios').add(data).then(function (ref) { return ref.id; });
    }).then(function (id) {
      location.href = '/portfolio/?id=' + encodeURIComponent(id);
    }).catch(function (e) {
      console.error('포트폴리오 저장 실패:', e);
      fail('저장하지 못했습니다. (' + (e.code || e.message) + ')');
    });
  }

  // ---------- 보기 ----------

  function renderView() {
    main.innerHTML = G.loadingHtml('포트폴리오를 불러오는 중...');
    G.db.collection('portfolios').doc(viewId).get().then(function (snap) {
      if (!snap.exists) return notFound();
      drawView(Object.assign({ id: snap.id }, snap.data()));
    }).catch(function (e) {
      if (e && e.code === 'permission-denied') return notFound();
      console.error('포트폴리오 조회 실패:', e);
      showError('포트폴리오를 불러오지 못했습니다. (' + (e.code || e.message) + ')', renderView);
    });
  }

  function notFound() {
    main.innerHTML = wrap('<div class="g-card g-empty">공유가 중단되었거나 없는 포트폴리오입니다.' +
      (state.profile ? '' : '<br><br><button class="g-btn secondary" id="pfLogin">본인 포트폴리오라면 로그인</button>') + '</div>');
    var btn = document.getElementById('pfLogin');
    if (btn) btn.addEventListener('click', function () { G.openLogin(); });
  }

  function membersText(members) {
    return (members || []).map(function (m) {
      return typeof m === 'string' ? m : (m && (m.name || m.displayName)) || '';
    }).filter(Boolean).join(', ');
  }

  function section(title, inner) {
    return '<div class="g-doc-section"><h2>' + esc(title) + '</h2>' + inner + '</div>';
  }

  function drawView(doc) {
    var p = state.profile;
    var isGroup = doc.kind === 'group';
    var canManage = !!(p && (p.uid === doc.uid || p.isAdmin));
    var shared = doc.shareMode === 'link';
    var url = location.origin + '/portfolio/?id=' + encodeURIComponent(doc.id);
    var per = doc.period || {};
    var items = Array.isArray(doc.items) ? doc.items : [];

    var tools = '';
    if (canManage) {
      tools = '<div class="g-card no-print" style="margin-bottom:1.25rem"><div class="g-row" style="gap:.4rem">' +
        '<span class="g-tag ' + (shared ? 'green' : '') + '" style="margin:0">' + (shared ? '링크 공유 중' : '비공개 (나와 운영진만)') + '</span>' +
        '<button class="g-btn small' + (shared ? ' secondary' : '') + '" data-tool="share">' + (shared ? '공유 중단' : '링크 공유 켜기') + '</button>' +
        (shared ? '<button class="g-btn small secondary" data-tool="copy">링크 복사</button>' : '') +
        '<button class="g-btn small secondary" data-tool="print">PDF 저장</button>' +
        (!isGroup && p.uid === doc.uid ? '<a class="g-btn small secondary" href="/portfolio/?edit=' + encodeURIComponent(doc.id) + '">수정</a>' : '') +
        '<a class="g-btn small secondary" href="' + (isGroup ? '/admin/growth/' : '/portfolio/') + '">목록으로</a></div>' +
        (shared ? '<input class="g-input" id="pfUrl" readonly value="' + esc(url) + '" style="margin-top:.6rem" aria-label="공유 링크">' : '') +
        '</div>';
    }

    var head = '<div class="g-doc-head"><div class="g-muted">' + (isGroup ? '소모임 포트폴리오' : '개인 성장 포트폴리오') + '</div>' +
      '<h1>' + esc(doc.title || '') + '</h1>' +
      '<div class="g-muted" style="margin-top:.35rem">' + esc([isGroup ? (doc.groupName || '') : (doc.ownerName || ''), isGroup ? '' : (doc.ownerSchool || ''), per.label || ''].filter(Boolean).join(' · ')) +
      (per.from ? ' (' + esc(G.fmtDate(per.from)) + ' ~ ' + esc(G.fmtDate(per.to)) + ')' : '') + '</div></div>';

    var body = '';
    if (doc.intro) body += section(isGroup ? '소모임 목표와 활동 주제' : '소개', '<div class="g-item-body">' + esc(doc.intro) + '</div>');
    if (isGroup) {
      var names = membersText(doc.members);
      body += section('참여 회원', '<div class="g-item-body">' + (names ? esc(names) : '<span class="g-muted">기록 없음</span>') + '</div>');
    }
    body += section('스탬프 요약', G.stampsHtml(doc.stamps || {}));
    if (Array.isArray(doc.badges) && doc.badges.length) {
      body += section('획득한 배지', '<div class="g-badges">' + doc.badges.map(function (bd) {
        return G.badgeHtml({ rule: { name: bd.name, desc: bd.desc, image: bd.image }, earned: true });
      }).join('') + '</div>');
    }
    GROUP_ORDER.forEach(function (k) {
      var group = items.filter(function (it) { return stampOf(it.type) === k; });
      if (!group.length) return;
      body += section(groupLabel(k) + ' 기록 (' + group.length + ')', '<ul class="g-list">' + group.map(function (it, i) {
        return G.entryHtml({
          id: k + '_' + i, source: 'snapshot', type: it.type, title: it.title, at: G.toDate(it.at),
          status: it.status, answers: it.answers || {}, evidence: it.evidence || [], body: it.body || '', userName: it.userName || ''
        }, { showUser: isGroup });
      }).join('') + '</ul>');
    });
    if (!items.length) body += section('활동 기록', '<div class="g-empty">담긴 기록이 없어요.</div>');
    if (doc.goal) body += section(isGroup ? '향후 활동 계획' : '다음 학기 성장 목표', '<div class="g-item-body">' + esc(doc.goal) + '</div>');
    body += '<p class="g-muted g-small" style="margin-top:2rem">G-DEAL 성장패스 · 저장일 ' + esc(G.fmtDate(doc.updatedAt || doc.createdAt)) + '</p>';

    main.innerHTML = wrap('<div class="g-doc">' + tools + head + body + '</div>');
    document.title = (doc.title || '포트폴리오') + ' | G-DEAL';

    main.querySelectorAll('[data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tool = btn.getAttribute('data-tool');
        if (tool === 'print') { window.print(); return; }
        if (tool === 'copy') {
          var input = document.getElementById('pfUrl');
          var fallback = function () { input.focus(); input.select(); G.toast('링크를 선택했어요. 복사해서 공유하세요.'); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () { G.toast('링크를 복사했어요.'); }, fallback);
          } else fallback();
          return;
        }
        if (tool === 'share') {
          btn.disabled = true;
          var next = shared ? 'off' : 'link';
          G.db.collection('portfolios').doc(doc.id).update({ shareMode: next, updatedAt: G.FV.serverTimestamp() }).then(function () {
            G.toast(next === 'link' ? '링크 공유를 켰어요. 링크를 아는 사람만 볼 수 있어요.' : '공유를 중단했어요.');
            renderView();
          }).catch(function (e) {
            btn.disabled = false;
            G.toast('변경하지 못했습니다. (' + (e.code || e.message) + ')', 'error');
          });
        }
      });
    });
  }

  // ---------- 시작 ----------

  function renderGuest() {
    main.innerHTML = wrap('<div class="g-card g-empty">포트폴리오는 로그인한 회원만 만들 수 있어요.<br><br><button class="g-btn" id="pfLogin">로그인</button></div>');
    document.getElementById('pfLogin').addEventListener('click', function () { G.openLogin(); });
  }

  G.onUser(function (user, profile) {
    state.profile = profile;
    if (viewId) { renderView(); return; } // 공유 링크는 비로그인도 열람
    if (!user) { renderGuest(); return; }
    if (!profile.isMember) {
      main.innerHTML = wrap('<div class="g-card"><div class="g-card-title">승인 후 이용할 수 있어요</div><p class="g-muted">포트폴리오는 가입 승인이 끝난 회원만 만들 수 있습니다.</p></div>');
      return;
    }
    if (isNew || editId) startBuilder();
    else renderList();
  });
})();
