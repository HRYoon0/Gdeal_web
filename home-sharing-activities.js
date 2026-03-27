/**
 * 홈 페이지 - 최신 나눔활동 피드형 (자동 슬라이드 애니메이션)
 */
(function() {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyBJsqUJK1AjhrLNzIY_79dIR2Mlg7zD09w",
    authDomain: "gdeal-page-a67e2.firebaseapp.com",
    projectId: "gdeal-page-a67e2"
  };

  var CATEGORIES = {
    '찾아가는 카페연수':      { bg: '#dbeafe', color: '#1e40af', bar: '#3b82f6' },
    '디지털 수업실천 웨비나': { bg: '#dbeafe', color: '#1e40af', bar: '#3b82f6' },
    '디지털 별뉘':           { bg: '#dbeafe', color: '#1e40af', bar: '#3b82f6' },
    '교육독서모임':          { bg: '#ede9fe', color: '#5b21b6', bar: '#8b5cf6' },
    '미니스터디':            { bg: '#ede9fe', color: '#5b21b6', bar: '#8b5cf6' }
  };

  function getCat(cat) { return CATEGORIES[cat] || { bg: '#f3f4f6', color: '#374151', bar: '#66ae7d', icon: '📋' }; }
  function truncate(t, m) { return (!t || t.length <= m) ? (t||'') : t.substring(0,m)+'...'; }

  // CSS 주입
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes feedSlideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }',
    '@keyframes feedFadeIn { from { opacity:0; } to { opacity:1; } }',
    '@keyframes feedPulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }',
    '.feed-slide-container { position:relative; overflow:hidden; }',
    '.feed-card-slide { position:absolute; top:0; left:0; right:0; opacity:0; transform:translateY(20px); transition:all 0.6s cubic-bezier(0.4,0,0.2,1); pointer-events:none; }',
    '.feed-card-slide.active { opacity:1; transform:translateY(0); pointer-events:auto; z-index:2; }',
    '.feed-card-slide.exit-up { opacity:0; transform:translateY(-30px); }',
    '.feed-card-inner { display:flex; border-radius:0.75rem; background:white; text-decoration:none; overflow:hidden; border:1px solid #e5e7eb; transition:all 0.3s ease; cursor:pointer; }',
    '.feed-card-inner:hover { transform:translateY(-3px); box-shadow:0 8px 25px rgba(0,0,0,0.1); border-color:#66ae7d; }',
    '.feed-dots { display:flex; justify-content:center; gap:0.4rem; padding:0.75rem 0; }',
    '.feed-dot { width:8px; height:8px; border-radius:50%; background:#d1d5db; transition:all 0.3s; cursor:pointer; border:none; padding:0; }',
    '.feed-dot.active { background:#66ae7d; width:24px; border-radius:4px; }',
    '.feed-nav-btn { position:absolute; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.7); backdrop-filter:blur(4px); border:1px solid rgba(0,0,0,0.08); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:0.9rem; color:#66ae7d; transition:all 0.2s; z-index:5; opacity:0.6; }',
    '.feed-nav-btn:hover { opacity:1; background:rgba(255,255,255,0.95); color:#497e56; box-shadow:0 2px 8px rgba(0,0,0,0.1); }',
    '.feed-counter { font-size:0.75rem; color:#9ca3af; text-align:center; margin-top:0.25rem; }'
  ].join('\n');
  document.head.appendChild(style);

  function init() {
    if (document.getElementById('sharing-cards-container')) return;

    var headings = document.querySelectorAll('h2');
    var parentRelative = null;
    for (var i = 0; i < headings.length; i++) {
      var t = headings[i].textContent.trim();
      if (t === '최신 소식' || t === '최신 나눔활동') {
        headings[i].textContent = '최신 나눔활동';
        parentRelative = headings[i].closest('.relative');
        var link = parentRelative ? parentRelative.querySelector('a[href*="/training"]') : null;
        if (link) link.href = '/sharing/';
        break;
      }
    }
    if (!parentRelative) return;

    var container = document.createElement('div');
    container.id = 'sharing-cards-container';
    container.style.cssText = 'display:grid;grid-template-columns:55% 1fr 1fr;gap:0.75rem;min-height:200px;padding:0.5rem 0;width:100%;';

    var loadingDiv = document.createElement('div');
    loadingDiv.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem;color:#9ca3af;gap:0.75rem;width:100%;';
    var spinner = document.createElement('div');
    spinner.style.cssText = 'width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#66ae7d;border-radius:50%;animation:feedPulse 1.5s ease-in-out infinite;';
    loadingDiv.appendChild(spinner);
    var loadText = document.createElement('span');
    loadText.textContent = '나눔활동을 불러오는 중...';
    loadText.style.fontSize = '0.85rem';
    loadingDiv.appendChild(loadText);
    container.appendChild(loadingDiv);

    // col-span-1을 전체 너비로 확장
    var colSpan = parentRelative.closest('.col-span-1') || parentRelative.parentElement;
    if (colSpan) colSpan.style.gridColumn = '1 / -1';

    // 컨테이너를 col-span-1의 직접 자식으로 삽입 (relative 바깥)
    if (colSpan && colSpan !== parentRelative) {
      colSpan.appendChild(container);
    } else {
      parentRelative.appendChild(container);
    }
    loadFirebaseAndFetch(container);
  }

  function loadFirebaseAndFetch(container) {
    if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') { fetchActivities(container); return; }
    var scripts = [];
    if (typeof firebase === 'undefined') {
      scripts.push('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
      scripts.push('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js');
    } else if (typeof firebase.firestore !== 'function') {
      scripts.push('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js');
    }
    var loaded = 0;
    function onLoad() { loaded++; if (loaded >= scripts.length) { try{firebase.app();}catch(e){firebase.initializeApp(firebaseConfig);} fetchActivities(container); } }
    for (var i = 0; i < scripts.length; i++) { var s = document.createElement('script'); s.src = scripts[i]; s.onload = onLoad; document.head.appendChild(s); }
  }

  function fetchActivities(container) {
    try{firebase.app();}catch(e){firebase.initializeApp(firebaseConfig);}
    var db = firebase.firestore();

    db.collection('sharingActivities').orderBy('createdAt','desc').limit(20).get()
      .then(function(snapshot) {
        container.textContent = '';
        var today = new Date().toISOString().split('T')[0];
        var allActivities = [];
        var activeCards = [];
        var upcomingList = [];
        var categoryCount = {};
        var totalApplicants = 0;

        snapshot.forEach(function(doc) {
          var d = doc.data();
          d._id = doc.id;
          var st = d.status || '활동중';
          allActivities.push(d);

          // 카테고리 통계
          if (d.category) {
            categoryCount[d.category] = (categoryCount[d.category] || 0) + 1;
          }
          totalApplicants += (parseInt(d.appliedCount) || 0);

          // 활동중 + 날짜 안 지난 것
          if (st === '활동중' && (!d.activityDate || d.activityDate >= today)) {
            if (activeCards.length < 5) activeCards.push(d);
            // 다가오는 일정 (날짜 있는 것만)
            if (d.activityDate && upcomingList.length < 3) {
              upcomingList.push(d);
            }
          }
        });

        // 다가오는 일정을 날짜순 정렬
        upcomingList.sort(function(a, b) { return (a.activityDate || '').localeCompare(b.activityDate || ''); });

        // 1열: 피드 슬라이더
        var sliderCol = document.createElement('div');
        sliderCol.style.cssText = 'min-width:0;overflow:hidden;';

        if (activeCards.length === 0) {
          var empty = document.createElement('div');
          empty.style.cssText = 'padding:3rem;text-align:center;color:#9ca3af;font-size:0.9rem;background:#f9fafb;border-radius:0.75rem;height:100%;display:flex;align-items:center;justify-content:center;';
          empty.textContent = '등록된 나눔활동이 없습니다.';
          sliderCol.appendChild(empty);
        } else if (activeCards.length === 1) {
          var singleCard = createFeedCard(activeCards[0]);
          singleCard.style.cssText += 'animation:feedSlideUp 0.5s ease-out forwards;';
          sliderCol.appendChild(singleCard);
        } else {
          buildSlider(sliderCol, activeCards);
        }
        container.appendChild(sliderCol);

        // 2열: 활동 현황, 3열: 다가오는 일정
        var oldPanel = document.getElementById('sharing-summary-panel');
        if (oldPanel) oldPanel.remove();
        var panels = buildSummaryCards(allActivities, upcomingList, categoryCount, totalApplicants);
        container.appendChild(panels.stats);
        container.appendChild(panels.schedule);
      })
      .catch(function(err) {
        console.error('나눔활동 로드 실패:', err);
        container.textContent = '';
        var errDiv = document.createElement('div');
        errDiv.style.cssText = 'padding:2rem;text-align:center;color:#9ca3af;';
        errDiv.textContent = '나눔활동을 불러올 수 없습니다.';
        container.appendChild(errDiv);
      });
  }

  // 요약 카드 2개 생성
  function buildSummaryCards(all, upcoming, catCount, totalApplicants) {
    var activeCount = 0, endedCount = 0;
    for (var i = 0; i < all.length; i++) {
      var st = all[i].status || '활동중';
      if (st === '활동중') activeCount++; else endedCount++;
    }

    var statsCard = document.createElement('div');
    statsCard.style.cssText = 'background:linear-gradient(135deg,#f0faf3,#e8f5e9);border:1px solid #c8e6c9;border-radius:0.75rem;padding:1rem;animation:feedSlideUp 0.5s ease-out 0.2s forwards;opacity:0;';

    var statsTitle = document.createElement('div');
    statsTitle.style.cssText = 'font-size:0.75rem;font-weight:600;color:#66ae7d;margin-bottom:0.75rem;letter-spacing:0.05em;';
    statsTitle.textContent = '활동 현황';
    statsCard.appendChild(statsTitle);

    var statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;';

    var statItems = [
      { label: '전체', value: all.length, color: '#374151' },
      { label: '활동중', value: activeCount, color: '#22c55e' },
      { label: '총 신청', value: totalApplicants, color: '#3b82f6' },
      { label: '종료', value: endedCount, color: '#9ca3af' }
    ];

    for (var si = 0; si < statItems.length; si++) {
      var statItem = document.createElement('div');
      statItem.style.cssText = 'text-align:center;';
      var statValue = document.createElement('div');
      statValue.style.cssText = 'font-size:1.25rem;font-weight:700;color:' + statItems[si].color + ';';
      statValue.textContent = statItems[si].value;
      statItem.appendChild(statValue);
      var statLabel = document.createElement('div');
      statLabel.style.cssText = 'font-size:0.65rem;color:#6b7280;';
      statLabel.textContent = statItems[si].label;
      statItem.appendChild(statLabel);
      statsGrid.appendChild(statItem);
    }
    statsCard.appendChild(statsGrid);

    // 다가오는 일정 카드
    var scheduleCard = document.createElement('div');
    scheduleCard.style.cssText = 'background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1px solid #bfdbfe;border-radius:0.75rem;padding:1rem;animation:feedSlideUp 0.5s ease-out 0.35s forwards;opacity:0;';

    var schedTitle = document.createElement('div');
    schedTitle.style.cssText = 'font-size:0.75rem;font-weight:600;color:#3b82f6;margin-bottom:0.75rem;letter-spacing:0.05em;';
    schedTitle.textContent = '다가오는 일정';
    scheduleCard.appendChild(schedTitle);

    if (upcoming.length === 0) {
      var noSched = document.createElement('div');
      noSched.style.cssText = 'font-size:0.8rem;color:#9ca3af;text-align:center;padding:1rem 0;';
      noSched.textContent = '예정된 일정이 없습니다';
      scheduleCard.appendChild(noSched);
    } else {
      for (var ui = 0; ui < upcoming.length; ui++) {
        var item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;' + (ui > 0 ? 'border-top:1px solid rgba(59,130,246,0.15);' : '');

        var dateBox = document.createElement('div');
        dateBox.style.cssText = 'background:white;border-radius:0.375rem;padding:0.2rem 0.4rem;text-align:center;min-width:50px;border:1px solid #bfdbfe;';
        var dateMonth = document.createElement('div');
        dateMonth.style.cssText = 'font-size:0.55rem;color:#3b82f6;font-weight:600;';
        var dateParts = (upcoming[ui].activityDate || '').split('-');
        dateMonth.textContent = dateParts[1] ? dateParts[1] + '월' : '';
        dateBox.appendChild(dateMonth);
        var dateDay = document.createElement('div');
        dateDay.style.cssText = 'font-size:0.9rem;font-weight:700;color:#1e40af;line-height:1;';
        dateDay.textContent = dateParts[2] || '';
        dateBox.appendChild(dateDay);
        item.appendChild(dateBox);

        var itemInfo = document.createElement('div');
        itemInfo.style.cssText = 'flex:1;overflow:hidden;';
        var itemName = document.createElement('div');
        itemName.style.cssText = 'font-size:0.75rem;font-weight:600;color:#1f2937;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        itemName.textContent = upcoming[ui].name || '';
        itemInfo.appendChild(itemName);
        if (upcoming[ui].activityTime) {
          var itemTime = document.createElement('div');
          itemTime.style.cssText = 'font-size:0.65rem;color:#6b7280;';
          itemTime.textContent = upcoming[ui].activityTime;
          itemInfo.appendChild(itemTime);
        }
        item.appendChild(itemInfo);
        scheduleCard.appendChild(item);
      }
    }
    return { stats: statsCard, schedule: scheduleCard };
  }

  function buildSlider(container, cards) {
    var currentIndex = 0;
    var autoTimer = null;

    // 슬라이드 영역
    var slideArea = document.createElement('div');
    slideArea.className = 'feed-slide-container';
    slideArea.style.cssText = 'position:relative;';

    var slideElements = [];
    var maxHeight = 0;

    for (var i = 0; i < cards.length; i++) {
      var slide = document.createElement('div');
      slide.className = 'feed-card-slide' + (i === 0 ? ' active' : '');
      var inner = createFeedCard(cards[i]);
      slide.appendChild(inner);
      slideArea.appendChild(slide);
      slideElements.push(slide);
    }

    // 좌우 네비게이션
    var prevBtn = document.createElement('button');
    prevBtn.className = 'feed-nav-btn';
    prevBtn.style.left = '4px';
    prevBtn.textContent = '‹';
    prevBtn.addEventListener('click', function() { goTo((currentIndex - 1 + cards.length) % cards.length); resetAuto(); });

    var nextBtn = document.createElement('button');
    nextBtn.className = 'feed-nav-btn';
    nextBtn.style.right = '4px';
    nextBtn.textContent = '›';
    nextBtn.addEventListener('click', function() { goTo((currentIndex + 1) % cards.length); resetAuto(); });

    slideArea.appendChild(prevBtn);
    slideArea.appendChild(nextBtn);
    container.appendChild(slideArea);

    // 인디케이터 도트
    var dotsArea = document.createElement('div');
    dotsArea.className = 'feed-dots';
    var dotElements = [];
    for (var di = 0; di < cards.length; di++) {
      (function(idx) {
        var dot = document.createElement('button');
        dot.className = 'feed-dot' + (idx === 0 ? ' active' : '');
        dot.addEventListener('click', function() { goTo(idx); resetAuto(); });
        dotsArea.appendChild(dot);
        dotElements.push(dot);
      })(di);
    }
    container.appendChild(dotsArea);

    // 카운터
    var counter = document.createElement('div');
    counter.className = 'feed-counter';
    counter.textContent = '1 / ' + cards.length;
    container.appendChild(counter);

    // 높이 계산 (첫 렌더 후)
    setTimeout(function() {
      for (var hi = 0; hi < slideElements.length; hi++) {
        slideElements[hi].style.position = 'relative';
        slideElements[hi].style.visibility = 'hidden';
        slideElements[hi].style.display = 'block';
        var h = slideElements[hi].offsetHeight;
        if (h > maxHeight) maxHeight = h;
        slideElements[hi].style.position = '';
        slideElements[hi].style.visibility = '';
        slideElements[hi].style.display = '';
      }
      if (maxHeight > 0) slideArea.style.height = maxHeight + 'px';
      // 첫 슬라이드 활성화
      slideElements[0].classList.add('active');
    }, 100);

    function goTo(idx) {
      if (idx === currentIndex) return;
      var prev = slideElements[currentIndex];
      var next = slideElements[idx];

      prev.classList.remove('active');
      prev.classList.add('exit-up');
      setTimeout(function() { prev.classList.remove('exit-up'); }, 600);

      next.classList.add('active');

      dotElements[currentIndex].classList.remove('active');
      dotElements[idx].classList.add('active');

      currentIndex = idx;
      counter.textContent = (idx + 1) + ' / ' + cards.length;
    }

    function resetAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(function() {
        goTo((currentIndex + 1) % cards.length);
      }, 4000);
    }

    // 자동 슬라이드 시작 (4초)
    autoTimer = setInterval(function() {
      goTo((currentIndex + 1) % cards.length);
    }, 4000);

    // 마우스 올리면 자동 슬라이드 정지
    slideArea.addEventListener('mouseenter', function() { clearInterval(autoTimer); });
    slideArea.addEventListener('mouseleave', function() { resetAuto(); });

    // 터치 스와이프
    var touchStartX = 0;
    slideArea.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; clearInterval(autoTimer); }, { passive: true });
    slideArea.addEventListener('touchend', function(e) {
      var diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 50) {
        if (diff < 0) goTo((currentIndex + 1) % cards.length);
        else goTo((currentIndex - 1 + cards.length) % cards.length);
      }
      resetAuto();
    }, { passive: true });
  }

  function createFeedCard(data) {
    var cat = getCat(data.category);

    var card = document.createElement('a');
    card.href = '/sharing/';
    card.className = 'feed-card-inner';

    // 왼쪽 컬러 사이드바
    var sidebar = document.createElement('div');
    sidebar.style.cssText = 'width:5px;flex-shrink:0;background:' + cat.bar + ';';
    card.appendChild(sidebar);

    // 메인
    var main = document.createElement('div');
    main.style.cssText = 'flex:1;padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.5rem;';

    // 상단
    var topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;';

    var catBadge = document.createElement('span');
    catBadge.style.cssText = 'display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.7rem;font-weight:600;background:' + cat.bg + ';color:' + cat.color + ';';
    catBadge.textContent = data.category || '-';
    topRow.appendChild(catBadge);

    var statusBadge = document.createElement('span');
    statusBadge.style.cssText = 'display:inline-flex;align-items:center;gap:0.25rem;padding:0.15rem 0.5rem;border-radius:9999px;font-size:0.65rem;font-weight:600;background:#dcfce7;color:#166534;border:1px solid #bbf7d0;';
    var dot = document.createElement('span');
    dot.style.cssText = 'display:inline-block;width:5px;height:5px;border-radius:50%;background:#22c55e;';
    statusBadge.appendChild(dot);
    statusBadge.appendChild(document.createTextNode(' 활동중'));
    topRow.appendChild(statusBadge);

    if (data.activityDate) {
      var dateChip = document.createElement('span');
      dateChip.style.cssText = 'margin-left:auto;display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;color:#6b7280;background:#f3f4f6;padding:0.15rem 0.5rem;border-radius:0.25rem;';
      dateChip.textContent = data.activityDate + (data.activityTime ? ' ' + data.activityTime : '');
      topRow.appendChild(dateChip);
    }
    main.appendChild(topRow);

    // 활동명
    var title = document.createElement('div');
    title.style.cssText = 'font-size:1.05rem;font-weight:700;color:#1f2937;letter-spacing:-0.01em;';
    title.textContent = data.name || '';
    main.appendChild(title);

    // 활동 내용
    if (data.description) {
      var desc = document.createElement('div');
      desc.style.cssText = 'font-size:0.8rem;color:#6b7280;line-height:1.6;white-space:pre-wrap;word-break:break-word;';
      desc.textContent = truncate(data.description, 100);
      main.appendChild(desc);
    }

    // 하단
    var bottomRow = document.createElement('div');
    bottomRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;font-size:0.75rem;color:#9ca3af;margin-top:0.25rem;flex-wrap:wrap;';

    if (data.creator) {
      var creator = document.createElement('span');
      creator.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;';
      var creatorLabel = document.createElement('span');
      creatorLabel.style.cssText = 'color:#66ae7d;font-weight:600;font-size:0.7rem;';
      creatorLabel.textContent = '개설';
      creator.appendChild(creatorLabel);
      creator.appendChild(document.createTextNode(data.creator));
      bottomRow.appendChild(creator);
    }
    var cap = parseInt(data.capacity) || 0;
    var appCount = parseInt(data.appliedCount) || 0;
    if (cap > 0) {
      var capChip = document.createElement('span');
      capChip.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;';
      var capLabel = document.createElement('span');
      capLabel.style.cssText = 'color:#66ae7d;font-weight:600;font-size:0.7rem;';
      capLabel.textContent = '정원';
      capChip.appendChild(capLabel);
      var capValue = document.createTextNode(appCount + '/' + cap);
      if (appCount >= cap) { capChip.style.color = '#ef4444'; }
      capChip.appendChild(capValue);
      bottomRow.appendChild(capChip);
    }
    if (data.location) {
      var locChip = document.createElement('span');
      locChip.style.cssText = 'display:inline-flex;align-items:center;gap:0.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;';
      var locLabel = document.createElement('span');
      locLabel.style.cssText = 'color:#66ae7d;font-weight:600;font-size:0.7rem;flex-shrink:0;';
      locLabel.textContent = '장소';
      locChip.appendChild(locLabel);
      locChip.appendChild(document.createTextNode(truncate(data.location, 20)));
      bottomRow.appendChild(locChip);
    }
    main.appendChild(bottomRow);
    card.appendChild(main);
    return card;
  }

  // 실행
  var retryCount = 0;
  function tryInit() {
    if (document.getElementById('sharing-cards-container')) return;
    init();
    if (!document.getElementById('sharing-cards-container') && retryCount < 20) { retryCount++; setTimeout(tryInit, 400); }
  }

  var textObserver = new MutationObserver(function() {
    var headings = document.querySelectorAll('h2');
    for (var i = 0; i < headings.length; i++) { if (headings[i].textContent.trim() === '최신 소식') headings[i].textContent = '최신 나눔활동'; }
    var links = document.querySelectorAll('a[href="/training/"]');
    for (var j = 0; j < links.length; j++) { if (links[j].textContent.indexOf('더보기') >= 0) links[j].href = '/sharing/'; }
  });

  if (document.readyState === 'complete') {
    setTimeout(tryInit, 500);
    textObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('load', function() {
      setTimeout(tryInit, 500);
      textObserver.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
