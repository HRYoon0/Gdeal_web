/**
 * 성장패스 관리 (운영사무국·최고 관리자)
 * 탭: 참여 인증(웨비나·나눔활동 QR·참여자·예외) · 기록 확인 · 배지 규칙 · 자료 추천 · 소모임(포트폴리오) · 통계·리포트
 * 복합 인덱스가 필요 없도록 조회는 단일 where만 쓰고 나머지는 클라이언트에서 거른다.
 */
(function () {
  'use strict';

  var G = window.G, R = G.R, esc = G.esc, db = G.db, FV = G.FV;
  var main = G.shell({
    active: '',
    title: '성장패스 관리',
    subtitle: '참여 인증 · 기록 확인 · 배지 · 자료 · 소모임 · 리포트'
  });
  var bannerActions = document.getElementById('gBannerActions');
  if (bannerActions) {
    bannerActions.innerHTML = '<a class="g-btn ghost-white" href="/admin/">기존 관리자 패널</a><a class="g-btn ghost-white" href="/growth/">성장패스로</a>';
  }

  var TABS = [['webinars', '참여 인증'], ['review', '기록 확인'], ['badges', '배지 규칙'], ['resources', '자료 추천'], ['groups', '소모임'], ['report', '통계·리포트']];
  var PERIODS = [['term', '이번 학기'], ['lastTerm', '지난 학기'], ['year', '올해(학년도)'], ['all', '전체']];
  var STATUS_TEXT = { auto: '자동 인정', approved: '승인', pending: '확인 대기', rejected: '반려' };

  var S = {
    profile: null, tab: 'webinars',
    users: null, userMap: {},
    webinars: [], secrets: {}, attendCounts: {},
    pending: [], pendingCount: 0, ledger: null, lf: { q: '', type: '', from: '', to: '' },
    rules: [], grants: [],
    resources: [], resWebappOnly: false, resQuery: '',
    groups: [],
    rep: null, repPeriod: 'term'
  };

  // ---------- 공통 도구 ----------

  function body() { return document.getElementById('tabBody'); }
  function docs(snap) { return snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }); }
  function findBy(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function fail(e, what) {
    if (e === 'cancel') return;
    console.error(what, e);
    G.toast((what || '작업') + ' 실패 (' + ((e && (e.code || e.message)) || e) + ')', 'error');
  }
  function nameOf(uid) { return (S.userMap[uid] && S.userMap[uid].name) || ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDT(v) {
    var d = G.toDate(v);
    return d ? G.fmtDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '';
  }
  function statusTag(s) {
    var cls = s === 'pending' ? 'yellow' : s === 'rejected' ? 'red' : 'green';
    return '<span class="g-tag ' + cls + '">' + esc(STATUS_TEXT[s] || s || '자동 인정') + '</span>';
  }
  function byDateDesc(a, b) { return (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0); }
  function field(name, label, value, type, required) {
    return '<div class="g-field"><label class="g-label" for="f_' + name + '">' + label + '</label>' +
      '<input class="g-input" id="f_' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '"' + (required ? ' required' : '') + '></div>';
  }
  function area(name, label, value) {
    return '<div class="g-field"><label class="g-label" for="f_' + name + '">' + label + '</label>' +
      '<textarea class="g-textarea" id="f_' + name + '" name="' + name + '">' + esc(value || '') + '</textarea></div>';
  }
  function formActions(okLabel) {
    return '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>취소</button><button type="submit" class="g-btn">' + esc(okLabel || '저장') + '</button></div>';
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { G.toast('복사했어요.'); }, function () { G.toast('복사하지 못했어요. 직접 선택해 복사해주세요.', 'error'); });
    } else {
      G.toast('복사하지 못했어요. 직접 선택해 복사해주세요.', 'error');
    }
  }

  function normLog(doc) {
    var d = doc.data();
    return {
      id: doc.id, source: 'activityLog', uid: d.uid || '', userName: d.userName || '',
      type: d.type, status: d.status || 'auto',
      at: G.toDate(d.occurredAt) || G.toDate(d.createdAt),
      title: d.targetTitle || '', targetId: d.targetId || '', groupId: d.groupId || '',
      visibility: d.visibility || 'private', answers: d.answers || {},
      evidence: Array.isArray(d.evidence) ? d.evidence : [], adminNote: d.adminNote || ''
    };
  }

  // 관리자가 대신 남기는 원장 기록
  function logDoc(u, data, at) {
    return Object.assign({
      uid: u.uid, userName: u.name, status: 'approved', visibility: 'private',
      answers: {}, evidence: [], groupId: '', targetId: '', targetTitle: '',
      term: R.termOf(at || new Date()),
      occurredAt: at || FV.serverTimestamp(), createdAt: FV.serverTimestamp(),
      createdBy: S.profile.uid
    }, data);
  }

  // 기간 처리 (지난 학기 포함)
  function prevTerm(t) {
    var p = String(t).split('-');
    return p[1] === '2' ? p[0] + '-1' : (Number(p[0]) - 1) + '-2';
  }
  function inRange(e, p, now) {
    if (p === 'all') return true;
    if (!e.at) return false;
    if (p === 'lastTerm') return R.termOf(e.at) === prevTerm(R.termOf(now));
    return R.inPeriod(e, p, now);
  }
  function periodLabel(p, now) {
    if (p === 'term') return R.termLabel(R.termOf(now));
    if (p === 'lastTerm') return R.termLabel(prevTerm(R.termOf(now)));
    if (p === 'year') return R.schoolYearOf(now) + '학년도';
    return '전체 기간';
  }
  function periodRange(p, now) {
    if (p === 'term') return R.termRange(R.termOf(now));
    if (p === 'lastTerm') return R.termRange(prevTerm(R.termOf(now)));
    if (p === 'year') { var y = R.schoolYearOf(now); return { from: new Date(y, 2, 1), to: new Date(y + 1, 2, 0) }; }
    return { from: null, to: null };
  }

  function loadUsers(force) {
    if (S.users && !force) return Promise.resolve(S.users);
    return db.collection('users').get().then(function (s) {
      S.userMap = {};
      S.users = s.docs.map(function (d) {
        var x = d.data();
        var u = { uid: d.id, name: x.displayName || x.email || d.id, email: x.email || '' };
        S.userMap[d.id] = u;
        return u;
      }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
      return S.users;
    });
  }

  function fillNames(entries) {
    entries.forEach(function (e) { if (!e.userName) e.userName = nameOf(e.uid); });
    return entries;
  }

  // 회원 한 명 고르기 → Promise<user|null>
  function pickMember(title) {
    return loadUsers().then(function (users) {
      return new Promise(function (resolve) {
        var m = G.openModal('<h3>' + esc(title) + '</h3>' +
          '<input class="g-input" id="pmQ" placeholder="이름 또는 이메일 검색" autocomplete="off">' +
          '<ul class="g-list" id="pmList" style="max-height:50vh;overflow:auto;margin-top:.75rem"></ul>' +
          '<div class="g-modal-actions"><button class="g-btn secondary" data-close>취소</button></div>');
        var list = m.el.querySelector('#pmList'), q = m.el.querySelector('#pmQ');
        function draw() {
          var k = q.value.trim().toLowerCase();
          var hit = users.filter(function (u) {
            return !k || u.name.toLowerCase().indexOf(k) !== -1 || u.email.toLowerCase().indexOf(k) !== -1;
          }).slice(0, 50);
          list.innerHTML = hit.length ? hit.map(function (u) {
            return '<li class="g-item"><button class="g-btn secondary small" data-uid="' + esc(u.uid) + '" style="width:100%;justify-content:flex-start">' +
              esc(u.name) + ' <span class="g-muted g-small">' + esc(u.email) + '</span></button></li>';
          }).join('') : '<li class="g-empty">검색 결과가 없어요.</li>';
        }
        q.addEventListener('input', draw);
        draw();
        setTimeout(function () { q.focus(); }, 30);
        m.el.addEventListener('click', function (e) {
          var b = e.target.closest('[data-uid]');
          if (b) { m.close(); resolve(S.userMap[b.getAttribute('data-uid')] || null); }
          else if (e.target.closest('[data-close]')) resolve(null);
        });
      });
    });
  }

  // 반려 사유 입력 → Promise<string|null>
  function noteModal(title, label) {
    return new Promise(function (resolve) {
      var m = G.openModal('<h3>' + esc(title) + '</h3><form id="nf">' +
        '<div class="g-field"><label class="g-label" for="nf_note">' + esc(label) + '</label><textarea class="g-textarea" id="nf_note" name="note" required></textarea></div>' +
        '<div class="g-modal-actions"><button type="button" class="g-btn secondary" data-close>취소</button><button type="submit" class="g-btn danger">반려</button></div></form>');
      var done = false;
      m.el.querySelector('[data-close]').addEventListener('click', function () { if (!done) resolve(null); });
      m.el.querySelector('#nf').addEventListener('submit', function (e) {
        e.preventDefault();
        done = true;
        var v = this.note.value.trim().slice(0, 500);
        m.close();
        resolve(v);
      });
    });
  }

  // ---------- 탭 틀 ----------

  function renderFrame() {
    main.innerHTML = '<div class="g-wrap g-body"><div class="g-tabs" role="tablist">' + TABS.map(function (t) {
      return '<button class="g-tab' + (S.tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '" role="tab">' + t[1] +
        (t[0] === 'review' && S.pendingCount ? '<span class="g-count">' + Number(S.pendingCount) + '</span>' : '') + '</button>';
    }).join('') + '</div><div id="tabBody"></div></div>';
  }

  function updateCount() {
    var tab = main.querySelector('[data-tab="review"]');
    if (tab) tab.innerHTML = '기록 확인' + (S.pendingCount ? '<span class="g-count">' + Number(S.pendingCount) + '</span>' : '');
  }

  function show(tab) {
    S.tab = tab;
    renderFrame();
    body().innerHTML = G.loadingHtml();
    LOADERS[tab]().catch(function (e) {
      console.error(e);
      body().innerHTML = G.errorHtml('불러오지 못했습니다. (' + (e.code || e.message) + ')', 'retryTab');
      document.getElementById('retryTab').addEventListener('click', function () { show(S.tab); });
    });
  }

  // ---------- 1. 웨비나 ----------

  function loadWebinars() {
    return Promise.all([
      G.loadWebinarList(),  // 관리자 등록 웨비나 + 모든 나눔활동
      db.collection('webinarSecrets').get(),
      db.collection('activityLog').where('type', 'in', R.ATTEND_TYPES).get(),
      loadUsers()
    ]).then(function (r) {
      S.webinars = r[0].slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
      S.secrets = {};
      r[1].docs.forEach(function (d) { S.secrets[d.id] = d.data(); });
      S.attendCounts = {};
      r[2].docs.forEach(function (d) {
        var x = d.data();
        if (x.status !== 'rejected') S.attendCounts[x.targetId] = (S.attendCounts[x.targetId] || 0) + 1;
      });
      if (S.tab === 'webinars') renderWebinars();
    });
  }

  function renderWebinars() {
    var h = '<div class="g-card"><div class="g-card-title"><span>참여 인증 대상 <span class="g-muted" style="font-weight:500">' + S.webinars.length + '개</span></span>' +
      '<button class="g-btn small" data-a="w-new">웨비나 등록</button></div>';
    if (!S.webinars.length) {
      body().innerHTML = h + '<div class="g-empty">등록된 웨비나나 나눔활동이 없어요. 여기서 웨비나를 등록하거나 나눔활동을 개설하면 인증 QR과 코드를 쓸 수 있어요.</div></div>';
      return;
    }
    h += '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>날짜</th><th>제목</th><th>발표자</th><th>참여</th><th>인증</th><th>관리</th></tr></thead><tbody>';
    S.webinars.forEach(function (w) {
      var sec = S.secrets[w.id];
      var id = esc(w.id);
      h += '<tr><td style="white-space:nowrap">' + esc(G.fmtDate(w.date)) + (w.time ? '<div class="g-muted g-small">' + esc(w.time) + '</div>' : '') + '</td>' +
        '<td><b>' + esc(w.title) + '</b>' + ' <span class="g-tag ' + (w.source === 'sharing' ? 'blue' : w.source === 'events' ? 'yellow' : 'green') + '">' + esc(w.category || '웨비나') + '</span>' + '</td><td>' + esc(w.speaker || '') + '</td>' +
        '<td>' + Number(S.attendCounts[w.id] || 0) + '명</td>' +
        '<td>' + (sec ? '<span class="g-tag ' + (sec.open ? 'green' : 'red') + '">' + (sec.open ? '받는 중' : '마감') + '</span>' : '<span class="g-tag">코드 없음</span>') + '</td>' +
        '<td><div class="g-row" style="gap:.3rem">' +
        '<button class="g-btn small" data-a="w-qr" data-id="' + id + '">인증 QR</button>' +
        '<button class="g-btn small secondary" data-a="w-people" data-id="' + id + '">참여자</button>' +
        '<button class="g-btn small secondary" data-a="w-except" data-id="' + id + '">예외 추가</button>' +
        (w.source !== 'admin' ? '' : '<button class="g-btn small secondary" data-a="w-host" data-id="' + id + '">발표자 기록</button>') +
        // 나눔활동 웨비나는 이 화면에서 수정·삭제하지 않는다(나눔활동 문서가 원본)
        (w.source === 'sharing' ? '<a class="g-btn small secondary" href="/sharing/">나눔활동에서 수정</a>' :
          w.source === 'events' ? '<a class="g-btn small secondary" href="/events/">대외행사에서 수정</a>' :
          '<button class="g-btn small secondary" data-a="w-edit" data-id="' + id + '">수정</button>' +
          '<button class="g-btn small danger" data-a="w-del" data-id="' + id + '">삭제</button>') +
        '</div></td></tr>';
    });
    body().innerHTML = h + '</tbody></table></div></div>';
  }

  function webinarForm(w) {
    w = w || {};
    var m = G.openModal('<h3>' + (w.id ? '웨비나 수정' : '웨비나 등록') + '</h3><form id="wf">' +
      field('title', '제목 *', w.title, 'text', true) +
      '<div class="g-row">' + field('date', '날짜 *', w.date, 'date', true) + field('time', '시간', w.time, 'time') + '</div>' +
      field('speaker', '발표자', w.speaker) + field('link', '참여 링크', w.link, 'url') +
      area('description', '설명', w.description) + formActions('저장') + '</form>');
    var f = m.el.querySelector('#wf');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = G.formData(f);
      if (d.link && !G.safeUrl(d.link)) { G.toast('참여 링크는 https:// 로 시작해야 해요.', 'error'); return; }
      var btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      var data = {
        title: d.title.slice(0, 120), date: d.date, time: d.time || '', speaker: d.speaker || '',
        link: d.link || '', description: (d.description || '').slice(0, 2000), updatedAt: FV.serverTimestamp()
      };
      var job;
      if (w.id) {
        job = db.collection('webinars').doc(w.id).update(data);
      } else {
        var ref = db.collection('webinars').doc();
        var b = db.batch();
        data.createdAt = FV.serverTimestamp();
        data.createdBy = S.profile.uid;
        b.set(ref, data);
        b.set(db.collection('webinarSecrets').doc(ref.id), { code: G.randomCode(6), open: true, updatedAt: FV.serverTimestamp() });
        job = b.commit();
      }
      job.then(function () { m.close(); G.toast('저장했어요.'); return loadWebinars(); })
        .catch(function (ex) { btn.disabled = false; fail(ex, '웨비나 저장'); });
    });
  }

  function qrModal(id) {
    var w = findBy(S.webinars, id);
    if (!w) return;
    var sec = S.secrets[id];
    var secRef = db.collection('webinarSecrets').doc(id);
    if (!sec) {
      secRef.set({ code: G.randomCode(6), open: true, updatedAt: FV.serverTimestamp() })
        .then(loadWebinars).then(function () { qrModal(id); })
        .catch(function (e) { fail(e, '코드 발급'); });
      return;
    }
    var url = location.origin + '/growth/?w=' + encodeURIComponent(id) + '&c=' + encodeURIComponent(sec.code);
    var img;
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      img = '<img src="' + qr.createDataURL(8, 16) + '" alt="참여 인증 QR 코드">';
    } catch (ex) {
      img = G.errorHtml('QR 라이브러리를 불러오지 못했어요. 링크나 코드로 안내해주세요.');
    }
    var m = G.openModal('<h3>' + esc(w.title) + ' 인증</h3>' +
      '<div class="g-qr">' + img +
      '<div class="g-muted">또는 성장패스 → 참여 인증에서 코드 입력</div>' +
      '<div class="g-code">' + esc(sec.code) + '</div>' +
      '<span class="g-tag ' + (sec.open ? 'green' : 'red') + '">' + (sec.open ? '인증 받는 중' : '인증 마감') + '</span>' +
      '<input class="g-input" readonly value="' + esc(url) + '" style="font-size:.8rem" aria-label="인증 링크"></div>' +
      '<div class="g-modal-actions">' +
      '<button class="g-btn secondary" data-q="copy">링크 복사</button>' +
      '<button class="g-btn secondary" data-q="toggle">' + (sec.open ? '인증 마감' : '인증 다시 열기') + '</button>' +
      '<button class="g-btn danger" data-q="regen">코드 재발급</button>' +
      '<button class="g-btn" data-close>닫기</button></div>');
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (!b) return;
      var q = b.getAttribute('data-q');
      if (q === 'copy') { copy(url); return; }
      var job = q === 'toggle' ?
        secRef.update({ open: !sec.open, updatedAt: FV.serverTimestamp() }) :
        G.confirmModal('코드를 새로 발급하면 이전 QR과 코드로는 인증할 수 없어요. 계속할까요?', '재발급').then(function (ok) {
          if (!ok) throw 'cancel';
          return secRef.update({ code: G.randomCode(6), updatedAt: FV.serverTimestamp() });
        });
      job.then(function () { m.close(); return loadWebinars(); })
        .then(function () { qrModal(id); })
        .catch(function (ex) { fail(ex, '인증 설정'); });
    });
  }

  function peopleModal(id) {
    var w = findBy(S.webinars, id);
    if (!w) return;
    var m = G.openModal('<h3>' + esc(w.title) + ' 참여자</h3><div id="pp">' + G.loadingHtml() + '</div>' +
      '<div class="g-modal-actions"><button class="g-btn" data-close>닫기</button></div>', { wide: true });
    var box = m.el.querySelector('#pp');
    function draw() {
      db.collection('activityLog').where('targetId', '==', id).get().then(function (s) {
        var list = docs(s).filter(function (x) { return R.ATTEND_TYPES.indexOf(x.type) !== -1 || x.type === 'webinar_host'; })
          .sort(function (a, b) { return (G.toDate(a.occurredAt) || 0) - (G.toDate(b.occurredAt) || 0); });
        if (!list.length) { box.innerHTML = '<div class="g-empty">아직 인증한 참여자가 없어요.</div>'; return; }
        box.innerHTML = '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>이름</th><th>구분</th><th>시각</th><th>상태</th><th></th></tr></thead><tbody>' +
          list.map(function (x) {
            return '<tr><td>' + esc(x.userName || nameOf(x.uid)) + '</td><td>' + G.typeTag(x.type) + '</td>' +
              '<td style="white-space:nowrap">' + esc(fmtDT(x.occurredAt || x.createdAt)) + '</td>' +
              '<td>' + statusTag(x.status) + (x.adminNote ? ' <span class="g-muted g-small">' + esc(x.adminNote) + '</span>' : '') + '</td>' +
              '<td><button class="g-btn small danger" data-pdel="' + esc(x.id) + '">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<p class="g-muted g-small" style="margin-top:.5rem">참여 ' + list.filter(function (x) { return R.ATTEND_TYPES.indexOf(x.type) !== -1; }).length + '명</p>';
      }).catch(function (e) {
        box.innerHTML = G.errorHtml('불러오지 못했습니다. (' + (e.code || e.message) + ')');
      });
    }
    draw();
    m.el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pdel]');
      if (!b) return;
      G.confirmModal('이 참여 기록을 삭제할까요?', '삭제').then(function (ok) {
        if (!ok) return;
        return db.collection('activityLog').doc(b.getAttribute('data-pdel')).delete().then(function () {
          G.toast('삭제했어요.');
          draw();
          return loadWebinars();
        });
      }).catch(function (ex) { fail(ex, '삭제'); });
    });
  }

  function addAttendException(id) {
    var w = findBy(S.webinars, id);
    if (!w) return;
    pickMember('수동으로 참여 인증할 회원').then(function (u) {
      if (!u) return;
      var ref = db.collection('activityLog').doc(u.uid + '_attend_' + id);
      return ref.get().then(function (s) {
        if (s.exists) { G.toast('이미 인증된 회원이에요.'); return; }
        var at = G.toDate(w.date) || new Date();
        return ref.set(logDoc(u, {
          type: G.attendTypeOf(w), targetId: id, targetTitle: w.title || '나눔활동', adminNote: '운영진 수동 인증'
        }, at)).then(function () {
          G.toast(u.name + ' 선생님 참여를 기록했어요.');
          return loadWebinars();
        });
      });
    }).catch(function (e) { fail(e, '수동 인증'); });
  }

  function addHost(id) {
    var w = findBy(S.webinars, id);
    if (!w) return;
    pickMember('발표·진행한 회원').then(function (u) {
      if (!u) return;
      var at = G.toDate(w.date) || new Date();
      return db.collection('activityLog').add(logDoc(u, {
        type: 'webinar_host', targetId: id, targetTitle: w.title || '웨비나', adminNote: '운영진 기록'
      }, at)).then(function () { G.toast(u.name + ' 선생님 발표·진행을 기록했어요.'); });
    }).catch(function (e) { fail(e, '발표자 기록'); });
  }

  function deleteWebinar(id) {
    var w = findBy(S.webinars, id);
    if (!w) return;
    G.confirmModal('「' + w.title + '」 웨비나를 삭제할까요? 인증 코드도 함께 삭제되고, 이미 남은 참여 기록은 유지됩니다.', '삭제').then(function (ok) {
      if (!ok) return;
      var b = db.batch();
      b.delete(db.collection('webinars').doc(id));
      b.delete(db.collection('webinarSecrets').doc(id));
      return b.commit().then(function () { G.toast('삭제했어요.'); return loadWebinars(); });
    }).catch(function (e) { fail(e, '웨비나 삭제'); });
  }

  // ---------- 2. 기록 확인 ----------

  function loadReview() {
    return Promise.all([db.collection('activityLog').where('status', '==', 'pending').get(), loadUsers()]).then(function (r) {
      S.pending = fillNames(r[0].docs.map(normLog)).sort(byDateDesc);
      S.pendingCount = S.pending.length;
      updateCount();
      if (S.tab === 'review') renderReview();
    });
  }

  function renderReview() {
    var h = '<div class="g-card"><div class="g-card-title"><span>확인 대기 <span class="g-muted" style="font-weight:500">' + S.pending.length + '건</span></span>' +
      '<button class="g-btn small" data-a="r-add">수동 기록 추가</button></div>';
    h += S.pending.length ? '<ul class="g-list">' + S.pending.map(function (e) {
      return G.entryHtml(e, {
        showUser: true, showVisibility: true,
        actions: function (x) {
          return '<button class="g-btn small" data-a="r-approve" data-id="' + esc(x.id) + '">승인</button>' +
            '<button class="g-btn small danger" data-a="r-reject" data-id="' + esc(x.id) + '">반려</button>';
        }
      });
    }).join('') + '</ul>' : '<div class="g-empty">확인할 기록이 없어요.</div>';
    h += '</div><div class="g-card"><div class="g-card-title">전체 기록</div><div id="ledgerBox"></div></div>';
    body().innerHTML = h;
    renderLedgerBox();
  }

  function renderLedgerBox() {
    var box = document.getElementById('ledgerBox');
    if (!box) return;
    if (!S.ledger) {
      box.innerHTML = '<p class="g-muted">새 원장과 교단일기·자료공유·나눔활동 기록을 모두 불러옵니다.</p>' +
        '<button class="g-btn secondary" data-a="r-loadall" style="margin-top:.5rem">전체 기록 불러오기</button>';
      return;
    }
    box.innerHTML = '<div class="g-row" style="margin-bottom:.75rem">' +
      '<div class="g-field"><label class="g-label" for="lfQ">회원명</label><input class="g-input" id="lfQ" value="' + esc(S.lf.q) + '" autocomplete="off"></div>' +
      '<div class="g-field"><label class="g-label" for="lfT">유형</label><select class="g-select" id="lfT"><option value="">전체</option>' +
      Object.keys(R.TYPES).map(function (t) {
        return '<option value="' + t + '"' + (S.lf.type === t ? ' selected' : '') + '>' + esc(R.TYPES[t].label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="g-field"><label class="g-label" for="lfF">시작일</label><input class="g-input" type="date" id="lfF" value="' + esc(S.lf.from) + '"></div>' +
      '<div class="g-field"><label class="g-label" for="lfTo">종료일</label><input class="g-input" type="date" id="lfTo" value="' + esc(S.lf.to) + '"></div>' +
      '</div><div id="ledgerList"></div>';
    [['lfQ', 'q', 'input'], ['lfT', 'type', 'change'], ['lfF', 'from', 'change'], ['lfTo', 'to', 'change']].forEach(function (c) {
      document.getElementById(c[0]).addEventListener(c[2], function () { S.lf[c[1]] = this.value.trim(); drawLedger(); });
    });
    drawLedger();
  }

  function drawLedger() {
    var box = document.getElementById('ledgerList');
    if (!box) return;
    var f = S.lf, q = f.q.toLowerCase();
    var list = S.ledger.filter(function (e) {
      if (q && String(e.userName || '').toLowerCase().indexOf(q) === -1) return false;
      if (f.type && e.type !== f.type) return false;
      var d = G.ymd(e.at);
      if (f.from && (!d || d < f.from)) return false;
      if (f.to && (!d || d > f.to)) return false;
      return true;
    });
    if (!list.length) { box.innerHTML = '<div class="g-empty">조건에 맞는 기록이 없어요.</div>'; return; }
    box.innerHTML = '<p class="g-muted g-small" style="margin-bottom:.5rem">' + list.length + '건' + (list.length > 200 ? ' · 최근 200건만 표시' : '') + '</p>' +
      '<ul class="g-list">' + list.slice(0, 200).map(function (e) {
        return G.entryHtml(e, {
          showUser: true, showVisibility: true,
          actions: function (x) {
            if (x.source !== 'activityLog') return x.link ? '<a class="g-btn small secondary" href="' + esc(x.link) + '">원본</a>' : '';
            return (x.status !== 'approved' && x.status !== 'auto' ? '<button class="g-btn small" data-a="r-approve" data-id="' + esc(x.id) + '">승인</button>' : '') +
              (x.status !== 'rejected' ? '<button class="g-btn small secondary" data-a="r-reject" data-id="' + esc(x.id) + '">반려</button>' : '') +
              '<button class="g-btn small danger" data-a="r-del" data-id="' + esc(x.id) + '">삭제</button>';
          }
        });
      }).join('') + '</ul>';
  }

  function loadLedgerForReview() {
    var box = document.getElementById('ledgerBox');
    if (box) box.innerHTML = G.loadingHtml('전체 기록을 불러오는 중...');
    Promise.all([G.loadAllLedger(), loadUsers()]).then(function (r) {
      S.ledger = fillNames(r[0]);
      renderLedgerBox();
    }).catch(function (e) {
      if (box) box.innerHTML = G.errorHtml('불러오지 못했습니다. (' + (e.code || e.message) + ')');
    });
  }

  function patchLedger(id, fields) {
    if (!S.ledger) return;
    S.ledger = S.ledger.filter(function (e) { return !(fields === null && e.id === id); });
    if (fields) S.ledger.forEach(function (e) { if (e.id === id) Object.assign(e, fields); });
  }

  function approveLog(id) {
    db.collection('activityLog').doc(id).update({
      status: 'approved', reviewedBy: S.profile.uid, reviewedAt: FV.serverTimestamp()
    }).then(function () {
      patchLedger(id, { status: 'approved' });
      G.toast('승인했어요.');
      return loadReview();
    }).catch(function (e) { fail(e, '승인'); });
  }

  function rejectLog(id) {
    noteModal('기록 반려', '반려 사유 (회원에게 보여요)').then(function (note) {
      if (note === null) return;
      return db.collection('activityLog').doc(id).update({
        status: 'rejected', adminNote: note, reviewedBy: S.profile.uid, reviewedAt: FV.serverTimestamp()
      }).then(function () {
        patchLedger(id, { status: 'rejected', adminNote: note });
        G.toast('반려했어요.');
        return loadReview();
      });
    }).catch(function (e) { fail(e, '반려'); });
  }

  function deleteLog(id) {
    G.confirmModal('이 기록을 삭제할까요? 되돌릴 수 없어요.', '삭제').then(function (ok) {
      if (!ok) return;
      return db.collection('activityLog').doc(id).delete().then(function () {
        patchLedger(id, null);
        G.toast('삭제했어요.');
        return loadReview();
      });
    }).catch(function (e) { fail(e, '삭제'); });
  }

  function manualAdd() {
    pickMember('기록을 추가할 회원').then(function (u) {
      if (!u) return;
      var types = Object.keys(R.TYPES).filter(function (t) { return !R.TYPES[t].legacy; });
      var m = G.openModal('<h3>' + esc(u.name) + ' 선생님 기록 추가</h3><form id="mf">' +
        '<div class="g-field"><label class="g-label" for="mf_type">유형</label><select class="g-select" id="mf_type" name="type">' +
        types.map(function (t) { return '<option value="' + t + '">' + esc(R.TYPES[t].label) + '</option>'; }).join('') + '</select></div>' +
        field('title', '제목 *', '', 'text', true) + field('date', '날짜', G.ymd(new Date()), 'date') +
        area('note', '메모', '') + formActions('추가') + '</form>');
      var f = m.el.querySelector('#mf');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = G.formData(f);
        var btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        db.collection('activityLog').add(logDoc(u, {
          type: d.type, targetTitle: d.title.slice(0, 120),
          answers: d.note ? { note: d.note.slice(0, 2000) } : {},
          adminNote: '운영진 수동 기록'
        }, G.toDate(d.date) || new Date())).then(function () {
          m.close();
          G.toast('기록을 추가했어요.');
          S.ledger = null;
          return loadReview();
        }).catch(function (ex) { btn.disabled = false; fail(ex, '기록 추가'); });
      });
    }).catch(function (e) { fail(e, '회원 조회'); });
  }

  // ---------- 3. 배지 규칙 ----------

  function loadBadges() {
    return Promise.all([db.collection('badgeRules').get(), db.collection('badgeGrants').get(), loadUsers()]).then(function (r) {
      S.rules = docs(r[0]).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      S.grants = docs(r[1]).sort(function (a, b) { return (G.toDate(b.grantedAt) || 0) - (G.toDate(a.grantedAt) || 0); });
      if (S.tab === 'badges') renderBadges();
    });
  }

  function periodText(p) { return p === 'term' ? '학기' : p === 'year' ? '학년도' : '전체'; }

  function renderBadges() {
    var h = '<div class="g-card"><div class="g-card-title"><span>배지 규칙 <span class="g-muted" style="font-weight:500">' + S.rules.length + '개</span></span>' +
      '<div class="g-row" style="gap:.35rem"><button class="g-btn small secondary" data-a="b-grant">수동 지급</button><button class="g-btn small" data-a="b-new">배지 추가</button></div></div>';
    if (!S.rules.length) {
      h += '<div class="g-notice">아직 저장된 배지 규칙이 없어 회원 화면은 기본 배지 ' + R.DEFAULT_BADGES.length + '종으로 계산돼요. 불러와서 이름과 조건을 고칠 수 있어요.</div>' +
        '<button class="g-btn" data-a="b-seed" style="margin-top:.75rem">기본 배지 불러오기</button>';
    } else {
      h += '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>순서</th><th>배지</th><th>조건</th><th>기간</th><th>상태</th><th></th></tr></thead><tbody>' +
        S.rules.map(function (r) {
          return '<tr><td>' + Number(r.order || 0) + '</td><td><b>' + esc(r.name) + '</b><div class="g-muted g-small">' + esc(r.desc || '') + '</div></td>' +
            '<td>' + esc((r.conditions || []).map(R.conditionText).join(' + ')) + '</td><td>' + periodText(r.period) + '</td>' +
            '<td>' + (r.active === false ? '<span class="g-tag">꺼짐</span>' : '<span class="g-tag green">사용</span>') +
            (r.auto === false ? '<span class="g-tag yellow">수동 지급</span>' : '<span class="g-tag blue">자동</span>') + '</td>' +
            '<td><div class="g-row" style="gap:.3rem"><button class="g-btn small secondary" data-a="b-edit" data-id="' + esc(r.id) + '">수정</button>' +
            '<button class="g-btn small danger" data-a="b-del" data-id="' + esc(r.id) + '">삭제</button></div></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '</div><div class="g-card"><div class="g-card-title">수동 지급 내역 <span class="g-muted" style="font-weight:500">' + S.grants.length + '건</span></div>';
    h += S.grants.length ? '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>회원</th><th>배지</th><th>지급일</th><th></th></tr></thead><tbody>' +
      S.grants.map(function (g) {
        var rule = findBy(S.rules, g.ruleId);
        return '<tr><td>' + esc(g.userName || nameOf(g.uid)) + '</td><td>' + esc(rule ? rule.name : g.ruleId) + '</td><td>' + esc(G.fmtDate(g.grantedAt)) + '</td>' +
          '<td><button class="g-btn small danger" data-a="b-revoke" data-id="' + esc(g.id) + '">회수</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="g-empty">수동으로 지급한 배지가 없어요.</div>';
    body().innerHTML = h + '</div>';
  }

  function seedBadges() {
    var b = db.batch();
    R.DEFAULT_BADGES.forEach(function (x, i) {
      b.set(db.collection('badgeRules').doc(x.id), {
        name: x.name, desc: x.desc, image: '', period: x.period, conditions: x.conditions,
        auto: true, active: true, order: (i + 1) * 10, updatedAt: FV.serverTimestamp()
      });
    });
    b.commit().then(function () { G.toast('기본 배지를 불러왔어요.'); return loadBadges(); })
      .catch(function (e) { fail(e, '기본 배지 불러오기'); });
  }

  function ruleForm(rule) {
    var isNew = !rule;
    rule = rule || { period: 'term', auto: true, active: true, order: (S.rules.length + 1) * 10, conditions: [{ types: [], count: 1 }] };
    var typeKeys = ['*'].concat(Object.keys(R.TYPES));
    function row(c) {
      // sum 조건(받은 좋아요 수 등)은 저장할 때 잃지 않게 data-sum으로 들고 다닌다
      return '<div class="cond-row" data-sum="' + esc(c.sum || '') + '" style="border:1px solid #e5e7eb;border-radius:.5rem;padding:.75rem;margin-top:.5rem">' +
        '<div class="g-chips">' + typeKeys.map(function (t) {
          return '<label class="g-check"><input type="checkbox" value="' + esc(t) + '"' + ((c.types || []).indexOf(t) !== -1 ? ' checked' : '') + '>' +
            esc(t === '*' ? '모든 활동' : R.TYPES[t].label) + '</label>';
        }).join('') + '</div>' +
        '<div class="g-row" style="margin-top:.5rem"><span class="g-label" style="margin:0">' + (c.sum === 'likes' ? '받은 좋아요 수' : '필요 횟수') + '</span>' +
        '<input class="g-input cond-count" type="number" min="1" max="999" value="' + (Number(c.count) || 1) + '" style="width:6rem" aria-label="필요 횟수">' +
        '<button type="button" class="g-btn small danger" data-rmrow>조건 삭제</button></div></div>';
    }
    var m = G.openModal('<h3>' + (isNew ? '배지 추가' : '배지 수정') + '</h3><form id="rf">' +
      field('name', '배지 이름 *', rule.name, 'text', true) + field('desc', '설명', rule.desc) +
      field('image', '배지 이미지 링크 <span class="g-muted">(https://, 없으면 첫 글자)</span>', rule.image, 'url') +
      '<div class="g-row"><div class="g-field"><label class="g-label" for="rf_period">적용 기간</label><select class="g-select" id="rf_period" name="period">' +
      [['term', '이번 학기 안에서'], ['year', '올해(학년도) 안에서'], ['all', '전체 기간']].map(function (p) {
        return '<option value="' + p[0] + '"' + (rule.period === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select></div>' + field('order', '표시 순서', rule.order, 'number') + '</div>' +
      '<div class="g-field"><label class="g-check"><input type="checkbox" name="auto"' + (rule.auto !== false ? ' checked' : '') + '>조건을 채우면 자동 발급</label>' +
      '<label class="g-check"><input type="checkbox" name="active"' + (rule.active !== false ? ' checked' : '') + '>사용</label></div>' +
      '<div class="g-field"><span class="g-label">조건 <span class="g-muted">(모든 조건을 채워야 획득 · 한 조건 안의 유형은 합산)</span></span>' +
      '<div id="conds">' + (rule.conditions || []).map(row).join('') + '</div>' +
      '<button type="button" class="g-btn small secondary" data-addrow style="margin-top:.5rem">조건 추가</button>' +
      '<div class="g-notice" id="condPreview" style="margin-top:.75rem"></div></div>' +
      formActions('저장') + '</form>', { wide: true });
    var f = m.el.querySelector('#rf');
    var conds = f.querySelector('#conds');

    function readConds() {
      return [].slice.call(conds.querySelectorAll('.cond-row')).map(function (r) {
        var c = {
          types: [].slice.call(r.querySelectorAll('input[type=checkbox]:checked')).map(function (i) { return i.value; }),
          count: Math.max(0, Math.floor(Number(r.querySelector('.cond-count').value) || 0))
        };
        if (r.getAttribute('data-sum')) c.sum = r.getAttribute('data-sum');
        return c;
      }).filter(function (c) { return c.types.length && c.count > 0; });
    }
    function preview() {
      var list = readConds();
      var p = f.period.value;
      f.querySelector('#condPreview').textContent = list.length ?
        (p === 'term' ? '이번 학기 안에 ' : p === 'year' ? '올해 안에 ' : '') + list.map(R.conditionText).join(' 그리고 ') + ' 달성 시 ' + (f.auto.checked ? '자동 발급' : '수동 지급 대상') :
        '조건을 하나 이상 설정해주세요.';
    }
    m.el.addEventListener('click', function (e) {
      if (e.target.closest('[data-addrow]')) { conds.insertAdjacentHTML('beforeend', row({ types: [], count: 1 })); preview(); }
      var rm = e.target.closest('[data-rmrow]');
      if (rm) { rm.closest('.cond-row').parentNode.removeChild(rm.closest('.cond-row')); preview(); }
    });
    f.addEventListener('change', preview);
    f.addEventListener('input', preview);
    preview();

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = readConds();
      if (!list.length) { G.toast('조건을 하나 이상 설정해주세요.', 'error'); return; }
      var image = f.image.value.trim();
      if (image && !G.safeUrl(image)) { G.toast('이미지 링크는 https:// 로 시작해야 해요.', 'error'); return; }
      var btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      var ref = isNew ? db.collection('badgeRules').doc() : db.collection('badgeRules').doc(rule.id);
      ref.set({
        name: f.name.value.trim().slice(0, 40), desc: f.desc.value.trim().slice(0, 100), image: image,
        period: f.period.value, order: Number(f.order.value) || 0,
        auto: f.auto.checked, active: f.active.checked, conditions: list,
        updatedAt: FV.serverTimestamp()
      }).then(function () { m.close(); G.toast('저장했어요.'); return loadBadges(); })
        .catch(function (ex) { btn.disabled = false; fail(ex, '배지 저장'); });
    });
  }

  function deleteRule(id) {
    var r = findBy(S.rules, id);
    if (!r) return;
    G.confirmModal('「' + r.name + '」 배지를 삭제할까요? 회원 화면에서 바로 사라집니다.', '삭제').then(function (ok) {
      if (!ok) return;
      return db.collection('badgeRules').doc(id).delete().then(function () { G.toast('삭제했어요.'); return loadBadges(); });
    }).catch(function (e) { fail(e, '배지 삭제'); });
  }

  function grantFlow() {
    if (!S.rules.length) { G.toast('먼저 배지 규칙을 저장해주세요.', 'error'); return; }
    pickMember('배지를 지급할 회원').then(function (u) {
      if (!u) return;
      var m = G.openModal('<h3>' + esc(u.name) + ' 선생님께 배지 지급</h3><form id="gf">' +
        '<div class="g-field"><label class="g-label" for="gf_rule">배지</label><select class="g-select" id="gf_rule" name="ruleId">' +
        S.rules.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; }).join('') + '</select></div>' +
        formActions('지급') + '</form>');
      var f = m.el.querySelector('#gf');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ruleId = f.ruleId.value;
        db.collection('badgeGrants').doc(u.uid + '_' + ruleId).set({
          uid: u.uid, userName: u.name, ruleId: ruleId, grantedBy: S.profile.uid, grantedAt: FV.serverTimestamp()
        }).then(function () { m.close(); G.toast('지급했어요.'); return loadBadges(); })
          .catch(function (ex) { fail(ex, '배지 지급'); });
      });
    }).catch(function (e) { fail(e, '회원 조회'); });
  }

  function revokeGrant(id) {
    G.confirmModal('지급한 배지를 회수할까요?', '회수').then(function (ok) {
      if (!ok) return;
      return db.collection('badgeGrants').doc(id).delete().then(function () { G.toast('회수했어요.'); return loadBadges(); });
    }).catch(function (e) { fail(e, '회수'); });
  }

  // ---------- 4. 자료 추천 ----------
  // 웹앱 광장은 자료공유(resources)로 합쳐졌다. 웹앱 등록 원장은 자료의 kind==='webapp'에서 자동 파생되므로 여기서 만들지 않는다.

  var RES_LABELS = {
    title: '제목', description: '설명', downloadUrl: '링크', author: '제작자', tags: '태그', kind: '종류',
    imageUrl: '대표 이미지', grades: '학년', subjects: '교과', activityTypes: '활동 유형',
    problem: '해결하려는 교육 문제', features: '주요 기능', howToUse: '활용 방법',
    loginRequired: '로그인 필요', personalData: '개인정보 수집', cautions: '사용 시 주의점',
    relatedWebinarId: '관련 웨비나', usedCount: '사용해 봤어요', featured: '추천',
    createdBy: '등록 회원', createdAt: '등록일', updatedAt: '수정일'
  };

  function loadResources() {
    return Promise.all([db.collection('resources').get(), loadUsers()]).then(function (r) {
      S.resources = docs(r[0]).sort(function (a, b) { return (G.toDate(b.createdAt) || 0) - (G.toDate(a.createdAt) || 0); });
      if (S.tab === 'resources') renderResources();
    });
  }

  function renderResources() {
    var list = S.resources.filter(function (a) { return !S.resWebappOnly || a.kind === 'webapp'; });
    var webappCount = S.resources.filter(function (a) { return a.kind === 'webapp'; }).length;
    var h = '<div class="g-card"><div class="g-row" style="margin-bottom:1rem">' +
      '<input class="g-input" id="resSearch" placeholder="제목·제작자·태그 검색" style="flex:1;min-width:200px" value="' + esc(S.resQuery) + '" aria-label="자료 검색">' +
      '<button class="g-chip' + (S.resWebappOnly ? ' on' : '') + '" data-a="res-webapp">웹앱만 <b>' + webappCount + '</b></button></div>';
    if (!list.length) {
      body().innerHTML = h + '<div class="g-empty">해당하는 자료가 없어요.</div></div>';
      bindResSearch();
      return;
    }
    h += '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>등록일</th><th>제목</th><th>제작자</th><th>웹앱</th><th>사용</th><th>추천</th><th>관리</th></tr></thead><tbody>' +
      list.map(function (a) {
        var id = esc(a.id);
        var search = [a.title, a.author, (a.tags || []).join(' ')].join(' ').toLowerCase();
        return '<tr data-search="' + esc(search) + '"><td style="white-space:nowrap">' + esc(G.fmtDate(a.createdAt)) + '</td>' +
          '<td><b>' + esc(a.title) + '</b></td>' +
          '<td>' + esc(a.author || nameOf(a.createdBy)) + '</td>' +
          '<td>' + (a.kind === 'webapp' ? '<span class="g-tag blue">웹앱</span>' : '') + '</td>' +
          '<td>' + Number(a.usedCount || 0) + '</td>' +
          '<td>' + (a.featured ? '<span class="g-tag green">추천</span>' : '') + '</td>' +
          '<td><div class="g-row" style="gap:.3rem">' +
          '<button class="g-btn small secondary" data-a="res-view" data-id="' + id + '">상세</button>' +
          '<button class="g-btn small secondary" data-a="res-feature" data-id="' + id + '">' + (a.featured ? '추천 해제' : '추천 지정') + '</button>' +
          '<button class="g-btn small danger" data-a="res-del" data-id="' + id + '">삭제</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table></div><div class="g-empty" id="resNone" style="display:none">검색 결과가 없어요.</div>';
    body().innerHTML = h + '</div>';
    bindResSearch();
  }

  // 다시 그리지 않고 행만 숨겨 입력 포커스를 유지한다
  function bindResSearch() {
    var q = document.getElementById('resSearch');
    if (!q) return;
    function apply() {
      S.resQuery = q.value;
      var k = q.value.trim().toLowerCase(), rows = body().querySelectorAll('tr[data-search]'), shown = 0;
      rows.forEach(function (tr) {
        var ok = !k || tr.getAttribute('data-search').indexOf(k) !== -1;
        tr.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      var none = document.getElementById('resNone');
      if (none) none.style.display = rows.length && !shown ? 'block' : 'none';
    }
    q.addEventListener('input', apply);
    apply();
  }

  function valueHtml(k, v) {
    if (v == null || v === '') return '<span class="g-muted">-</span>';
    if (typeof v.toDate === 'function') return esc(fmtDT(v));
    if (Array.isArray(v)) {
      return v.length ? v.map(function (x) { return '<span class="g-tag">' + esc(typeof x === 'object' ? JSON.stringify(x) : x) + '</span>'; }).join('') : '<span class="g-muted">-</span>';
    }
    if (typeof v === 'boolean') return v ? '예' : '아니오';
    if (typeof v === 'object') return '<span style="white-space:pre-wrap">' + esc(JSON.stringify(v, null, 1)) + '</span>';
    var u = G.safeUrl(v);
    if (u) {
      return (k === 'imageUrl' ? '<img src="' + esc(u) + '" alt="" style="max-width:100%;max-height:200px;border-radius:.5rem;display:block;margin-bottom:.25rem">' : '') +
        '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" style="color:#497e56;text-decoration:underline;word-break:break-all">' + esc(u) + '</a>';
    }
    if (k === 'kind') return esc(v === 'webapp' ? '웹앱' : '자료');
    if (k === 'status') return esc(({ pending: '검토 대기', approved: '공개', rejected: '반려' })[v] || v);
    return '<span style="white-space:pre-wrap">' + esc(v) + '</span>';
  }

  function resDetail(id) {
    var a = findBy(S.resources, id);
    if (!a) return;
    var keys = Object.keys(RES_LABELS).filter(function (k) { return k in a; })
      .concat(Object.keys(a).filter(function (k) { return !(k in RES_LABELS) && k !== 'id'; }));
    G.openModal('<h3>' + esc(a.title) + '</h3><div class="g-table-wrap"><table class="g-table"><tbody>' +
      keys.map(function (k) {
        return '<tr><th style="width:9rem">' + esc(RES_LABELS[k] || k) + '</th><td>' + valueHtml(k, a[k]) + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="g-modal-actions"><button class="g-btn" data-close>닫기</button></div>', { wide: true });
  }

  function toggleResFeature(id) {
    var a = findBy(S.resources, id);
    if (!a) return;
    db.collection('resources').doc(id).update({ featured: !a.featured, updatedAt: FV.serverTimestamp() }).then(function () {
      G.toast(a.featured ? '추천을 해제했어요.' : '추천으로 지정했어요.');
      return loadResources();
    }).catch(function (e) { fail(e, '추천 설정'); });
  }

  function deleteResource(id) {
    var a = findBy(S.resources, id);
    if (!a) return;
    G.confirmModal('「' + a.title + '」 자료를 삭제할까요? 사용 기록과 후기도 함께 지워집니다.', '삭제').then(function (ok) {
      if (!ok) return;
      var ref = db.collection('resources').doc(id);
      // 문서를 지워도 하위 컬렉션(사용 기록·후기)은 남으므로 함께 지운다
      return Promise.all([ref.collection('uses').get(), ref.collection('reviews').get()]).then(function (r) {
        var b = db.batch();
        // ponytail: 배치 한도 500건 — 자료 하나에 사용·후기가 수백 건을 넘으면 나눠 커밋할 것
        r[0].docs.concat(r[1].docs).forEach(function (d) { b.delete(d.ref); });
        b.delete(ref);
        return b.commit();
      }).then(function () { G.toast('삭제했어요.'); return loadResources(); });
    }).catch(function (e) { fail(e, '자료 삭제'); });
  }

  // ---------- 5. 소모임 ----------

  function loadGroups() {
    return Promise.all([db.collection('groups').get(), loadUsers()]).then(function (r) {
      S.groups = docs(r[0]).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); });
      if (S.tab === 'groups') renderGroups();
    });
  }

  function renderGroups() {
    var h = '<div class="g-card"><div class="g-card-title"><span>소모임 <span class="g-muted" style="font-weight:500">' + S.groups.length + '개</span></span>' +
      '<button class="g-btn small" data-a="g-new">소모임 만들기</button></div>' +
      '<p class="g-muted g-small">회원이 기록을 「소모임 공유」로 남기면 여기서 소모임 포트폴리오로 묶을 수 있어요.</p></div>';
    if (!S.groups.length) { body().innerHTML = h + '<div class="g-card"><div class="g-empty">아직 소모임이 없어요.</div></div>'; return; }
    h += '<div class="g-grid cols-2" style="margin-top:1rem">' + S.groups.map(function (g) {
      var names = g.memberNames || [];
      var id = esc(g.id);
      return '<div class="g-card"><div class="g-card-title">' + esc(g.name) + '</div>' +
        (g.description ? '<div class="g-item-body" style="margin-top:0">' + esc(g.description) + '</div>' : '') +
        (g.goal ? '<div class="g-item-body"><b>목표</b> · ' + esc(g.goal) + '</div>' : '') +
        '<div class="g-item-meta" style="margin:.6rem 0 .3rem">리더 ' + esc(nameOf(g.leaderUid) || '미지정') + ' · 구성원 ' + (g.memberUids || []).length + '명</div>' +
        '<div>' + names.slice(0, 12).map(function (n) { return '<span class="g-tag">' + esc(n) + '</span>'; }).join('') +
        (names.length > 12 ? '<span class="g-muted g-small">외 ' + (names.length - 12) + '명</span>' : '') + '</div>' +
        '<div class="g-row" style="gap:.3rem;margin-top:.75rem">' +
        '<button class="g-btn small" data-a="g-pf" data-id="' + id + '">포트폴리오 만들기</button>' +
        '<button class="g-btn small secondary" data-a="g-pflist" data-id="' + id + '">포트폴리오 목록</button>' +
        '<button class="g-btn small secondary" data-a="g-edit" data-id="' + id + '">수정</button>' +
        '<button class="g-btn small danger" data-a="g-del" data-id="' + id + '">삭제</button></div>' +
        '<div data-pflist="' + id + '" style="margin-top:.5rem"></div></div>';
    }).join('') + '</div>';
    body().innerHTML = h;
  }

  function groupForm(g) {
    var isNew = !g;
    g = g || { memberUids: [] };
    loadUsers().then(function (users) {
      var sel = {};
      (g.memberUids || []).forEach(function (u) { sel[u] = true; });
      var m = G.openModal('<h3>' + (isNew ? '소모임 만들기' : '소모임 수정') + '</h3><form id="gpf">' +
        field('name', '소모임 이름 *', g.name, 'text', true) + area('description', '소개', g.description) + area('goal', '목표·활동 주제', g.goal) +
        '<div class="g-field"><span class="g-label">구성원 <span class="g-muted" id="gpCount"></span></span>' +
        '<input class="g-input" id="gpQ" placeholder="이름 또는 이메일 검색" autocomplete="off">' +
        '<div id="gpList" style="max-height:240px;overflow:auto;border:1px solid #e5e7eb;border-radius:.5rem;padding:.5rem;margin-top:.4rem">' +
        users.map(function (u) {
          return '<label class="g-check" style="display:flex;margin:.25rem 0" data-search="' + esc((u.name + ' ' + u.email).toLowerCase()) + '">' +
            '<input type="checkbox" name="member" value="' + esc(u.uid) + '"' + (sel[u.uid] ? ' checked' : '') + '>' +
            esc(u.name) + ' <span class="g-muted g-small">' + esc(u.email) + '</span></label>';
        }).join('') + '</div></div>' +
        '<div class="g-field"><label class="g-label" for="gpLeader">리더</label><select class="g-select" id="gpLeader" name="leaderUid"></select></div>' +
        formActions('저장') + '</form>', { wide: true });
      var f = m.el.querySelector('#gpf');
      var leaderSel = f.querySelector('#gpLeader');
      var first = true;
      function checkedUids() {
        return [].slice.call(f.querySelectorAll('input[name=member]:checked')).map(function (i) { return i.value; });
      }
      function syncLeader() {
        var cur = first ? (g.leaderUid || '') : leaderSel.value;
        first = false;
        var uids = checkedUids();
        leaderSel.innerHTML = '<option value="">지정 안 함</option>' + uids.map(function (uid) {
          return '<option value="' + esc(uid) + '"' + (uid === cur ? ' selected' : '') + '>' + esc(nameOf(uid)) + '</option>';
        }).join('');
        f.querySelector('#gpCount').textContent = uids.length + '명 선택';
      }
      var q = f.querySelector('#gpQ');
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      q.addEventListener('input', function () {
        var k = q.value.trim().toLowerCase();
        f.querySelectorAll('#gpList [data-search]').forEach(function (l) {
          l.style.display = !k || l.getAttribute('data-search').indexOf(k) !== -1 ? 'flex' : 'none';
        });
      });
      f.addEventListener('change', function (e) { if (e.target.name === 'member') syncLeader(); });
      syncLeader();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var uids = checkedUids();
        var btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        var data = {
          name: f.name.value.trim().slice(0, 60), description: f.description.value.trim().slice(0, 1000),
          goal: f.goal.value.trim().slice(0, 1000), leaderUid: leaderSel.value,
          memberUids: uids, memberNames: uids.map(nameOf), updatedAt: FV.serverTimestamp()
        };
        var job;
        if (isNew) { data.createdAt = FV.serverTimestamp(); job = db.collection('groups').add(data); }
        else job = db.collection('groups').doc(g.id).update(data);
        job.then(function () { m.close(); G.toast('저장했어요.'); return loadGroups(); })
          .catch(function (ex) { btn.disabled = false; fail(ex, '소모임 저장'); });
      });
    }).catch(function (e) { fail(e, '회원 조회'); });
  }

  function deleteGroup(id) {
    var g = findBy(S.groups, id);
    if (!g) return;
    G.confirmModal('「' + g.name + '」 소모임을 삭제할까요? 회원 기록과 이미 만든 포트폴리오는 남습니다.', '삭제').then(function (ok) {
      if (!ok) return;
      return db.collection('groups').doc(id).delete().then(function () { G.toast('삭제했어요.'); return loadGroups(); });
    }).catch(function (e) { fail(e, '소모임 삭제'); });
  }

  function groupPortfolio(id) {
    var g = findBy(S.groups, id);
    if (!g) return;
    var now = new Date();
    var period = 'term';
    var logs = null;
    var m = G.openModal('<h3>' + esc(g.name) + ' 포트폴리오 만들기</h3>' +
      '<div class="g-field"><span class="g-label">기간</span><div class="g-chips" id="gpPeriod"></div></div>' +
      '<div id="gpBody">' + G.loadingHtml() + '</div>', { wide: true });
    var bodyEl = m.el.querySelector('#gpBody');
    var chips = m.el.querySelector('#gpPeriod');

    function drawChips() {
      chips.innerHTML = PERIODS.map(function (p) {
        return '<button type="button" class="g-chip' + (period === p[0] ? ' on' : '') + '" data-gp="' + p[0] + '">' + p[1] + '</button>';
      }).join('');
    }
    function draw() {
      drawChips();
      var label = periodLabel(period, now);
      var list = logs.filter(function (e) { return inRange(e, period, now); }).sort(byDateDesc);
      bodyEl.innerHTML = '<form id="gpForm">' +
        '<div class="g-field"><span class="g-label">담을 기록 <span class="g-muted">' + list.length + '건 · 소모임 공유·전체 공개 기록만</span></span>' +
        (list.length ? '<div style="max-height:45vh;overflow:auto">' + list.map(function (e) {
          return '<label class="g-select-item"><input type="checkbox" name="item" value="' + esc(e.id) + '" checked>' +
            '<div style="flex:1;min-width:0"><ul class="g-list">' + G.entryHtml(e, { showUser: true }) + '</ul></div></label>';
        }).join('') + '</div>' : '<div class="g-empty">이 기간에 소모임과 공유된 기록이 없어요.</div>') + '</div>' +
        field('title', '제목 *', g.name + ' ' + label + ' 포트폴리오', 'text', true) +
        area('intro', '소개', g.description) + area('goal', '향후 활동 계획', '') +
        formActions('포트폴리오 저장') + '</form>';
      var f = bodyEl.querySelector('#gpForm');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var ids = [].slice.call(f.querySelectorAll('input[name=item]:checked')).map(function (i) { return i.value; });
        var chosen = list.filter(function (x) { return ids.indexOf(x.id) !== -1; });
        if (!chosen.length) { G.toast('담을 기록을 하나 이상 골라주세요.', 'error'); return; }
        var btn = f.querySelector('[type=submit]');
        btn.disabled = true;
        var items = chosen.map(function (x) {
          return {
            type: x.type, title: x.title || '', at: G.ymd(x.at), status: x.status,
            answers: x.answers || {}, evidence: x.evidence || [], body: '', userName: x.userName || nameOf(x.uid)
          };
        });
        var range = periodRange(period, now);
        db.collection('portfolios').add({
          kind: 'group', uid: S.profile.uid, groupId: g.id, groupName: g.name, ownerName: g.name,
          members: g.memberNames || [],
          title: f.title.value.trim().slice(0, 100), intro: f.intro.value.trim().slice(0, 2000), goal: f.goal.value.trim().slice(0, 2000),
          period: { from: range.from ? G.ymd(range.from) : '', to: range.to ? G.ymd(range.to) : '', label: label },
          items: items,
          stamps: R.stampCounts(items.map(function (i) { return { type: i.type, status: i.status, at: G.toDate(i.at) }; }), 'all'),
          badges: [], shareMode: 'off',
          createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
        }).then(function (ref) {
          m.close();
          G.openModal('<h3>포트폴리오를 저장했어요</h3><p class="g-muted">처음에는 공유가 꺼져 있어요. 포트폴리오 화면에서 링크 공유를 켤 수 있어요.</p>' +
            '<div class="g-modal-actions"><button class="g-btn secondary" data-close>닫기</button>' +
            '<a class="g-btn" href="/portfolio/?id=' + encodeURIComponent(ref.id) + '" target="_blank" rel="noopener">포트폴리오 열기</a></div>');
        }).catch(function (ex) { btn.disabled = false; fail(ex, '포트폴리오 저장'); });
      });
    }

    chips.addEventListener('click', function (e) {
      var c = e.target.closest('[data-gp]');
      if (!c || !logs) return;
      period = c.getAttribute('data-gp');
      draw();
    });
    drawChips();
    db.collection('activityLog').where('groupId', '==', id).get().then(function (s) {
      logs = fillNames(s.docs.map(normLog)).filter(function (e) {
        return (e.visibility === 'group' || e.visibility === 'public') && e.status !== 'rejected';
      });
      draw();
    }).catch(function (e) {
      bodyEl.innerHTML = G.errorHtml('기록을 불러오지 못했습니다. (' + (e.code || e.message) + ')');
    });
  }

  function listGroupPortfolios(id) {
    var box = null;
    main.querySelectorAll('[data-pflist]').forEach(function (el) { if (el.getAttribute('data-pflist') === id) box = el; });
    if (!box) return;
    box.innerHTML = G.loadingHtml();
    db.collection('portfolios').where('groupId', '==', id).get().then(function (s) {
      var list = docs(s).sort(function (a, b) { return (G.toDate(b.createdAt) || 0) - (G.toDate(a.createdAt) || 0); });
      box.innerHTML = list.length ? '<ul class="g-list">' + list.map(function (p) {
        return '<li class="g-item"><div class="g-item-head"><div><div class="g-item-title">' + esc(p.title) + '</div>' +
          '<div class="g-item-meta">' + esc(G.fmtDate(p.createdAt)) + ' · ' + (p.items || []).length + '건 · ' + (p.shareMode === 'link' ? '링크 공유 중' : '공유 꺼짐') + '</div></div>' +
          '<div class="g-row" style="gap:.3rem"><a class="g-btn small secondary" href="/portfolio/?id=' + encodeURIComponent(p.id) + '" target="_blank" rel="noopener">열기</a>' +
          '<button class="g-btn small danger" data-a="pf-del" data-id="' + esc(p.id) + '" data-g="' + esc(id) + '">삭제</button></div></div></li>';
      }).join('') + '</ul>' : '<div class="g-muted g-small">만든 포트폴리오가 없어요.</div>';
    }).catch(function (e) {
      box.innerHTML = G.errorHtml('불러오지 못했습니다. (' + (e.code || e.message) + ')');
    });
  }

  function deletePortfolio(id, el) {
    var gid = el.getAttribute('data-g');
    G.confirmModal('이 포트폴리오를 삭제할까요? 공유 링크도 더 이상 열리지 않아요.', '삭제').then(function (ok) {
      if (!ok) return;
      return db.collection('portfolios').doc(id).delete().then(function () { G.toast('삭제했어요.'); listGroupPortfolios(gid); });
    }).catch(function (e) { fail(e, '포트폴리오 삭제'); });
  }

  // ---------- 6. 통계·리포트 ----------

  function loadReport() {
    return Promise.all([
      S.ledger ? Promise.resolve(S.ledger) : G.loadAllLedger(),
      loadUsers(),
      db.collection('resources').get(),
      db.collection('groups').get(),
      G.loadWebinarList(),
      G.loadBadgeRules(),
      db.collection('badgeGrants').get()
    ]).then(function (r) {
      S.ledger = fillNames(r[0]);
      S.rep = { resources: docs(r[2]), groups: docs(r[3]), webinars: r[4], rules: r[5], grants: docs(r[6]) };
      if (S.tab === 'report') renderReport();
    });
  }

  function reportEntries(now) {
    // 스탬프 있는 유형만, 같은 활동의 신청+인증은 1회 (회원 화면 스탬프와 같은 기준)
    return R.countable(S.ledger).filter(function (e) { return inRange(e, S.repPeriod, now); });
  }

  function renderReport() {
    var now = new Date();
    var entries = reportEntries(now);
    function ofType(types) { return entries.filter(function (e) { return types.indexOf(e.type) !== -1; }); }
    function perUser(list) { var o = {}; list.forEach(function (e) { if (e.uid) o[e.uid] = (o[e.uid] || 0) + 1; }); return o; }
    function pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '-'; }

    var attend = ofType(R.ATTEND_TYPES);
    var attU = perUser(attend), attUsers = Object.keys(attU);
    var reUsers = attUsers.filter(function (u) { return attU[u] >= 2; }).length;
    var pracU = perUser(ofType(['practice']));
    var converted = attUsers.filter(function (u) { return pracU[u]; }).length;
    var webappRes = S.rep.resources.filter(function (a) { return a.kind === 'webapp'; });
    var used = S.rep.resources.reduce(function (s, a) { return s + (Number(a.usedCount) || 0); }, 0);
    var stamps = R.stampCounts(entries, 'all', now);

    function stat(num, label) {
      return '<div class="g-card g-stat"><div class="g-stat-num">' + esc(num) + '</div><div class="g-stat-label">' + esc(label) + '</div></div>';
    }

    var h = '<div class="g-card"><div class="g-card-title"><span>통계·리포트 <span class="g-muted" style="font-weight:500">' + esc(periodLabel(S.repPeriod, now)) + '</span></span>' +
      '<div class="g-row" style="gap:.35rem"><button class="g-btn small secondary" data-a="rep-refresh">새로 고침</button>' +
      '<button class="g-btn small secondary" data-a="rep-csv-ledger">원장 CSV</button>' +
      '<button class="g-btn small" data-a="rep-csv-members">회원별 요약 CSV</button></div></div>' +
      '<div class="g-chips">' + PERIODS.map(function (p) {
        return '<button class="g-chip' + (S.repPeriod === p[0] ? ' on' : '') + '" data-a="rep-period" data-id="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="g-muted g-small" style="margin-top:.6rem">개인정보 없는 집계입니다. 확인 대기·반려 기록은 빠지고, 교단일기·자료공유·나눔활동 기록이 포함됩니다.</p></div>';

    h += '<div class="g-section-title">참여</div><div class="g-grid cols-4">' +
      stat(Object.keys(perUser(entries)).length + '명', '활동 회원') +
      stat(attend.length + '회', '참여 인증 (웨비나·현장·대외행사)') +
      stat(attUsers.length + '명', '참여 인증 회원') +
      stat(reUsers + '명 · ' + pct(reUsers, attUsers.length), '재참여(2회 이상)') +
      stat(ofType(['sharing_join']).length + '건', '나눔활동 신청 (인증과 겹친 신청 제외)') +
      stat(ofType(['sharing_attend']).length + '회', '현장 참여 인증 (카페연수 등)') + '</div>';
    h += '<div class="g-section-title">성찰·실천·나눔</div><div class="g-grid cols-4">' +
      stat(ofType(['reflection', 'diary']).length + '건', '성찰 기록 (교단일기 포함)') +
      stat(ofType(['practice']).length + '건', '실천 기록') +
      stat(pct(converted, attUsers.length), '실천 전환율 (참여 회원 중)') +
      stat(ofType(['resource_share', 'app_register']).length + '건', '공유 자료') +
      stat(webappRes.length + '개', '웹앱 자료 (현재)') +
      stat(used + '회', '자료 누적 사용 (현재)') +
      stat(S.rep.groups.length + '개', '소모임 (현재)') +
      stat(ofType(['feedback']).length + '건', '자료 후기') + '</div>';
    h += '<div class="g-section-title">스탬프 합계</div><div class="g-card">' + G.stampsHtml(stamps) + '</div>';

    // 활동별 참여 인증 수
    var byWebinar = {};
    attend.forEach(function (e) { byWebinar[e.targetId] = (byWebinar[e.targetId] || 0) + 1; });
    var webinars = S.rep.webinars.filter(function (w) {
      return byWebinar[w.id] || inRange({ at: G.toDate(w.date) }, S.repPeriod, now);
    }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    h += '<div class="g-section-title">활동별 참여 인증</div><div class="g-card">' + (webinars.length ?
      '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>날짜</th><th>활동</th><th>참여자</th><th>성찰 작성</th></tr></thead><tbody>' +
      webinars.map(function (w) {
        var refl = entries.filter(function (e) { return e.type === 'reflection' && e.targetId === w.id; }).length;
        return '<tr><td style="white-space:nowrap">' + esc(G.fmtDate(w.date)) + '</td><td>' + esc(w.title) + ' <span class="g-muted g-small">' + esc(w.category || '') + '</span></td><td>' + Number(byWebinar[w.id] || 0) + '명</td><td>' + refl + '건</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="g-empty">이 기간의 활동이 없어요.</div>') + '</div>';

    // 월별 활동
    var months = {};
    entries.forEach(function (e) {
      if (!e.at) return;
      var k = e.at.getFullYear() + '-' + pad(e.at.getMonth() + 1);
      var row = months[k] || (months[k] = { total: 0, join: 0, reflect: 0, practice: 0, share: 0 });
      row.total++;
      row[R.TYPES[e.type].stamp]++;
    });
    var mk = Object.keys(months).sort().reverse();
    h += '<div class="g-section-title">월별 활동</div><div class="g-card">' + (mk.length ?
      '<div class="g-table-wrap"><table class="g-table"><thead><tr><th>월</th><th>전체</th><th>참여</th><th>성찰</th><th>실천</th><th>나눔</th></tr></thead><tbody>' +
      mk.map(function (k) {
        var r = months[k];
        return '<tr><td>' + k + '</td><td><b>' + r.total + '</b></td><td>' + r.join + '</td><td>' + r.reflect + '</td><td>' + r.practice + '</td><td>' + r.share + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="g-empty">이 기간의 활동이 없어요.</div>') + '</div>';

    body().innerHTML = h;
  }

  function csvLedger() {
    var now = new Date();
    var rows = [['날짜', '회원명', 'uid', '유형', '스탬프', '상태', '제목', '공개범위', '출처']];
    S.ledger.filter(function (e) { return inRange(e, S.repPeriod, now); }).forEach(function (e) {
      var t = R.TYPES[e.type];
      rows.push([
        G.ymd(e.at), e.userName || '', e.uid, t ? t.label : e.type, t && t.stamp ? R.STAMPS[t.stamp].label : '',
        STATUS_TEXT[e.status] || e.status, e.title || '', G.VIS[e.visibility] || '', e.source
      ]);
    });
    G.downloadCsv('gdeal-활동원장-' + periodLabel(S.repPeriod, now) + '.csv', rows);
  }

  function csvMembers() {
    var now = new Date();
    var byUid = {};
    S.ledger.forEach(function (e) { if (e.uid) (byUid[e.uid] = byUid[e.uid] || []).push(e); });
    var grantsBy = {};
    S.rep.grants.forEach(function (g) { (grantsBy[g.uid] = grantsBy[g.uid] || []).push(g.ruleId); });
    var rows = [['이름', '이메일', '참여 스탬프', '성찰 스탬프', '실천 스탬프', '나눔 스탬프', '획득 배지 수']];
    S.users.forEach(function (u) {
      var mine = byUid[u.uid] || [];
      var inPeriod = mine.filter(function (e) { return inRange(e, S.repPeriod, now); });
      var st = R.stampCounts(inPeriod, 'all', now);
      var badges = R.evaluateBadges(S.rep.rules, mine, grantsBy[u.uid] || [], now).filter(function (b) { return b.earned; }).length;
      rows.push([u.name, u.email, st.join, st.reflect, st.practice, st.share, badges]);
    });
    G.downloadCsv('gdeal-회원별요약-' + periodLabel(S.repPeriod, now) + '.csv', rows);
  }

  // ---------- 이벤트 위임 ----------

  var LOADERS = { webinars: loadWebinars, review: loadReview, badges: loadBadges, resources: loadResources, groups: loadGroups, report: loadReport };

  var ACTIONS = {
    login: function () { G.openLogin(); },
    'w-new': function () { webinarForm(); },
    'w-edit': function (id) { webinarForm(findBy(S.webinars, id)); },
    'w-qr': qrModal, 'w-people': peopleModal, 'w-except': addAttendException, 'w-host': addHost, 'w-del': deleteWebinar,
    'r-approve': approveLog, 'r-reject': rejectLog, 'r-del': deleteLog, 'r-add': manualAdd, 'r-loadall': loadLedgerForReview,
    'b-seed': seedBadges, 'b-new': function () { ruleForm(); }, 'b-edit': function (id) { ruleForm(findBy(S.rules, id)); },
    'b-del': deleteRule, 'b-grant': grantFlow, 'b-revoke': revokeGrant,
    'res-webapp': function () { S.resWebappOnly = !S.resWebappOnly; renderResources(); },
    'res-view': resDetail, 'res-feature': toggleResFeature, 'res-del': deleteResource,
    'g-new': function () { groupForm(); }, 'g-edit': function (id) { groupForm(findBy(S.groups, id)); },
    'g-del': deleteGroup, 'g-pf': groupPortfolio, 'g-pflist': listGroupPortfolios, 'pf-del': deletePortfolio,
    'rep-period': function (v) { S.repPeriod = v; renderReport(); },
    'rep-refresh': function () { S.ledger = null; show('report'); },
    'rep-csv-ledger': csvLedger, 'rep-csv-members': csvMembers
  };

  main.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (t) { show(t.getAttribute('data-tab')); return; }
    var a = e.target.closest('[data-a]');
    if (!a) return;
    var fn = ACTIONS[a.getAttribute('data-a')];
    if (fn) fn(a.getAttribute('data-id'), a);
  });

  // ---------- 시작 ----------

  G.onUser(function (user, profile) {
    S.profile = profile;
    S.users = null; S.userMap = {}; S.ledger = null;
    if (!user) {
      main.innerHTML = '<div class="g-wrap g-body"><div class="g-card"><div class="g-card-title">로그인이 필요해요</div>' +
        '<p class="g-muted">운영사무국 또는 최고 관리자 계정으로 로그인해주세요.</p>' +
        '<button class="g-btn" data-a="login" style="margin-top:.75rem">로그인</button></div></div>';
      return;
    }
    if (!profile.isAdmin) {
      main.innerHTML = '<div class="g-wrap g-body"><div class="g-card"><div class="g-card-title">접근 권한이 없어요</div>' +
        '<p class="g-muted">성장패스 관리는 운영사무국 또는 최고 관리자만 이용할 수 있어요.</p>' +
        '<a class="g-btn secondary" href="/growth/" style="margin-top:.75rem">성장패스로 돌아가기</a></div></div>';
      return;
    }
    show(S.tab);
    db.collection('activityLog').where('status', '==', 'pending').get().then(function (s) {
      S.pendingCount = s.size;
      updateCount();
    }).catch(function () {});
  });
})();
