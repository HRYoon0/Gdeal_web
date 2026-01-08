/**
 * G-DEAL Cloud Functions
 * 자료 등록 시 FCM 푸시 알림 발송
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
    icon: '/icons/icon-192x192.png',
    tag: 'events',
    url: '/events/'
  },
  trainings: {
    title: '새 월별연수가 등록되었습니다',
    icon: '/icons/icon-192x192.png',
    tag: 'training',
    url: '/training/'
  },
  resources: {
    title: '새 자료가 공유되었습니다',
    icon: '/icons/icon-192x192.png',
    tag: 'resources',
    url: '/resources/'
  },
  diary: {
    title: '새 교단일기가 등록되었습니다',
    icon: '/icons/icon-192x192.png',
    tag: 'diary',
    url: '/diary/'
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

  const message = {
    notification: {
      title: notification.title,
      body: notification.body
    },
    data: {
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK'
    },
    webpush: {
      notification: {
        icon: notification.icon,
        badge: '/icons/icon-72x72.png',
        tag: notification.tag,
        requireInteraction: true
      },
      fcmOptions: {
        link: notification.url
      }
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
  .document('diary/{diaryId}')
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
      icon: '/icons/icon-192x192.png',
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
