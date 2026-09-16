/**
 * G-DEAL Cloud Functions
 * 자료 등록 시 FCM 푸시 알림 발송 + 성장패스 개인 알림(참여 인증 시작·기록 승인·실천 기록 권유)
 * (나눔회원 활동 관리는 Google Apps Script로 이관됨)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// 알림 타입별 설정
const notificationConfig = {
  events: {
    title: '새 대외행사가 등록되었습니다',
    icon: '/icon-192.png',
    tag: 'events',
    url: '/events/'
  },
  trainings: {
    title: '새 월별연수가 등록되었습니다',
    icon: '/icon-192.png',
    tag: 'training',
    url: '/training/'
  },
  resources: {
    title: '새 자료가 공유되었습니다',
    icon: '/icon-192.png',
    tag: 'resources',
    url: '/resources/'
  },
  diary: {
    title: '새 교단일기가 등록되었습니다',
    icon: '/icon-192.png',
    tag: 'diary',
    url: '/diary/'
  },
  sharing: {
    title: '새 나눔활동이 개설되었습니다',
    icon: '/icon-192.png',
    tag: 'sharing',
    url: '/sharing/'
  }
};

/**
 * 활성 FCM 토큰 목록 가져오기
 * @param {string} subscriptionType - 구독 타입 (events, training, resources, diary)
 */
async function getActiveTokens(subscriptionType) {
  try {
    const tokensSnapshot = await db.collection('fcm_tokens')
      .where('isActive', '==', true)
      .where(`subscriptions.${subscriptionType}`, '==', true)
      .get();

    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });

    return tokens;
  } catch (error) {
    console.error('토큰 조회 실패:', error);
    return [];
  }
}

/**
 * 푸시 알림 발송
 * @param {string[]} tokens - FCM 토큰 배열
 * @param {object} notification - 알림 내용
 * @param {object} data - 추가 데이터
 */
async function sendPushNotification(tokens, notification, data) {
  if (tokens.length === 0) {
    console.log('발송할 토큰이 없습니다.');
    return;
  }

  // data-only 메시지: Service Worker의 onBackgroundMessage에서 단독으로 표시
  // notification 필드를 보내면 FCM이 자동 표시 + SW 수동 표시로 중복 알림이 발생함
  const message = {
    data: {
      ...data,
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      tag: notification.tag,
      url: notification.url,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    tokens: tokens
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`알림 발송 완료: 성공 ${response.successCount}, 실패 ${response.failureCount}`);

    // 실패한 토큰 처리 (토큰이 만료되거나 유효하지 않은 경우)
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          // 토큰이 만료되거나 유효하지 않은 경우
          if (errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered') {
            failedTokens.push(tokens[idx]);
          }
          console.error(`토큰 ${idx} 실패:`, resp.error);
        }
      });

      // 유효하지 않은 토큰 비활성화
      for (const token of failedTokens) {
        await db.collection('fcm_tokens').doc(token).update({
          isActive: false,
          deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`토큰 비활성화: ${token.substring(0, 20)}...`);
      }
    }

    return response;
  } catch (error) {
    console.error('알림 발송 실패:', error);
    throw error;
  }
}

// 대외행사 등록 시 알림
exports.onEventCreated = functions.firestore
  .document('events/{eventId}')
  .onCreate(async (snap, context) => {
    const eventData = snap.data();
    const config = notificationConfig.events;

    const tokens = await getActiveTokens('events');
    console.log(`대외행사 알림 발송 대상: ${tokens.length}명`);

    await sendPushNotification(tokens, {
      title: config.title,
      body: eventData.title || '새로운 대외행사를 확인해보세요.',
      icon: config.icon,
      tag: config.tag,
      url: config.url
    }, {
      type: 'events',
      eventId: context.params.eventId,
      url: config.url
    });
  });

// 월별연수 등록 시 알림
exports.onTrainingCreated = functions.firestore
  .document('trainings/{trainingId}')
  .onCreate(async (snap, context) => {
    const trainingData = snap.data();
    const config = notificationConfig.trainings;

    const tokens = await getActiveTokens('training');
    console.log(`월별연수 알림 발송 대상: ${tokens.length}명`);

    await sendPushNotification(tokens, {
      title: config.title,
      body: trainingData.title || '새로운 연수 정보를 확인해보세요.',
      icon: config.icon,
      tag: config.tag,
      url: config.url
    }, {
      type: 'training',
      trainingId: context.params.trainingId,
      url: config.url
    });
  });

// 자료공유 등록 시 알림
exports.onResourceCreated = functions.firestore
  .document('resources/{resourceId}')
  .onCreate(async (snap, context) => {
    const resourceData = snap.data();
    const config = notificationConfig.resources;

    const tokens = await getActiveTokens('resources');
    console.log(`자료공유 알림 발송 대상: ${tokens.length}명`);

    await sendPushNotification(tokens, {
      title: config.title,
      body: resourceData.title || '새로운 자료를 확인해보세요.',
      icon: config.icon,
      tag: config.tag,
      url: config.url
    }, {
      type: 'resources',
      resourceId: context.params.resourceId,
      url: config.url
    });
  });

// 교단일기 등록 시 알림
exports.onDiaryCreated = functions.firestore
  .document('diaries/{diaryId}')
  .onCreate(async (snap, context) => {
    const diaryData = snap.data();
    const config = notificationConfig.diary;

    const tokens = await getActiveTokens('diary');
    console.log(`교단일기 알림 발송 대상: ${tokens.length}명`);

    await sendPushNotification(tokens, {
      title: config.title,
      body: diaryData.content ? diaryData.content.substring(0, 50) + '...' : '새로운 교단일기를 확인해보세요.',
      icon: config.icon,
      tag: config.tag,
      url: config.url
    }, {
      type: 'diary',
      diaryId: context.params.diaryId,
      url: config.url
    });
  });

// ===== 나눔활동 신청 대상 등급 (웹 sharing.js·firestore.rules와 같은 서열) =====
const TIER_RANK = { '': 0, 'learning-member': 1, 'sharing-member': 2, 'operations-office': 3 };

function tierRankOf(user) {
  return user.role === 'superAdmin' ? 3 : (TIER_RANK[user.memberTier] || 0);
}

// minTier 이상 자격을 가진 승인 회원의 uid 목록
// ponytail: users 컬렉션 전체를 읽는다(회원 수백 명 규모, buildLeaderboard와 같은 방식).
//           수만 명이 되면 등급별 색인 쿼리로 바꿀 것.
async function uidsMeetingTier(minTier) {
  const need = TIER_RANK[minTier] || 0;
  const snap = await db.collection('users').get();
  return snap.docs
    .filter(d => {
      const x = d.data();
      if (x.status && x.status !== 'approved') return false;
      return tierRankOf(x) >= need;
    })
    .map(d => d.data().uid || d.id);
}

// 나눔활동 개설 시 알림
//   대상(minTier)이 지정된 활동은 그 등급 회원에게만 보낸다 — 안 그러면 목록에서 안 보이는 활동의
//   알림만 받고 눌러 들어와도 찾을 수 없는 상태가 된다.
exports.onSharingActivityCreated = functions.firestore
  .document('sharingActivities/{activityId}')
  .onCreate(async (snap, context) => {
    const activityData = snap.data();
    const config = notificationConfig.sharing;
    const categoryText = activityData.category ? `[${activityData.category}] ` : '';

    const minTier = activityData.minTier || '';
    let tokens;
    if (minTier) {
      const uids = await uidsMeetingTier(minTier);
      tokens = await getUserTokens(uids, 'sharing');
      console.log(`나눔활동 알림(대상 ${minTier}): 자격 회원 ${uids.length}명, 기기 ${tokens.length}대`);
    } else {
      tokens = await getActiveTokens('sharing');
    }
    console.log(`나눔활동 알림 발송 대상: ${tokens.length}명`);

    await sendPushNotification(tokens, {
      title: config.title,
      body: categoryText + (activityData.name || '새로운 나눔활동을 확인해보세요.'),
      icon: config.icon,
      tag: config.tag,
      url: config.url
    }, {
      type: 'sharing',
      activityId: context.params.activityId,
      url: config.url
    });
  });

// ===== 성장패스 알림: 전체 구독자가 아니라 해당 회원에게만 보낸다 =====

const ATTEND_TYPES = ['webinar_attend', 'sharing_attend'];

// 회원 uid 목록 → 알림을 켠 기기 토큰 (해당 구독을 끈 기기 제외, 항목이 없던 옛 토큰은 켜진 것으로 본다)
//   subType 기본값은 'growth'(성장패스 개인 알림). 대상 지정 나눔활동은 'sharing'으로 부른다 —
//   구독 항목을 안 맞추면 "나눔활동 알림은 켜고 성장패스는 끈" 회원이 통째로 누락된다.
async function getUserTokens(uids, subType) {
  const key = subType || 'growth';
  const list = [...new Set((uids || []).filter(Boolean))];
  const tokens = [];
  for (let i = 0; i < list.length; i += 10) {
    const snap = await db.collection('fcm_tokens').where('uid', 'in', list.slice(i, i + 10)).get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.token && d.isActive !== false && !(d.subscriptions && d.subscriptions[key] === false)) tokens.push(d.token);
    });
  }
  return tokens;
}

function seoulToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
}

// 나눔활동 참여 인증이 열리면(처음 발급 또는 다시 열기) 그 활동 신청자에게 알림 — 활동 당일만
exports.onCheckinOpened = functions.firestore
  .document('webinarSecrets/{targetId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after || after.open !== true || (before && before.open === true)) return;

    const id = context.params.targetId;
    const act = await db.collection('sharingActivities').doc(id).get();
    if (!act.exists) return; // 운영진 등록 웨비나는 신청자 명단이 없다
    const a = act.data();
    if (a.activityDate && a.activityDate !== seoulToday()) {
      console.log(`참여 인증 알림 건너뜀: 활동일 ${a.activityDate} (오늘 아님)`);
      return;
    }

    const apps = await db.collection('sharingApplications').where('activityId', '==', id).get();
    const uids = apps.docs.map(d => d.data().applicantUid).filter(u => u && u !== a.creatorUid);
    const tokens = await getUserTokens(uids);
    console.log(`참여 인증 시작 알림: 신청자 ${uids.length}명, 기기 ${tokens.length}대`);

    const url = '/growth/?w=' + encodeURIComponent(id);
    await sendPushNotification(tokens, {
      title: '지금 참여 인증을 받고 있어요',
      body: `[${a.category || '나눔활동'}] ${a.name || ''} — 안내된 QR이나 코드로 인증하면 참여 스탬프가 찍혀요.`,
      icon: '/icon-192.png',
      tag: 'growth-checkin-' + id,
      url: url
    }, { type: 'growth', targetId: id, url: url });
  });

// 운영진이 발표·소모임 프로젝트 기록을 승인/반려하면 기록한 회원에게 알림
exports.onActivityLogReviewed = functions.firestore
  .document('activityLog/{logId}')
  .onUpdate(async (change) => {
    const b = change.before.data();
    const a = change.after.data();
    if (b.status !== 'pending' || a.status === 'pending') return;

    const ok = a.status !== 'rejected';
    const tokens = await getUserTokens([a.uid]);
    console.log(`기록 ${ok ? '승인' : '반려'} 알림: 기기 ${tokens.length}대`);
    await sendPushNotification(tokens, {
      title: ok ? '성장패스 기록이 승인됐어요' : '성장패스 기록이 반려됐어요',
      body: (a.targetTitle || '기록') + (ok ? ' — 스탬프와 배지에 반영됐어요.' : ' — ' + (a.adminNote || '운영진 메모를 확인해주세요.')),
      icon: '/icon-192.png',
      tag: 'growth-review-' + change.after.id,
      url: '/growth/'
    }, { type: 'growth', url: '/growth/' });
  });

// 매일 18시: 사흘 전 참여 인증을 하고 아직 실천 기록이 없는 회원에게 실천 기록 권유
exports.practiceReminder = functions.pubsub
  .schedule('0 18 * * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const day = 86400000;
    const now = Date.now();
    // 단일 필드 범위 조회만 쓰고 유형은 코드에서 거른다(복합 색인 불필요)
    const snap = await db.collection('activityLog')
      .where('occurredAt', '>=', new Date(now - 4 * day))
      .where('occurredAt', '<', new Date(now - 3 * day))
      .get();
    const byUid = {};
    snap.docs.map(d => d.data())
      .filter(d => ATTEND_TYPES.includes(d.type) && d.status !== 'rejected' && d.uid && d.targetId)
      .forEach(d => { (byUid[d.uid] = byUid[d.uid] || []).push(d); });

    let sent = 0;
    for (const uid of Object.keys(byUid)) {
      const practice = await db.collection('activityLog').where('uid', '==', uid).where('type', '==', 'practice').get();
      const done = new Set(practice.docs.map(d => d.data().targetId));
      const todo = byUid[uid].filter(a => !done.has(a.targetId));
      if (!todo.length) continue;
      const tokens = await getUserTokens([uid]);
      if (!tokens.length) continue;
      await sendPushNotification(tokens, {
        title: '배운 내용을 적용해 보셨나요?',
        body: `「${todo[0].targetTitle || '나눔활동'}」 참여 사흘째예요. 수업에 써 본 결과를 실천 기록으로 남겨 보세요.`,
        icon: '/icon-192.png',
        tag: 'growth-practice',
        url: '/growth/'
      }, { type: 'growth', url: '/growth/' });
      sent++;
    }
    console.log(`실천 기록 권유: 대상 회원 ${Object.keys(byUid).length}명, 발송 ${sent}명`);
  });

// 일회성 마이그레이션: 기존 FCM 토큰에 sharing 구독 추가
// 호출 방법: https://us-central1-gdeal-page-a67e2.cloudfunctions.net/migrateAddSharingSubscription
exports.migrateAddSharingSubscription = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const snapshot = await db.collection('fcm_tokens').get();
    let updated = 0;
    let skipped = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // 이미 sharing 필드가 있으면 스킵
      if (data.subscriptions && data.subscriptions.sharing !== undefined) {
        skipped++;
        continue;
      }

      // subscriptions.sharing = true 추가
      batch.update(doc.ref, {
        'subscriptions.sharing': true
      });
      batchCount++;
      updated++;

      // Firestore batch 한계(500개)마다 커밋
      if (batchCount >= 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    res.status(200).json({
      success: true,
      total: snapshot.size,
      updated: updated,
      skipped: skipped,
      message: `${updated}개 토큰에 sharing 구독을 추가했습니다. (${skipped}개는 이미 있음)`
    });
  } catch (error) {
    console.error('마이그레이션 실패:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 회원 삭제 (Firebase Auth + Firestore)
// 관리자 패널에서 호출 - superAdmin 또는 operations-office만 허용
exports.deleteUser = functions.https.onCall(async (data, context) => {
  // 인증 확인
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const callerUid = context.auth.uid;
  const targetUid = data.uid;

  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', '삭제할 회원의 UID가 필요합니다.');
  }

  // 자기 자신은 삭제 불가
  if (callerUid === targetUid) {
    throw new functions.https.HttpsError('failed-precondition', '자기 자신은 삭제할 수 없습니다.');
  }

  // 호출자 권한 확인
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError('permission-denied', '호출자 정보를 찾을 수 없습니다.');
  }

  const callerData = callerDoc.data();
  const callerRole = callerData.role || '';
  const callerTier = callerData.memberTier || '';

  if (callerRole !== 'superAdmin' && callerTier !== 'operations-office') {
    throw new functions.https.HttpsError('permission-denied', '삭제 권한이 없습니다.');
  }

  // 대상이 superAdmin이면 삭제 불가
  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (targetDoc.exists) {
    const targetData = targetDoc.data();
    if (targetData.role === 'superAdmin') {
      throw new functions.https.HttpsError('failed-precondition', '최고 관리자는 삭제할 수 없습니다.');
    }
  }

  // 1. Firebase Auth에서 삭제
  try {
    await admin.auth().deleteUser(targetUid);
  } catch (authError) {
    // Auth에 사용자가 없는 경우 (이미 삭제됨) 무시
    if (authError.code !== 'auth/user-not-found') {
      throw new functions.https.HttpsError('internal', 'Auth 삭제 실패: ' + authError.message);
    }
  }

  // 2. Firestore users 컬렉션에서 삭제
  if (targetDoc.exists) {
    await db.collection('users').doc(targetUid).delete();
  }

  // 3. pendingUsers 컬렉션에도 있으면 삭제
  const pendingDoc = await db.collection('pendingUsers').doc(targetUid).get();
  if (pendingDoc.exists) {
    await db.collection('pendingUsers').doc(targetUid).delete();
  }

  // 4. 해당 회원의 나눔활동 신청 내역 삭제
  const appSnapshot = await db.collection('sharingApplications')
    .where('applicantUid', '==', targetUid)
    .get();

  if (!appSnapshot.empty) {
    const batch = db.batch();
    appSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  return { success: true, message: '회원이 삭제되었습니다.' };
});

// 테스트용 HTTP 함수 (알림 수동 발송)
exports.sendTestNotification = functions.https.onRequest(async (req, res) => {
  // CORS 설정
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const tokens = await getActiveTokens('events');

    if (tokens.length === 0) {
      res.status(200).json({
        success: false,
        message: '구독자가 없습니다.'
      });
      return;
    }

    await sendPushNotification(tokens, {
      title: 'G-DEAL 테스트 알림',
      body: '알림이 정상적으로 작동하고 있습니다!',
      icon: '/icon-192.png',
      tag: 'test',
      url: '/home/'
    }, {
      type: 'test',
      url: '/home/'
    });

    res.status(200).json({
      success: true,
      message: `${tokens.length}명에게 테스트 알림을 발송했습니다.`
    });
  } catch (error) {
    console.error('테스트 알림 발송 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ===== 성장패스 점수판: 30분마다 전 회원 스탬프·배지를 계산해 leaderboard 문서 2개에 저장 =====
// public = 상위 10명 순위·점수(이름·uid 없음, 누구나 읽기) / members = 이름 포함 전체(로그인 사용자만, firestore.rules)
// 계산은 growth/rules.js 복사본(growth-rules.js — firebase.json predeploy가 배포 때 복사)으로 회원 화면과 같은 기준.
const GR = require('./growth-rules.js');

function lbDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const p = v.split('-');
    return new Date(+p[0], p[1] - 1, +p[2]); // 날짜 문자열은 현지(한국) 자정
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ponytail: 매번 컬렉션 전체를 읽는다(회원·기록 수백 건 규모). 수만 건이 되면 기록 쓰기 트리거로 회원별 합계를 누적할 것.
async function buildLeaderboard() {
  process.env.TZ = 'Asia/Seoul'; // 학기 경계(rules.js termOf)를 한국 시간으로
  const [users, logs, diaries, resources, acts, apps, ruleSnap, grantSnap] = await Promise.all(
    ['users', 'activityLog', 'diaries', 'resources', 'sharingActivities', 'sharingApplications', 'badgeRules', 'badgeGrants']
      .map(c => db.collection(c).get())
  );

  // 회원별 원장 (growth/common.js loadLedger와 같은 정규화)
  const byUid = {};
  const push = (uid, e) => { if (uid) (byUid[uid] = byUid[uid] || []).push(e); };
  logs.forEach(d => { const x = d.data(); push(x.uid, { type: x.type, status: x.status || 'auto', at: lbDate(x.occurredAt) || lbDate(x.createdAt), targetId: x.targetId || '' }); });
  diaries.forEach(d => { const x = d.data(); push(x.authorId, { type: 'diary', status: 'auto', at: lbDate(x.createdAt) || lbDate(x.date), likes: (Array.isArray(x.likes) ? x.likes : []).filter(u => u && u !== x.authorId).length }); });
  resources.forEach(d => { const x = d.data(); push(x.createdBy, { type: x.kind === 'webapp' ? 'app_register' : 'resource_share', status: 'auto', at: lbDate(x.createdAt) || lbDate(x.date), targetId: d.id }); });
  acts.forEach(d => { const x = d.data(); push(x.creatorUid, { type: 'sharing_host', status: 'auto', at: lbDate(x.activityDate) || lbDate(x.createdAt), targetId: d.id }); });
  apps.forEach(d => { const x = d.data(); push(x.applicantUid, { type: 'sharing_join', status: 'auto', at: lbDate(x.date) || lbDate(x.createdAt), targetId: x.activityId || '' }); });

  const rules = ruleSnap.empty ? GR.DEFAULT_BADGES : ruleSnap.docs.map(d => Object.assign({}, d.data(), { id: d.id }));
  const grants = {};
  grantSnap.forEach(d => { const x = d.data(); (grants[x.uid] = grants[x.uid] || []).push(x.ruleId); });

  const now = new Date();
  const boards = { term: [], all: [] };
  users.forEach(u => {
    const x = u.data();
    const entries = byUid[u.id];
    if (!entries || (x.status && x.status !== 'approved')) return;
    const badges = GR.evaluateBadges(rules, entries, grants[u.id] || [], now).filter(b => b.earned).length;
    const base = { uid: u.id, name: x.displayName || '회원', featured: x.featuredBadge && x.featuredBadge.name ? x.featuredBadge.name : '', badges };
    for (const period of ['term', 'all']) {
      const stamps = GR.stampCounts(entries, period, now);
      const score = stamps.join + stamps.reflect + stamps.practice + stamps.share; // 스탬프 1개 = 1점
      if (score) boards[period].push(Object.assign({ score, stamps }, base));
    }
  });

  // 점수 → 배지 수 순. 둘 다 같으면 같은 순위
  for (const list of [boards.term, boards.all]) {
    list.sort((a, b) => b.score - a.score || b.badges - a.badges || a.name.localeCompare(b.name, 'ko'));
    list.forEach((r, i) => { const p = list[i - 1]; r.rank = p && p.score === r.score && p.badges === r.badges ? p.rank : i + 1; });
  }
  const anon = list => list.slice(0, 10).map(r => ({ rank: r.rank, score: r.score, badges: r.badges, stamps: r.stamps }));
  const meta = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), term: GR.termLabel(GR.termOf(now)) };
  await db.collection('leaderboard').doc('public').set(Object.assign({ boards: { term: anon(boards.term), all: anon(boards.all) } }, meta));
  await db.collection('leaderboard').doc('members').set(Object.assign({ boards }, meta));
  return { term: boards.term.length, all: boards.all.length };
}

exports.growthLeaderboard = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const r = await buildLeaderboard();
    console.log(`점수판 갱신: 이번 학기 ${r.term}명, 전체 ${r.all}명`);
  });

// 운영진이 바로 갱신할 때 (관리자만)
exports.refreshLeaderboard = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
  const me = await db.collection('users').doc(context.auth.uid).get();
  const x = me.exists ? me.data() : {};
  if (x.role !== 'superAdmin' && x.memberTier !== 'operations-office') {
    throw new functions.https.HttpsError('permission-denied', '운영진만 갱신할 수 있습니다.');
  }
  return buildLeaderboard();
});
