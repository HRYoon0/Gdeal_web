/**
 * 나눔회원 활동 관리 페이지 로직
 * Firebase Auth + Firestore (주 데이터) + Apps Script (시트 백그라운드 동기화)
 */
(function() {
  'use strict';

  // Firebase 설정
  var firebaseConfig = {
    apiKey: "AIzaSyBJsqUJK1AjhrLNzIY_79dIR2Mlg7zD09w",
    authDomain: "gdeal-page-a67e2.firebaseapp.com",
    projectId: "gdeal-page-a67e2",
    storageBucket: "gdeal-page-a67e2.firebasestorage.app",
    messagingSenderId: "654155447220",
    appId: "1:654155447220:web:be9c45c91314842d0150e1"
  };

  try { firebase.app(); } catch (e) { firebase.initializeApp(firebaseConfig); }
  var auth = firebase.auth();
  var db = firebase.firestore();

  // 오프라인 캐시 활성화 (재방문 시 즉시 로드)
  try { db.enablePersistence({ synchronizeTabs: true }).catch(function() {}); } catch(e) {}

  // Google Apps Script 웹 앱 URL (시트 동기화용)
  var API_BASE = 'https://script.google.com/macros/s/AKfycbzBiBMyLmfSpZiNtGiFZB_ml_F7dFbLQYgmgxu05FJHXEn4g_3nxGOvzZxsmzYI8XkYQg/exec';

  // Firestore 컬렉션
  var ACTIVITIES_COL = 'sharingActivities';
  var APPLICATIONS_COL = 'sharingApplications';

  // Google Drive 설정
  var DRIVE_API_KEY = 'AIzaSyASgrkie4njd-Mk0uF1FbPYj0w9UPg0sOE';
  var DRIVE_ROOT_FOLDER = '1I3scHTk6gD2Jfni7CUKQLdUCmmLJyXQX';
  var selectedPhotos = [];
  var driveFolderStack = [];

  // 상태 변수
  var currentUser = null;
  var activities = [];
  var appliedActivityIds = {};
  var currentDetailActivity = null;

  // DOM 요소
  var loadingArea = document.getElementById('loadingArea');
  var tableArea = document.getElementById('tableArea');
  var emptyState = document.getElementById('emptyState');
  var loginPrompt = document.getElementById('loginPrompt');
  var createBtnArea = document.getElementById('createBtnArea');
  var activityTableBody = document.getElementById('activityTableBody');
  var activityModal = document.getElementById('activityModal');
  var detailModal = document.getElementById('detailModal');
  var activityForm = document.getElementById('activityForm');
  var desktopHeader = document.getElementById('desktopHeader');
  var mobileHeader = document.getElementById('mobileHeader');

  // 모바일 사이드바 토글
  var mobileMenuBtn = document.getElementById('mobileMenuBtn');
  var mobileSidebar = document.getElementById('mobileSidebar');
  var mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');

  if (mobileMenuBtn && mobileSidebar && mobileSidebarOverlay) {
    mobileMenuBtn.addEventListener('click', function() {
      mobileSidebar.classList.toggle('-translate-x-full');
      mobileSidebarOverlay.style.display = mobileSidebar.classList.contains('-translate-x-full') ? 'none' : 'block';
    });
    mobileSidebarOverlay.addEventListener('click', function() {
      mobileSidebar.classList.add('-translate-x-full');
      mobileSidebarOverlay.style.display = 'none';
    });
  }

  // 커스텀 드롭다운 초기화
  var categoryDropdown = document.getElementById('categoryDropdown');
  var categorySelected = document.getElementById('categorySelected');
  var categoryList = document.getElementById('categoryList');
  var categoryInput = document.getElementById('activityCategory');

  if (categoryDropdown) {
    categorySelected.classList.add('placeholder');
    categorySelected.addEventListener('click', function(e) {
      e.stopPropagation();
      categoryDropdown.classList.toggle('open');
    });
    var items = categoryList.querySelectorAll('.custom-dropdown-item');
    for (var ci = 0; ci < items.length; ci++) {
      items[ci].addEventListener('click', function(e) {
        e.stopPropagation();
        var val = this.getAttribute('data-value');
        categoryInput.value = val;
        categorySelected.textContent = val;
        categorySelected.classList.remove('placeholder');
        var allItems = categoryList.querySelectorAll('.custom-dropdown-item');
        for (var si = 0; si < allItems.length; si++) { allItems[si].classList.remove('selected'); }
        this.classList.add('selected');
        categoryDropdown.classList.remove('open');
      });
    }
    document.addEventListener('click', function() { categoryDropdown.classList.remove('open'); });
  }

  // Firebase Auth 상태 감지
  auth.onAuthStateChanged(function(user) {
    currentUser = user;
    if (user) {
      loadUserProfile(user.uid);
    } else {
      userProfile = null;
      updateAuthUI();
    }
    loadActivities();
  });

  // Firestore에서 사용자 프로필 가져오기
  var userProfile = null;

  function loadUserProfile(uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        var role = data.role || '';
        var memberTier = data.memberTier;
        if (!memberTier) {
          memberTier = (role === 'superAdmin' || role === 'admin') ? 'operations-office' : 'sharing-member';
        }
        var tierChangedAt = null;
        if (data.tierChangedAt && typeof data.tierChangedAt.toDate === 'function') {
          tierChangedAt = data.tierChangedAt.toDate();
        } else if (data.tierChangedAt) {
          tierChangedAt = new Date(data.tierChangedAt);
        }
        userProfile = {
          uid: data.uid || uid,
          displayName: data.displayName || '',
          role: role,
          memberTier: memberTier,
          status: data.status || '활동중',
          tierChangedAt: tierChangedAt
        };
        if (data.status && data.status !== 'approved') {
          userProfile.memberTier = '';
        }
      } else {
        userProfile = buildDefaultProfile();
      }
      updateAuthUI();
    }).catch(function(err) {
      console.error('사용자 프로필 조회 실패:', err);
      userProfile = buildDefaultProfile();
      updateAuthUI();
    });
  }

  function buildDefaultProfile() {
    return {
      displayName: currentUser ? (currentUser.displayName || currentUser.email || '') : '',
      role: '', memberTier: '', status: ''
    };
  }

  // 배지 관련 함수
  function getBadgeClass(profile) {
    if (!profile) return '';
    if (profile.role === 'superAdmin') return 'bg-[#66ae7d] text-white';
    if (!profile.memberTier) return '';
    if (profile.memberTier === 'operations-office') return 'bg-purple-100 text-purple-800';
    if (profile.memberTier === 'sharing-member') return 'bg-blue-100 text-blue-800';
    if (profile.memberTier === 'learning-member') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  }

  function getBadgeText(profile) {
    if (!profile) return '';
    if (profile.role === 'superAdmin') return '최고 관리자';
    var yy = profile.tierChangedAt ? profile.tierChangedAt.getFullYear().toString().slice(-2) : '';
    if (profile.memberTier === 'operations-office') return yy ? yy + '운영사무국' : '운영사무국';
    if (profile.memberTier === 'sharing-member') return yy ? yy + '나눔회원' : '나눔회원';
    if (profile.memberTier === 'learning-member') return '배움회원';
    return '일반회원';
  }

  // SVG 아이콘 생성
  function createSvgIcon(size, pathD, strokeW) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'w-' + size + ' h-' + size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', strokeW || '2');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  var ICON_LOGOUT = 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1';
  var ICON_LOGIN = 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';
  var ICON_SIGNUP = 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z';

  // 인증 UI (기존과 동일)
  function updateAuthUI() {
    if (!desktopHeader) return;
    removeAuthElements(desktopHeader);
    removeAuthElements(mobileHeader);
  }

  function removeAuthElements(container) {
    var children = Array.prototype.slice.call(container.children);
    for (var i = 1; i < children.length; i++) { container.removeChild(children[i]); }
    renderAuthInto(container, container === desktopHeader ? 'desktop' : 'mobile');
  }

  function renderAuthInto(container, mode) {
    var isDesktop = mode === 'desktop';
    if (currentUser) {
      var isAdmin = userProfile && (userProfile.role === 'superAdmin' || userProfile.memberTier === 'operations-office');
      var badgeClass = getBadgeClass(userProfile);
      var badgeText = getBadgeText(userProfile);
      var displayName = (userProfile && userProfile.displayName) || currentUser.displayName || currentUser.email || '사용자';
      var authWrapper = document.createElement('div');
      authWrapper.className = 'flex items-center space-x-2';
      if (isAdmin) {
        var adminBtn = document.createElement('button');
        if (isDesktop) {
          adminBtn.className = 'text-sm font-medium transition-colors';
          adminBtn.style.color = '#66ae7d';
          adminBtn.title = '관리자 패널';
          adminBtn.textContent = '관리자 패널';
          adminBtn.addEventListener('mouseenter', function() { this.style.color = '#497e56'; });
          adminBtn.addEventListener('mouseleave', function() { this.style.color = '#66ae7d'; });
        } else {
          adminBtn.className = 'text-xs font-medium transition-colors px-2 py-1 rounded';
          adminBtn.style.color = '#66ae7d';
          adminBtn.style.backgroundColor = 'rgba(102, 174, 125, 0.1)';
          adminBtn.title = '관리자 패널';
          adminBtn.textContent = '관리자';
        }
        adminBtn.addEventListener('click', function() { location.href = '/admin/'; });
        authWrapper.appendChild(adminBtn);
      }
      var profileBtn = document.createElement('button');
      profileBtn.className = isDesktop ? 'text-sm text-gray-600 hover:text-[#66ae7d] transition-colors font-medium' : 'text-xs text-gray-600 hover:text-[#66ae7d] transition-colors font-medium px-1';
      profileBtn.title = '개인정보 수정';
      if (badgeClass && badgeText) {
        var badge = document.createElement('span');
        badge.className = (isDesktop ? 'inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ' : 'inline-block px-1.5 py-0.5 rounded-full text-xs font-medium mr-1 ') + badgeClass;
        badge.textContent = badgeText;
        profileBtn.appendChild(badge);
      }
      var name = isDesktop ? displayName : (displayName.length > 5 ? displayName.substring(0, 5) + '...' : displayName);
      profileBtn.appendChild(document.createTextNode(name));
      authWrapper.appendChild(profileBtn);
      var logoutBtn = document.createElement('button');
      logoutBtn.className = isDesktop ? 'p-2 text-gray-600 hover:text-black transition-colors' : 'p-1.5 text-gray-600 hover:text-black transition-colors';
      logoutBtn.title = '로그아웃';
      logoutBtn.addEventListener('click', function() { auth.signOut(); });
      logoutBtn.appendChild(createSvgIcon(isDesktop ? 5 : 4, ICON_LOGOUT));
      authWrapper.appendChild(logoutBtn);
      container.appendChild(authWrapper);
      if (isDesktop) {
        loginPrompt.style.display = 'none';
        while (createBtnArea.firstChild) createBtnArea.removeChild(createBtnArea.firstChild);
        // 나눔회원, 운영사무국, 최고관리자만 활동 개설 가능
        var canCreate = userProfile && (
          userProfile.role === 'superAdmin' ||
          userProfile.memberTier === 'operations-office' ||
          userProfile.memberTier === 'sharing-member'
        );
        if (canCreate) {
          var createBtn = document.createElement('button');
          createBtn.className = 'bg-white text-[#66ae7d] px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center space-x-2';
          createBtn.addEventListener('click', function() { openCreateModal(); });
          var plusSpan = document.createElement('span');
          plusSpan.className = 'text-lg';
          plusSpan.textContent = '+';
          createBtn.appendChild(plusSpan);
          var labelSpan = document.createElement('span');
          labelSpan.textContent = '활동 개설';
          createBtn.appendChild(labelSpan);
          createBtnArea.appendChild(createBtn);
        }
      }
    } else {
      var iconSize = isDesktop ? 5 : 4;
      var loginBtn = document.createElement('button');
      loginBtn.className = 'p-2 text-gray-600 hover:text-black transition-colors';
      loginBtn.title = '로그인';
      loginBtn.appendChild(createSvgIcon(iconSize, ICON_LOGIN));
      loginBtn.addEventListener('click', function() { location.href = '/home/'; });
      container.appendChild(loginBtn);
      var signupBtn = document.createElement('button');
      signupBtn.className = 'p-2 text-gray-600 hover:text-black transition-colors';
      signupBtn.title = '회원가입';
      signupBtn.appendChild(createSvgIcon(iconSize, ICON_SIGNUP));
      signupBtn.addEventListener('click', function() { location.href = '/home/'; });
      container.appendChild(signupBtn);
      if (isDesktop) {
        loginPrompt.style.display = 'block';
        while (createBtnArea.firstChild) createBtnArea.removeChild(createBtnArea.firstChild);
      }
    }
  }

  // ========== 데이터 레이어 (Firestore) ==========

  // 활동 목록 조회 (Firestore)
  function loadActivities() {
    showLoading();

    db.collection(ACTIVITIES_COL).orderBy('createdAt', 'desc').get().then(function(snapshot) {
      activities = [];
      snapshot.forEach(function(doc) {
        var data = doc.data();
        activities.push({
          id: doc.id,
          category: data.category || '',
          name: data.name || '',
          creator: data.creator || '',
          creatorUid: data.creatorUid || '',
          activityDate: data.activityDate || '',
          activityTime: data.activityTime || '',
          location: data.location || '',
          capacity: String(data.capacity || '0'),
          description: data.description || '',
          images: data.images || [],
          status: data.status || '활동중',
          appliedCount: data.appliedCount || 0,
          createdAt: data.createdAt || ''
        });
      });

      // 현재 사용자의 신청 목록 조회
      if (currentUser) {
        return db.collection(APPLICATIONS_COL)
          .where('applicantUid', '==', currentUser.uid)
          .get().then(function(appSnapshot) {
            appliedActivityIds = {};
            appSnapshot.forEach(function(doc) {
              var d = doc.data();
              appliedActivityIds[d.activityId] = true;
            });
            renderTable();
          });
      } else {
        appliedActivityIds = {};
        renderTable();
      }
    }).catch(function(err) {
      console.error('활동 목록 조회 실패:', err);
      hideLoading();
      showToast('활동 목록을 불러오는데 실패했습니다.', 'error');
      activities = [];
      renderTable();
    });
  }

  // 활동 개설/수정 (Firestore + 시트 동기화)
  function saveActivity(editId, payload) {
    var now = new Date().toISOString().split('T')[0];

    if (editId) {
      // 수정
      return db.collection(ACTIVITIES_COL).doc(editId).update({
        category: payload.category,
        name: payload.name,
        activityDate: payload.activityDate,
        activityTime: payload.activityTime,
        location: payload.location,
        capacity: payload.capacity,
        description: payload.description,
        images: selectedPhotos,
        updatedAt: now
      }).then(function() {
        syncToSheet(Object.assign({ action: 'update', id: editId }, payload));
      });
    } else {
      // 개설
      var docData = {
        category: payload.category,
        name: payload.name,
        creator: payload.creator,
        creatorUid: payload.creatorUid,
        activityDate: payload.activityDate,
        activityTime: payload.activityTime,
        location: payload.location,
        capacity: payload.capacity,
        description: payload.description,
        images: selectedPhotos,
        status: '활동중',
        appliedCount: 0,
        createdAt: now,
        updatedAt: now
      };
      return db.collection(ACTIVITIES_COL).add(docData).then(function(docRef) {
        syncToSheet(Object.assign({ action: 'create', id: docRef.id }, payload, { createdAt: now }));
      });
    }
  }

  // 활동 상태 변경
  function toggleActivityStatus(activityId, currentStatus) {
    var newStatus = currentStatus === '활동중' ? '종료' : '활동중';
    if (!confirm('이 활동을 "' + newStatus + '" 상태로 변경하시겠습니까?')) return;

    db.collection(ACTIVITIES_COL).doc(activityId).update({
      status: newStatus
    }).then(function() {
      showToast('활동이 "' + newStatus + '" 상태로 변경되었습니다.', 'success');
      loadActivities();
    }).catch(function(err) {
      console.error('상태 변경 실패:', err);
      showToast('상태 변경에 실패했습니다.', 'error');
    });
  }

  // 활동 삭제 (Firestore + 시트 동기화)
  function deleteActivity(activityId) {
    if (!confirm('이 활동을 삭제하시겠습니까?')) return;

    // Firestore에서 활동 삭제
    db.collection(ACTIVITIES_COL).doc(activityId).delete().then(function() {
      // 관련 신청 기록도 삭제
      return db.collection(APPLICATIONS_COL)
        .where('activityId', '==', activityId)
        .get().then(function(snapshot) {
          var batch = db.batch();
          snapshot.forEach(function(doc) { batch.delete(doc.ref); });
          return batch.commit();
        });
    }).then(function() {
      showToast('활동이 삭제되었습니다.', 'success');
      loadActivities();
      syncToSheet({ action: 'delete', id: activityId, creatorUid: currentUser.uid, isAdmin: true });
    }).catch(function(err) {
      console.error('활동 삭제 실패:', err);
      showToast('삭제에 실패했습니다.', 'error');
    });
  }

  // 활동 신청 (Firestore + 시트 동기화)
  function applyDirect(activityId) {
    if (!currentUser) return;
    if (!confirm('이 활동에 신청하시겠습니까?')) return;

    var applicantName = currentUser.displayName || currentUser.email || '사용자';
    var now = new Date().toISOString().split('T')[0];

    // 중복 확인
    db.collection(APPLICATIONS_COL)
      .where('activityId', '==', activityId)
      .where('applicantUid', '==', currentUser.uid)
      .get().then(function(snapshot) {
        if (!snapshot.empty) {
          showToast('이미 신청한 활동입니다.', 'error');
          return;
        }

        // 신청 기록 추가
        return db.collection(APPLICATIONS_COL).add({
          activityId: activityId,
          applicant: applicantName,
          applicantUid: currentUser.uid,
          date: now,
          status: '신청완료'
        }).then(function() {
          // 활동의 신청수 증가
          return db.collection(ACTIVITIES_COL).doc(activityId).update({
            appliedCount: firebase.firestore.FieldValue.increment(1)
          });
        }).then(function() {
          showToast('신청이 완료되었습니다.', 'success');
          loadActivities();
          syncToSheet({ action: 'apply', activityId: activityId, applicant: applicantName, applicantUid: currentUser.uid });
        });
      }).catch(function(err) {
        console.error('신청 실패:', err);
        showToast('신청에 실패했습니다.', 'error');
      });
  }

  // 신청 취소 (Firestore + 시트 동기화)
  function cancelDirect(activityId) {
    if (!currentUser) return;
    if (!confirm('이 활동의 신청을 취소하시겠습니까?')) return;

    db.collection(APPLICATIONS_COL)
      .where('activityId', '==', activityId)
      .where('applicantUid', '==', currentUser.uid)
      .get().then(function(snapshot) {
        if (snapshot.empty) {
          showToast('신청 기록을 찾을 수 없습니다.', 'error');
          return;
        }

        var batch = db.batch();
        snapshot.forEach(function(doc) { batch.delete(doc.ref); });

        return batch.commit().then(function() {
          return db.collection(ACTIVITIES_COL).doc(activityId).update({
            appliedCount: firebase.firestore.FieldValue.increment(-1)
          });
        }).then(function() {
          showToast('신청이 취소되었습니다.', 'success');
          loadActivities();
          syncToSheet({ action: 'cancel', activityId: activityId, applicantUid: currentUser.uid });
        });
      }).catch(function(err) {
        console.error('신청 취소 실패:', err);
        showToast('신청 취소에 실패했습니다.', 'error');
      });
  }

  // 신청자 목록 조회 (Firestore)
  function loadApplicants(activityId) {
    return db.collection(APPLICATIONS_COL)
      .where('activityId', '==', activityId)
      .get().then(function(snapshot) {
        var applicants = [];
        snapshot.forEach(function(doc) {
          var d = doc.data();
          applicants.push({
            name: d.applicant || '',
            uid: d.applicantUid || '',
            date: d.date || '',
            status: d.status || ''
          });
        });
        return applicants;
      });
  }

  // 시트 백그라운드 동기화 (실패해도 무시)
  function syncToSheet(params) {
    try {
      fetch(API_BASE, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(params)
      }).catch(function() {});
    } catch(e) {}
  }

  // ========== UI 렌더링 (기존과 동일) ==========

  function renderTable() {
    hideLoading();
    var filtered = getFilteredActivities();

    if (filterResultCount) {
      filterResultCount.textContent = activities.length > 0 ? '총 ' + activities.length + '개 중 ' + filtered.length + '개 표시' : '';
    }

    if (filtered.length === 0) {
      tableArea.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';
    tableArea.style.display = 'block';
    while (activityTableBody.firstChild) { activityTableBody.removeChild(activityTableBody.firstChild); }

    var filteredForRender = filtered;
    for (var i = 0; i < filteredForRender.length; i++) {
      (function(index, activityItem) {
        var a = activityItem;
        var isOwner = currentUser && (a.creatorUid === currentUser.uid);
        var isAdmin = currentUser && userProfile && (userProfile.role === 'superAdmin' || userProfile.memberTier === 'operations-office');
        var tr = document.createElement('tr');

        // 상태
        var tdStatus = document.createElement('td');
        var actStatus = a.status || '활동중';
        var statusBadge = document.createElement('span');
        statusBadge.className = actStatus === '활동중' ? 'status-active' : 'status-ended';
        statusBadge.textContent = actStatus === '활동중' ? '활동중' : '종료';
        tdStatus.appendChild(statusBadge);
        tr.appendChild(tdStatus);

        var tdCategory = document.createElement('td');
        var categoryBadge = document.createElement('span');
        categoryBadge.className = 'category-badge ' + getCategoryClass(a.category);
        categoryBadge.textContent = a.category || '-';
        tdCategory.appendChild(categoryBadge);
        tr.appendChild(tdCategory);

        var tdName = document.createElement('td');
        tdName.className = 'activity-name';
        tdName.textContent = a.name || '';
        tdName.addEventListener('click', function() { showDetail(activityItem); });
        tr.appendChild(tdName);

        var tdCreator = document.createElement('td');
        tdCreator.textContent = a.creator || '';
        tr.appendChild(tdCreator);

        var tdDate = document.createElement('td');
        tdDate.style.whiteSpace = 'nowrap';
        var dateStr = a.activityDate || '';
        if (a.activityTime) dateStr += ' ' + a.activityTime;
        tdDate.textContent = dateStr;
        tr.appendChild(tdDate);

        var tdLocation = document.createElement('td');
        renderTextWithLinks(tdLocation, a.location || '-', 30);
        tr.appendChild(tdLocation);

        var tdDesc = document.createElement('td');
        tdDesc.textContent = truncate(a.description || '-', 40);
        tr.appendChild(tdDesc);

        var tdCapacity = document.createElement('td');
        var cap = parseInt(a.capacity) || 0;
        var applied = parseInt(a.appliedCount) || 0;
        var capSpan = document.createElement('span');
        capSpan.className = 'capacity-info';
        if (cap > 0) {
          if (applied >= cap) capSpan.className += ' capacity-full';
          capSpan.textContent = applied + '/' + cap;
        } else {
          capSpan.textContent = '제한없음';
        }
        tdCapacity.appendChild(capSpan);
        tr.appendChild(tdCapacity);

        var tdActions = document.createElement('td');
        tdActions.style.whiteSpace = 'nowrap';
        if (currentUser) {
          var isApplied = appliedActivityIds[String(a.id)] === true;
          var applyBtn = document.createElement('button');
          if (isApplied) {
            applyBtn.className = 'btn-table-action action-cancel';
            applyBtn.textContent = '신청취소';
            applyBtn.addEventListener('click', function() { cancelDirect(a.id); });
          } else {
            applyBtn.className = 'btn-table-action action-apply';
            applyBtn.textContent = '신청';
            applyBtn.addEventListener('click', function() { applyDirect(a.id); });
          }
          tdActions.appendChild(applyBtn);
        }
        if (isOwner || isAdmin) {
          var editBtn = document.createElement('button');
          editBtn.className = 'btn-table-action action-edit';
          editBtn.textContent = '수정';
          editBtn.addEventListener('click', function() { openEditModal(activityItem); });
          tdActions.appendChild(editBtn);

          var delBtn = document.createElement('button');
          delBtn.className = 'btn-table-action action-delete';
          delBtn.textContent = '삭제';
          delBtn.addEventListener('click', function() { deleteActivity(a.id); });
          tdActions.appendChild(delBtn);

          var statusBtn = document.createElement('button');
          statusBtn.className = 'btn-table-action action-status';
          statusBtn.textContent = actStatus === '활동중' ? '종료' : '재개';
          statusBtn.addEventListener('click', function() { toggleActivityStatus(a.id, actStatus); });
          tdActions.appendChild(statusBtn);
        }
        tr.appendChild(tdActions);
        activityTableBody.appendChild(tr);
      })(i, filteredForRender[i]);
    }
  }

  function showDetail(activityObj) {
    var a = activityObj;
    if (!a) return;
    currentDetailActivity = a;
    document.getElementById('detailTitle').textContent = a.name || '활동 상세';
    var detailContent = document.getElementById('detailContent');
    while (detailContent.firstChild) { detailContent.removeChild(detailContent.firstChild); }

    var capText = '';
    var cap = parseInt(a.capacity) || 0;
    var applied = parseInt(a.appliedCount) || 0;
    if (cap > 0) {
      capText = applied + '/' + cap + (applied >= cap ? ' (정원 초과 신청 가능)' : '');
    } else { capText = '제한없음'; }
    var dateTimeText = a.activityDate || '';
    if (a.activityTime) dateTimeText += ' ' + a.activityTime;

    var fields = [
      ['상태', '__STATUS__'],
      ['나눔 영역', (getCategoryGroup(a.category) ? getCategoryGroup(a.category) + ' > ' : '') + (a.category || '-')],
      ['활동명', a.name], ['개설자', a.creator], ['일시', dateTimeText],
      ['장소/링크', a.location], ['정원', capText], ['활동 내용', a.description], ['생성일', a.createdAt]
    ];
    for (var i = 0; i < fields.length; i++) {
      var row = document.createElement('div');
      row.className = 'detail-row';
      var label = document.createElement('div');
      label.className = 'detail-label';
      label.textContent = fields[i][0];
      row.appendChild(label);
      var value = document.createElement('div');
      value.className = 'detail-value';
      var fieldText = fields[i][1] || '-';
      if (fields[i][0] === '상태') {
        var sBadge = document.createElement('span');
        var sVal = a.status || '활동중';
        sBadge.className = sVal === '활동중' ? 'status-active' : 'status-ended';
        sBadge.textContent = sVal === '활동중' ? '활동중' : '종료';
        value.appendChild(sBadge);
      } else if (fields[i][0] === '장소/링크') { renderTextWithLinks(value, fieldText); }
      else { value.textContent = fieldText; }
      row.appendChild(value);
      detailContent.appendChild(row);
    }

    // 활동 사진 갤러리
    if (a.images && a.images.length > 0) {
      var photoRow = document.createElement('div');
      photoRow.className = 'detail-row';
      var photoLabel = document.createElement('div');
      photoLabel.className = 'detail-label';
      photoLabel.textContent = '활동 사진';
      photoRow.appendChild(photoLabel);
      var photoValue = document.createElement('div');
      photoValue.className = 'detail-value';
      var gallery = document.createElement('div');
      gallery.className = 'detail-gallery';
      for (var pi = 0; pi < a.images.length; pi++) {
        (function(imgUrl, imgIndex, allImages) {
          var img = document.createElement('img');
          img.src = imgUrl;
          img.alt = '활동 사진';
          img.addEventListener('click', function() {
            openLightbox(allImages, imgIndex);
          });
          gallery.appendChild(img);
        })(a.images[pi], pi, a.images);
      }
      photoValue.appendChild(gallery);
      photoRow.appendChild(photoValue);
      detailContent.appendChild(photoRow);
    }

    // 신청자 목록
    var canViewApplicants = currentUser && userProfile && (
      userProfile.role === 'superAdmin' ||
      userProfile.memberTier === 'operations-office' ||
      userProfile.memberTier === 'sharing-member'
    );
    var oldApplicantArea = document.getElementById('applicantArea');
    if (oldApplicantArea) oldApplicantArea.remove();

    if (canViewApplicants) {
      var applicantArea = document.createElement('div');
      applicantArea.id = 'applicantArea';
      applicantArea.style.marginTop = '1rem';
      applicantArea.style.borderTop = '2px solid #66ae7d';
      applicantArea.style.paddingTop = '1rem';
      var applicantTitle = document.createElement('div');
      applicantTitle.style.fontWeight = '700';
      applicantTitle.style.fontSize = '0.95rem';
      applicantTitle.style.marginBottom = '0.5rem';
      applicantTitle.style.color = '#1f2937';
      applicantTitle.textContent = '신청자 목록';
      applicantArea.appendChild(applicantTitle);
      var loadingText = document.createElement('div');
      loadingText.textContent = '불러오는 중...';
      loadingText.style.color = '#9ca3af';
      loadingText.style.fontSize = '0.875rem';
      applicantArea.appendChild(loadingText);
      detailContent.appendChild(applicantArea);

      loadApplicants(a.id).then(function(list) {
        applicantArea.removeChild(loadingText);
        if (list.length === 0) {
          var empty = document.createElement('div');
          empty.textContent = '아직 신청자가 없습니다.';
          empty.style.color = '#9ca3af';
          empty.style.fontSize = '0.875rem';
          applicantArea.appendChild(empty);
        } else {
          var table = document.createElement('table');
          table.style.width = '100%';
          table.style.fontSize = '0.85rem';
          table.style.borderCollapse = 'collapse';
          var thead = document.createElement('thead');
          var headerRow = document.createElement('tr');
          ['번호', '이름', '신청일', '상태'].forEach(function(h) {
            var th = document.createElement('th');
            th.textContent = h;
            th.style.padding = '0.4rem 0.5rem';
            th.style.textAlign = 'left';
            th.style.borderBottom = '1px solid #d1d5db';
            th.style.fontWeight = '600';
            th.style.color = '#374151';
            th.style.backgroundColor = '#f0faf3';
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);
          var tbody = document.createElement('tbody');
          for (var li = 0; li < list.length; li++) {
            var tr = document.createElement('tr');
            [String(li + 1), list[li].name, list[li].date, list[li].status].forEach(function(v) {
              var td = document.createElement('td');
              td.textContent = v;
              td.style.padding = '0.4rem 0.5rem';
              td.style.borderBottom = '1px solid #e5e7eb';
              td.style.color = '#4b5563';
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          }
          table.appendChild(tbody);
          applicantArea.appendChild(table);
          var total = document.createElement('div');
          total.style.marginTop = '0.5rem';
          total.style.fontSize = '0.8rem';
          total.style.color = '#6b7280';
          total.textContent = '총 ' + list.length + '명 신청';
          applicantArea.appendChild(total);
        }
      }).catch(function() {
        loadingText.textContent = '신청자 목록을 불러오지 못했습니다.';
        loadingText.style.color = '#ef4444';
      });
    }

    var applyBtn = document.getElementById('detailApplyBtn');
    if (currentUser) {
      applyBtn.style.display = 'inline-flex';
      var isApplied = appliedActivityIds[String(a.id)] === true;
      if (isApplied) {
        applyBtn.textContent = '신청취소';
        applyBtn.style.backgroundColor = '#ef4444';
        applyBtn.onclick = function() { cancelFromDetail(); };
      } else {
        applyBtn.textContent = '신청하기';
        applyBtn.style.backgroundColor = '#3b82f6';
        applyBtn.onclick = function() { applyForActivity(); };
      }
    } else { applyBtn.style.display = 'none'; }

    detailModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // 모달
  function openCreateModal() {
    document.getElementById('modalTitle').textContent = '활동 개설';
    document.getElementById('submitBtn').textContent = '개설하기';
    document.getElementById('editActivityId').value = '';
    activityForm.reset();
    categoryInput.value = '';
    categorySelected.textContent = '나눔 영역을 선택해주세요';
    categorySelected.classList.add('placeholder');
    var allItems = categoryList.querySelectorAll('.custom-dropdown-item');
    for (var ri = 0; ri < allItems.length; ri++) { allItems[ri].classList.remove('selected'); }
    selectedPhotos = [];
    renderPhotoPreview();
    // 드라이브 탐색 초기화
    driveFolderStack = [];
    loadDriveFolder(DRIVE_ROOT_FOLDER, 'G-DEAL 나눔활동');
    if (tabDrive) { tabDrive.classList.add('active'); tabLink.classList.remove('active'); }
    if (drivePanel) drivePanel.style.display = 'block';
    if (linkPanel) linkPanel.style.display = 'none';
    activityModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function openEditModal(activityObj) {
    var a = activityObj;
    if (!a) return;
    document.getElementById('modalTitle').textContent = '활동 수정';
    document.getElementById('submitBtn').textContent = '수정하기';
    document.getElementById('editActivityId').value = a.id;
    document.getElementById('activityCategory').value = a.category || '';
    if (a.category) {
      categorySelected.textContent = a.category;
      categorySelected.classList.remove('placeholder');
      var allItems = categoryList.querySelectorAll('.custom-dropdown-item');
      for (var si = 0; si < allItems.length; si++) {
        allItems[si].classList.remove('selected');
        if (allItems[si].getAttribute('data-value') === a.category) allItems[si].classList.add('selected');
      }
    }
    document.getElementById('activityName').value = a.name || '';
    document.getElementById('activityDate').value = a.activityDate || '';
    document.getElementById('activityTime').value = a.activityTime || '';
    document.getElementById('activityLocation').value = a.location || '';
    document.getElementById('capacity').value = a.capacity || '';
    document.getElementById('description').value = a.description || '';
    selectedPhotos = (a.images || []).slice();
    renderPhotoPreview();
    driveFolderStack = [];
    loadDriveFolder(DRIVE_ROOT_FOLDER, 'G-DEAL 나눔활동');
    if (tabDrive) { tabDrive.classList.add('active'); tabLink.classList.remove('active'); }
    if (drivePanel) drivePanel.style.display = 'block';
    if (linkPanel) linkPanel.style.display = 'none';
    activityModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  window.closeModal = function() { activityModal.classList.remove('active'); document.body.style.overflow = ''; };
  window.closeDetailModal = function() { detailModal.classList.remove('active'); document.body.style.overflow = ''; };

  activityModal.addEventListener('click', function(e) { if (e.target === activityModal) window.closeModal(); });
  detailModal.addEventListener('click', function(e) { if (e.target === detailModal) window.closeDetailModal(); });

  // 폼 제출
  activityForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!currentUser) { showToast('로그인이 필요합니다.', 'error'); return; }
    var editId = document.getElementById('editActivityId').value;
    var payload = {
      category: document.getElementById('activityCategory').value,
      name: document.getElementById('activityName').value.trim(),
      activityDate: document.getElementById('activityDate').value,
      activityTime: document.getElementById('activityTime').value,
      location: document.getElementById('activityLocation').value.trim(),
      capacity: document.getElementById('capacity').value || '0',
      description: document.getElementById('description').value.trim()
    };
    if (!payload.category) { showToast('나눔 영역을 선택해주세요.', 'error'); return; }
    if (!payload.name) { showToast('활동명을 입력해주세요.', 'error'); return; }

    var submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '처리 중...';
    payload.creator = currentUser.displayName || currentUser.email || '사용자';
    payload.creatorUid = currentUser.uid;

    saveActivity(editId, payload).then(function() {
      showToast(editId ? '활동이 수정되었습니다.' : '활동이 개설되었습니다.', 'success');
      window.closeModal();
      loadActivities();
    }).catch(function(err) {
      console.error('활동 저장 실패:', err);
      showToast('저장에 실패했습니다: ' + (err.message || ''), 'error');
    }).finally(function() {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? '수정하기' : '개설하기';
    });
  });

  // 상세 모달에서 신청/취소
  window.applyForActivity = function() {
    if (!currentUser || !currentDetailActivity) return;
    applyDirect(currentDetailActivity.id);
    window.closeDetailModal();
  };

  window.cancelFromDetail = function() {
    if (!currentUser || !currentDetailActivity) return;
    cancelDirect(currentDetailActivity.id);
    window.closeDetailModal();
  };

  // 유틸리티
  function showLoading() { loadingArea.style.display = 'flex'; tableArea.style.display = 'none'; emptyState.style.display = 'none'; }
  function hideLoading() { loadingArea.style.display = 'none'; }

  function showToast(message, type) {
    var toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + (type || 'success');
    void toast.offsetWidth;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 3000);
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '...';
  }

  var KNOWLEDGE_TYPES = ['찾아가는 카페연수', '디지털 수업실천 웨비나', '디지털 별뉘'];
  var CONTENT_TYPES = [];
  var FACILITATION_TYPES = ['교육독서모임', '미니스터디'];

  function getCategoryClass(category) {
    if (!category) return '';
    if (KNOWLEDGE_TYPES.indexOf(category) >= 0) return 'knowledge';
    if (CONTENT_TYPES.indexOf(category) >= 0) return 'content';
    if (FACILITATION_TYPES.indexOf(category) >= 0) return 'facilitation';
    return '';
  }

  // maxDisplayLen 지정 시, 표시 텍스트만 잘라서 '...' 처리. href에는 항상 원본 URL 전체 유지.
  function renderTextWithLinks(container, text, maxDisplayLen) {
    if (!text) { container.textContent = '-'; return; }
    var urlRegex = /(https?:\/\/[^\s,]+)/g;
    var parts = text.split(urlRegex);
    var used = 0;
    var truncated = false;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      var isUrl = /^https?:\/\//.test(part);
      var remaining = maxDisplayLen ? (maxDisplayLen - used) : Infinity;
      if (remaining <= 0) { truncated = true; break; }

      var displayText;
      if (part.length > remaining) {
        displayText = part.substring(0, Math.max(remaining, 8));
        truncated = true;
      } else {
        displayText = part;
      }

      if (isUrl) {
        var a = document.createElement('a');
        a.href = part;                  // 원본 URL 전체
        a.textContent = displayText;    // 잘린 표시 텍스트
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.color = '#3b82f6';
        a.style.textDecoration = 'underline';
        a.style.wordBreak = 'break-all';
        container.appendChild(a);
      } else {
        container.appendChild(document.createTextNode(displayText));
      }

      used += displayText.length;
      if (truncated) break;
    }
    if (truncated) container.appendChild(document.createTextNode('...'));
  }

  function getCategoryGroup(category) {
    if (!category) return '';
    if (KNOWLEDGE_TYPES.indexOf(category) >= 0) return '지식/경험나눔형';
    if (CONTENT_TYPES.indexOf(category) >= 0) return '콘텐츠 나눔형';
    if (FACILITATION_TYPES.indexOf(category) >= 0) return '퍼실리테이션형';
    return '';
  }

  // ========== 필터 토글 ==========
  var filterToggle = document.getElementById('filterToggle');
  var filterBody = document.getElementById('filterBody');
  var filterArrow = document.getElementById('filterArrow');

  if (filterToggle) {
    filterToggle.addEventListener('click', function() {
      var isOpen = filterBody.style.display !== 'none';
      filterBody.style.display = isOpen ? 'none' : 'block';
      filterArrow.classList.toggle('open', !isOpen);
    });
  }

  // ========== 필터링 ==========
  var filterSearch = document.getElementById('filterSearch');
  var filterDateFrom = document.getElementById('filterDateFrom');
  var filterDateTo = document.getElementById('filterDateTo');
  var filterCategories = document.getElementById('filterCategories');
  var filterResetBtn = document.getElementById('filterResetBtn');
  var filterResultCount = document.getElementById('filterResultCount');

  var filterStatusEl = document.getElementById('filterStatus');

  function getFilteredActivities() {
    var searchText = (filterSearch ? filterSearch.value.trim().toLowerCase() : '');
    var dateFrom = filterDateFrom ? filterDateFrom.value : '';
    var dateTo = filterDateTo ? filterDateTo.value : '';

    // 체크된 카테고리
    var checkedCategories = {};
    if (filterCategories) {
      var checks = filterCategories.querySelectorAll('input[type=checkbox]');
      for (var ci = 0; ci < checks.length; ci++) {
        if (checks[ci].checked) checkedCategories[checks[ci].value] = true;
      }
    }

    // 체크된 상태
    var checkedStatus = {};
    if (filterStatusEl) {
      var statusChecks = filterStatusEl.querySelectorAll('input[type=checkbox]');
      for (var si = 0; si < statusChecks.length; si++) {
        if (statusChecks[si].checked) checkedStatus[statusChecks[si].value] = true;
      }
    }

    var filtered = [];
    for (var i = 0; i < activities.length; i++) {
      var a = activities[i];
      var actStatus = a.status || '활동중';

      // 상태 필터
      if (!checkedStatus[actStatus]) continue;

      // 카테고리 필터
      if (a.category && !checkedCategories[a.category]) continue;

      // 검색 필터
      if (searchText) {
        var nameMatch = (a.name || '').toLowerCase().indexOf(searchText) >= 0;
        var creatorMatch = (a.creator || '').toLowerCase().indexOf(searchText) >= 0;
        if (!nameMatch && !creatorMatch) continue;
      }

      // 기간 필터
      if (dateFrom && a.activityDate && a.activityDate < dateFrom) continue;
      if (dateTo && a.activityDate && a.activityDate > dateTo) continue;

      filtered.push(a);
    }

    return filtered;
  }

  function onFilterChange() {
    renderTable();
  }

  if (filterSearch) filterSearch.addEventListener('input', onFilterChange);
  if (filterDateFrom) filterDateFrom.addEventListener('change', onFilterChange);
  if (filterDateTo) filterDateTo.addEventListener('change', onFilterChange);
  if (filterCategories) filterCategories.addEventListener('change', onFilterChange);
  if (filterStatusEl) filterStatusEl.addEventListener('change', onFilterChange);
  if (filterResetBtn) {
    filterResetBtn.addEventListener('click', function() {
      if (filterSearch) filterSearch.value = '';
      if (filterDateFrom) filterDateFrom.value = '';
      if (filterDateTo) filterDateTo.value = '';
      if (filterCategories) {
        var checks = filterCategories.querySelectorAll('input[type=checkbox]');
        for (var ci = 0; ci < checks.length; ci++) checks[ci].checked = true;
      }
      if (filterStatusEl) {
        var sChecks = filterStatusEl.querySelectorAll('input[type=checkbox]');
        sChecks[0].checked = true;  // 활동중 체크
        sChecks[1].checked = false; // 종료 해제
      }
      onFilterChange();
    });
  }

  // ========== 이미지 라이트박스 ==========
  var lightboxImages = [];
  var lightboxIndex = 0;
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightboxImg');
  var lightboxCounter = document.getElementById('lightboxCounter');

  function openLightbox(images, startIndex) {
    lightboxImages = images;
    lightboxIndex = startIndex || 0;
    updateLightbox();
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function updateLightbox() {
    lightboxImg.src = lightboxImages[lightboxIndex];
    lightboxCounter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
  }

  function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.getElementById('lightboxClose').addEventListener('click', function(e) { e.stopPropagation(); closeLightbox(); });
  document.getElementById('lightboxPrev').addEventListener('click', function(e) {
    e.stopPropagation();
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightbox();
  });
  document.getElementById('lightboxNext').addEventListener('click', function(e) {
    e.stopPropagation();
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    updateLightbox();
  });
  lightbox.addEventListener('click', function(e) {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function(e) {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; updateLightbox(); }
    if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; updateLightbox(); }
  });

  // ========== 구글 드라이브 사진 관리 ==========

  // URL에서 Drive 파일 ID 추출
  function extractDriveFileId(url) {
    if (!url) return null;
    var patterns = [
      /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
      /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
      /https:\/\/drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  // Drive 파일 ID → 썸네일 URL
  function toThumbnailUrl(fileIdOrUrl) {
    var fileId = extractDriveFileId(fileIdOrUrl) || fileIdOrUrl;
    return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
  }

  // 드라이브 폴더 로드 (그리드 UI)
  function loadDriveFolder(folderId, folderName) {
    var contents = document.getElementById('driveContents');
    var loadingEl = document.getElementById('driveLoading');
    var errorEl = document.getElementById('driveError');
    var breadcrumb = document.getElementById('driveBreadcrumb');
    var statusLeft = document.getElementById('driveStatusLeft');
    var statusRight = document.getElementById('driveStatusRight');

    if (folderName) {
      driveFolderStack.push({ id: folderId, name: folderName });
    }

    // 경로 업데이트
    var pathParts = [];
    for (var pi = 0; pi < driveFolderStack.length; pi++) { pathParts.push(driveFolderStack[pi].name); }
    breadcrumb.textContent = pathParts.join(' > ');

    contents.textContent = '';
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';

    var folderQuery = 'https://www.googleapis.com/drive/v3/files?' + encodeParams({
      q: "'" + folderId + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id,name)',
      key: DRIVE_API_KEY,
      orderBy: 'name'
    });

    var imageQuery = 'https://www.googleapis.com/drive/v3/files?' + encodeParams({
      q: "'" + folderId + "' in parents and mimeType contains 'image/' and trashed = false",
      fields: 'files(id,name)',
      key: DRIVE_API_KEY,
      orderBy: 'name'
    });

    Promise.all([
      fetch(folderQuery).then(function(r) { return r.json(); }),
      fetch(imageQuery).then(function(r) { return r.json(); })
    ]).then(function(results) {
      loadingEl.style.display = 'none';
      contents.textContent = '';
      var folders = (results[0].files || []);
      var images = (results[1].files || []);

      statusLeft.textContent = '📁 ' + folders.length + '개 폴더, 🖼️ ' + images.length + '개 이미지';
      statusRight.textContent = selectedPhotos.length + '개 추가됨';

      // 상위 폴더 버튼
      if (driveFolderStack.length > 1) {
        var backItem = document.createElement('div');
        backItem.className = 'drive-back-item';
        var backIcon = document.createElement('span');
        backIcon.className = 'item-icon';
        backIcon.textContent = '⬆';
        backItem.appendChild(backIcon);
        var backName = document.createElement('span');
        backName.className = 'item-name';
        backName.textContent = '상위 폴더';
        backItem.appendChild(backName);
        backItem.addEventListener('click', function() {
          driveFolderStack.pop();
          var prev = driveFolderStack.pop();
          loadDriveFolder(prev.id, prev.name);
        });
        contents.appendChild(backItem);
      }

      // 폴더 그리드
      for (var fi = 0; fi < folders.length; fi++) {
        (function(folder) {
          var item = document.createElement('div');
          item.className = 'drive-grid-item';
          var icon = document.createElement('span');
          icon.className = 'item-icon';
          icon.textContent = '📁';
          item.appendChild(icon);
          var name = document.createElement('span');
          name.className = 'item-name';
          name.textContent = '📁 ' + folder.name;
          item.appendChild(name);
          item.addEventListener('click', function() {
            loadDriveFolder(folder.id, folder.name);
          });
          contents.appendChild(item);
        })(folders[fi]);
      }

      // 이미지 그리드
      for (var ii = 0; ii < images.length; ii++) {
        (function(image) {
          var thumbUrl = toThumbnailUrl(image.id);
          var isSelected = false;
          for (var si = 0; si < selectedPhotos.length; si++) {
            if (selectedPhotos[si].indexOf(image.id) >= 0) { isSelected = true; break; }
          }

          var item = document.createElement('div');
          item.className = 'drive-grid-item' + (isSelected ? ' selected' : '');
          var img = document.createElement('img');
          img.className = 'item-thumb';
          img.src = 'https://drive.google.com/thumbnail?id=' + image.id + '&sz=w200';
          img.alt = image.name;
          item.appendChild(img);
          var name = document.createElement('span');
          name.className = 'item-name';
          name.textContent = image.name;
          item.appendChild(name);
          item.addEventListener('click', function() {
            if (item.classList.contains('selected')) {
              // 선택 해제
              for (var ri = selectedPhotos.length - 1; ri >= 0; ri--) {
                if (selectedPhotos[ri].indexOf(image.id) >= 0) {
                  selectedPhotos.splice(ri, 1);
                  break;
                }
              }
              item.classList.remove('selected');
            } else {
              addPhoto(image.id);
              item.classList.add('selected');
            }
            statusRight.textContent = selectedPhotos.length + '개 추가됨';
            renderPhotoPreview();
          });
          contents.appendChild(item);
        })(images[ii]);
      }

      if (folders.length === 0 && images.length === 0) {
        var empty = document.createElement('div');
        empty.style.gridColumn = '1 / -1';
        empty.style.textAlign = 'center';
        empty.style.padding = '2rem';
        empty.style.color = '#9ca3af';
        empty.textContent = '폴더가 비어있습니다.';
        contents.appendChild(empty);
      }
    }).catch(function(err) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = '로드 실패: ' + (err.message || '폴더에 접근할 수 없습니다.');
    });
  }

  function encodeParams(obj) {
    var parts = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
      }
    }
    return parts.join('&');
  }

  // 사진 추가
  function addPhoto(fileIdOrUrl) {
    var fileId = extractDriveFileId(fileIdOrUrl) || fileIdOrUrl;
    var url = toThumbnailUrl(fileId);
    // 중복 확인
    for (var i = 0; i < selectedPhotos.length; i++) {
      if (selectedPhotos[i] === url) {
        showToast('이미 추가된 사진입니다.', 'error');
        return;
      }
    }
    if (selectedPhotos.length >= 10) {
      showToast('사진은 최대 10장까지 추가할 수 있습니다.', 'error');
      return;
    }
    selectedPhotos.push(url);
    renderPhotoPreview();
    showToast('사진이 추가되었습니다.', 'success');
  }

  // 사진 미리보기 렌더링
  function renderPhotoPreview() {
    var area = document.getElementById('photoPreviewArea');
    area.textContent = '';
    for (var i = 0; i < selectedPhotos.length; i++) {
      (function(index) {
        var item = document.createElement('div');
        item.className = 'photo-preview-item';
        var img = document.createElement('img');
        img.src = selectedPhotos[index];
        img.alt = '활동 사진 ' + (index + 1);
        item.appendChild(img);
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', function() {
          selectedPhotos.splice(index, 1);
          renderPhotoPreview();
        });
        item.appendChild(removeBtn);
        area.appendChild(item);
      })(i);
    }
  }

  // 탭 전환
  var tabDrive = document.getElementById('tabDrive');
  var tabLink = document.getElementById('tabLink');
  var drivePanel = document.getElementById('drivePanel');
  var linkPanel = document.getElementById('linkPanel');
  var addUrlBtn = document.getElementById('addUrlBtn');
  var openDriveBtn = document.getElementById('openDriveBtn');

  if (tabDrive) {
    // 드라이브 탭 초기 로드
    driveFolderStack = [];
    loadDriveFolder(DRIVE_ROOT_FOLDER, 'G-DEAL 나눔활동');

    tabDrive.addEventListener('click', function() {
      tabDrive.classList.add('active');
      tabLink.classList.remove('active');
      drivePanel.style.display = 'block';
      linkPanel.style.display = 'none';
    });

    tabLink.addEventListener('click', function() {
      tabLink.classList.add('active');
      tabDrive.classList.remove('active');
      linkPanel.style.display = 'block';
      drivePanel.style.display = 'none';
    });
  }

  if (openDriveBtn) {
    openDriveBtn.addEventListener('click', function() {
      var currentFolder = driveFolderStack.length > 0 ? driveFolderStack[driveFolderStack.length - 1].id : DRIVE_ROOT_FOLDER;
      window.open('https://drive.google.com/drive/folders/' + currentFolder, '_blank');
    });
  }

  if (addUrlBtn) {
    addUrlBtn.addEventListener('click', function() {
      var input = document.getElementById('photoUrlInput');
      var url = input.value.trim();
      if (!url) return;
      if (url.includes('drive.google.com')) {
        addPhoto(url);
        input.value = '';
      } else {
        showToast('구글 드라이브 URL을 입력해주세요.', 'error');
      }
    });
  }

})();
