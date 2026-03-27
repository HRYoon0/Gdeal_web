/**
 * G-DEAL 나눔회원 활동 관리 - Google Apps Script
 *
 * 설치 방법:
 * 1. https://docs.google.com/spreadsheets/d/1GXVcerF_W_qPpzyycMOqj8spCaeCypZ22T5bIM2JTds/edit 열기
 * 2. 확장 프로그램 → Apps Script 클릭
 * 3. Code.gs 내용을 전부 삭제하고, 이 코드를 전체 복사하여 붙여넣기
 * 4. 상단 메뉴에서 setupSheets 함수 선택 후 ▶ 실행 (시트 자동 생성)
 * 5. 배포 → 배포 관리 → 연필 아이콘(수정) → 버전: 새 버전 → 배포
 *    (처음이라면: 배포 → 새 배포 → 유형: 웹 앱, 실행 주체: 본인, 액세스: 모든 사용자)
 * 6. 배포 후 URL이 sharing.js의 API_BASE와 동일한지 확인
 */

// 스프레드시트 ID (바인딩 스크립트에서는 자동 감지됨)
var SPREADSHEET_ID = '1CxbGuBz6UI4G5GgBtEGReRpN6pR2SjTdDiFm7EJqaVg';

// 시트 헤더 정의
var ACTIVITY_HEADERS = ['ID', '나눔영역', '활동명', '개설자', '개설자UID', '날짜', '시간', '장소/링크', '정원', '활동내용', '신청수', '생성일', '수정일'];
var APPLY_HEADERS = ['ID', '활동ID', '신청자', '신청자UID', '신청일', '상태'];

/**
 * 시트 자동 생성/초기화 함수
 * Apps Script 에디터에서 이 함수를 선택하고 ▶ 실행하면
 * "활동"과 "신청" 시트가 자동으로 생성됩니다.
 * 이미 존재하는 시트는 건드리지 않고, 없는 시트만 새로 만듭니다.
 */
function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // 기존 "활동" 시트 삭제 후 새로 생성
  var oldActivity = ss.getSheetByName('활동');
  if (oldActivity) {
    // 삭제하려면 시트가 2개 이상이어야 하므로 임시 시트 생성
    var tempSheet = ss.insertSheet('_temp');
    ss.deleteSheet(oldActivity);
    Logger.log('🗑️ 기존 "활동" 시트 삭제');
  }

  var activitySheet = ss.getSheetByName('활동');
  if (!activitySheet) {
    activitySheet = ss.insertSheet('활동');
    activitySheet.getRange(1, 1, 1, ACTIVITY_HEADERS.length).setValues([ACTIVITY_HEADERS]);
    activitySheet.getRange(1, 1, 1, ACTIVITY_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f0faf3')
      .setHorizontalAlignment('center');
    activitySheet.setFrozenRows(1);
    // 열 너비 개별 설정
    var actColWidths = [120, 180, 200, 100, 160, 110, 80, 250, 60, 300, 60, 100, 100];
    for (var c = 0; c < actColWidths.length; c++) {
      activitySheet.setColumnWidth(c + 1, actColWidths[c]);
    }
    Logger.log('✅ "활동" 시트 생성 완료');
  } else {
    Logger.log('ℹ️ "활동" 시트가 이미 존재합니다. 헤더와 열 너비를 업데이트합니다.');
    activitySheet.getRange(1, 1, 1, ACTIVITY_HEADERS.length).setValues([ACTIVITY_HEADERS]);
    activitySheet.getRange(1, 1, 1, ACTIVITY_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f0faf3')
      .setHorizontalAlignment('center');
    var actColWidths2 = [120, 180, 200, 100, 160, 110, 80, 250, 60, 300, 200, 200, 60, 100, 100];
    for (var c2 = 0; c2 < actColWidths2.length; c2++) {
      activitySheet.setColumnWidth(c2 + 1, actColWidths2[c2]);
    }
  }

  // 기존 "신청" 시트 삭제 후 새로 생성
  var oldApply = ss.getSheetByName('신청');
  if (oldApply) {
    ss.deleteSheet(oldApply);
    Logger.log('🗑️ 기존 "신청" 시트 삭제');
  }

  var applySheet = ss.getSheetByName('신청');
  if (!applySheet) {
    applySheet = ss.insertSheet('신청');
    applySheet.getRange(1, 1, 1, APPLY_HEADERS.length).setValues([APPLY_HEADERS]);
    applySheet.getRange(1, 1, 1, APPLY_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#eff6ff')
      .setHorizontalAlignment('center');
    applySheet.setFrozenRows(1);
    var applyColWidths = [120, 120, 120, 160, 110, 100];
    for (var c3 = 0; c3 < applyColWidths.length; c3++) {
      applySheet.setColumnWidth(c3 + 1, applyColWidths[c3]);
    }
    Logger.log('✅ "신청" 시트 생성 완료');
  } else {
    Logger.log('ℹ️ "신청" 시트가 이미 존재합니다. 헤더와 열 너비를 업데이트합니다.');
    applySheet.getRange(1, 1, 1, APPLY_HEADERS.length).setValues([APPLY_HEADERS]);
    applySheet.getRange(1, 1, 1, APPLY_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#eff6ff')
      .setHorizontalAlignment('center');
    var applyColWidths2 = [120, 120, 120, 160, 110, 100];
    for (var c4 = 0; c4 < applyColWidths2.length; c4++) {
      applySheet.setColumnWidth(c4 + 1, applyColWidths2[c4]);
    }
  }

  // 기본 시트(Sheet1 등) 삭제 시도
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name !== '활동' && name !== '신청' && sheets.length > 2) {
      try { ss.deleteSheet(sheets[i]); } catch(e) { /* 마지막 시트는 삭제 불가 */ }
    }
  }

  Logger.log('🎉 시트 설정 완료!');
}

function getSpreadsheet() {
  // 스프레드시트에 바인딩된 스크립트면 getActiveSpreadsheet 사용
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch(e) {}
  // 독립 스크립트면 ID로 열기
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getActivitySheet() {
  var sheet = getSpreadsheet().getSheetByName('활동');
  if (!sheet) {
    setupSheets();
    sheet = getSpreadsheet().getSheetByName('활동');
  }
  return sheet;
}

function getApplySheet() {
  var sheet = getSpreadsheet().getSheetByName('신청');
  if (!sheet) {
    setupSheets();
    sheet = getSpreadsheet().getSheetByName('신청');
  }
  return sheet;
}

// 고유 ID 생성
function generateId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

// JSON 응답
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET 요청 처리
function doGet(e) {
  try {
    var action = e.parameter.action || 'list';
    if (action === 'list') {
      var uid = e.parameter.uid || '';
      return listActivities(uid);
    }
    if (action === 'applicants') {
      return getApplicants(e.parameter.activityId || '');
    }
    return createJsonResponse({ success: false, error: '알 수 없는 요청' });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

// POST 요청 처리
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    switch (action) {
      case 'create':
        return createActivity(body);
      case 'update':
        return updateActivity(body);
      case 'delete':
        return deleteActivity(body);
      case 'apply':
        return applyForActivity(body);
      case 'cancel':
        return cancelApplication(body);
      default:
        return createJsonResponse({ success: false, error: '알 수 없는 작업: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

// 활동 목록 조회 (uid가 있으면 해당 사용자의 신청 목록도 반환)
function listActivities(uid) {
  var sheet = getActivitySheet();
  var data = sheet.getDataRange().getValues();

  // 사용자의 신청 목록 조회
  var appliedActivityIds = {};
  if (uid) {
    var applySheet = getApplySheet();
    var applyData = applySheet.getDataRange().getValues();
    for (var k = 1; k < applyData.length; k++) {
      if (String(applyData[k][3]) === String(uid)) {
        appliedActivityIds[String(applyData[k][1])] = true;
      }
    }
  }

  if (data.length <= 1) {
    return createJsonResponse({ success: true, activities: [], appliedActivityIds: appliedActivityIds });
  }

  var activities = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    // 날짜/시간이 Date 객체로 변환된 경우 문자열로 포맷
    var actDate = row[5];
    if (actDate instanceof Date) {
      actDate = Utilities.formatDate(actDate, 'Asia/Seoul', 'yyyy-MM-dd');
    }
    var actTime = row[6];
    if (actTime instanceof Date) {
      actTime = Utilities.formatDate(actTime, 'Asia/Seoul', 'HH:mm');
    }
    var createdAt = row[11];
    if (createdAt instanceof Date) {
      createdAt = Utilities.formatDate(createdAt, 'Asia/Seoul', 'yyyy-MM-dd');
    }
    var updatedAt = row[12];
    if (updatedAt instanceof Date) {
      updatedAt = Utilities.formatDate(updatedAt, 'Asia/Seoul', 'yyyy-MM-dd');
    }

    activities.push({
      id: String(row[0]),
      category: String(row[1] || ''),
      name: String(row[2] || ''),
      creator: String(row[3] || ''),
      creatorUid: String(row[4] || ''),
      activityDate: String(actDate || ''),
      activityTime: String(actTime || ''),
      location: String(row[7] || ''),
      capacity: String(row[8] || '0'),
      description: String(row[9] || ''),
      appliedCount: Number(row[10]) || 0,
      createdAt: String(createdAt || ''),
      updatedAt: String(updatedAt || '')
    });
  }

  return createJsonResponse({ success: true, activities: activities, appliedActivityIds: appliedActivityIds });
}

// 신청자 목록 조회
function getApplicants(activityId) {
  if (!activityId) {
    return createJsonResponse({ success: false, error: '활동 ID가 필요합니다.' });
  }

  var sheet = getApplySheet();
  var data = sheet.getDataRange().getValues();
  var applicants = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(activityId)) {
      var applyDate = data[i][4];
      if (applyDate instanceof Date) {
        applyDate = Utilities.formatDate(applyDate, 'Asia/Seoul', 'yyyy-MM-dd');
      }
      applicants.push({
        name: String(data[i][2] || ''),
        uid: String(data[i][3] || ''),
        date: String(applyDate || ''),
        status: String(data[i][5] || '')
      });
    }
  }

  return createJsonResponse({ success: true, applicants: applicants });
}

// 활동 개설
function createActivity(body) {
  var name = (body.name || '').trim();
  if (!name) {
    return createJsonResponse({ success: false, error: '활동명은 필수입니다.' });
  }

  var sheet = getActivitySheet();
  var id = body.id || generateId();
  var now = body.createdAt || Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');

  // 날짜/시간을 문자열 앞에 '를 붙여 Sheets의 자동 변환 방지
  var dateVal = body.activityDate ? "'" + body.activityDate : '';
  var timeVal = body.activityTime ? "'" + body.activityTime : '';

  sheet.appendRow([
    id,
    body.category || '',
    name,
    body.creator || '사용자',
    body.creatorUid || '',
    dateVal,
    timeVal,
    body.location || '',
    body.capacity || '0',
    body.description || '',
    0,
    now,
    now
  ]);

  return createJsonResponse({ success: true, id: id });
}

// 활동 수정
function updateActivity(body) {
  var id = body.id;
  if (!id) {
    return createJsonResponse({ success: false, error: '활동 ID가 필요합니다.' });
  }

  var sheet = getActivitySheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return createJsonResponse({ success: false, error: '활동을 찾을 수 없습니다.' });
  }

  var creatorUid = data[rowIndex - 1][4];
  if (body.creatorUid && creatorUid !== body.creatorUid && !body.isAdmin) {
    return createJsonResponse({ success: false, error: '수정 권한이 없습니다.' });
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');

  var updDateVal = body.activityDate ? "'" + body.activityDate : '';
  var updTimeVal = body.activityTime ? "'" + body.activityTime : '';

  sheet.getRange(rowIndex, 2, 1, 12).setValues([[
    body.category || data[rowIndex - 1][1],
    body.name || data[rowIndex - 1][2],
    data[rowIndex - 1][3],
    data[rowIndex - 1][4],
    updDateVal,
    updTimeVal,
    body.location || '',
    body.capacity || '0',
    body.description || '',
    data[rowIndex - 1][10],
    data[rowIndex - 1][11],
    now
  ]]);

  return createJsonResponse({ success: true });
}

// 활동 삭제
function deleteActivity(body) {
  var id = body.id;
  if (!id) {
    return createJsonResponse({ success: false, error: '활동 ID가 필요합니다.' });
  }

  var sheet = getActivitySheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return createJsonResponse({ success: false, error: '활동을 찾을 수 없습니다.' });
  }

  var creatorUid = data[rowIndex - 1][4];
  if (body.creatorUid && creatorUid !== body.creatorUid && !body.isAdmin) {
    return createJsonResponse({ success: false, error: '삭제 권한이 없습니다.' });
  }

  sheet.deleteRow(rowIndex);

  // 해당 활동의 신청 기록도 모두 삭제
  var applySheet = getApplySheet();
  var applyData = applySheet.getDataRange().getValues();
  // 뒤에서부터 삭제해야 행 번호가 밀리지 않음
  for (var k = applyData.length - 1; k >= 1; k--) {
    if (String(applyData[k][1]) === String(id)) {
      applySheet.deleteRow(k + 1);
    }
  }

  return createJsonResponse({ success: true });
}

// 활동 신청 (신청수 자동 증가)
function applyForActivity(body) {
  var activityId = body.activityId;
  if (!activityId) {
    return createJsonResponse({ success: false, error: '활동 ID가 필요합니다.' });
  }

  var applySheet = getApplySheet();
  var id = generateId();
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');

  // 중복 신청 확인
  if (body.applicantUid) {
    var applyData = applySheet.getDataRange().getValues();
    for (var i = 1; i < applyData.length; i++) {
      if (String(applyData[i][1]) === String(activityId) && String(applyData[i][3]) === String(body.applicantUid)) {
        return createJsonResponse({ success: false, error: '이미 신청한 활동입니다.' });
      }
    }
  }

  // 신청 기록 추가
  applySheet.appendRow([
    id,
    activityId,
    body.applicant || '사용자',
    body.applicantUid || '',
    now,
    '신청완료'
  ]);

  // 활동 시트의 신청수(M열, 13번째) 자동 증가
  var activitySheet = getActivitySheet();
  var actData = activitySheet.getDataRange().getValues();
  for (var j = 1; j < actData.length; j++) {
    if (String(actData[j][0]) === String(activityId)) {
      var currentCount = parseInt(actData[j][10]) || 0;
      activitySheet.getRange(j + 1, 11).setValue(currentCount + 1);
      break;
    }
  }

  return createJsonResponse({ success: true, id: id });
}

// 신청 취소 (신청수 자동 감소)
function cancelApplication(body) {
  var activityId = body.activityId;
  var applicantUid = body.applicantUid;
  if (!activityId || !applicantUid) {
    return createJsonResponse({ success: false, error: '활동 ID와 사용자 정보가 필요합니다.' });
  }

  var applySheet = getApplySheet();
  var applyData = applySheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < applyData.length; i++) {
    if (String(applyData[i][1]) === String(activityId) && String(applyData[i][3]) === String(applicantUid)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    return createJsonResponse({ success: false, error: '신청 기록을 찾을 수 없습니다.' });
  }

  applySheet.deleteRow(rowIndex);

  // 활동 시트의 신청수 감소
  var activitySheet = getActivitySheet();
  var actData = activitySheet.getDataRange().getValues();
  for (var j = 1; j < actData.length; j++) {
    if (String(actData[j][0]) === String(activityId)) {
      var currentCount = parseInt(actData[j][10]) || 0;
      activitySheet.getRange(j + 1, 11).setValue(Math.max(0, currentCount - 1));
      break;
    }
  }

  return createJsonResponse({ success: true });
}
