/**
 * 기존 구글 시트에 나눔회원 활동 관리 구조 설정
 * 실행: node setup-sheet.js
 */
const { google } = require('googleapis');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', 'gdeal-drive-picker-9eb7e0c3dda2.json');
const credentials = require(KEY_FILE);
const SPREADSHEET_ID = '1GXVcerF_W_qPpzyycMOqj8spCaeCypZ22T5bIM2JTds';

async function main() {
  const auth = new google.auth.JWT(
    credentials.client_email, null, credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  console.log('시트 구조 설정 중...');

  // 1. 기존 시트 정보 확인
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties'
  });
  const existingSheets = meta.data.sheets;
  console.log('기존 시트:', existingSheets.map(s => s.properties.title).join(', '));

  const requests = [];

  // 첫 번째 시트를 '활동'으로 이름 변경
  const firstSheet = existingSheets[0];
  if (firstSheet.properties.title !== '활동') {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: firstSheet.properties.sheetId,
          title: '활동',
          gridProperties: { frozenRowCount: 1 }
        },
        fields: 'title,gridProperties.frozenRowCount'
      }
    });
  }

  // '신청' 시트가 없으면 추가
  const hasApplySheet = existingSheets.some(s => s.properties.title === '신청');
  if (!hasApplySheet) {
    requests.push({
      addSheet: {
        properties: {
          title: '신청',
          gridProperties: { frozenRowCount: 1 }
        }
      }
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests }
    });
    console.log('시트 구조 업데이트 완료');
  }

  // 2. 헤더 행 추가
  console.log('헤더 추가 중...');
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: '활동!A1:K1',
          values: [['ID', '활동명', '개설자', '개설자UID', '신청/사용계약 가능자', '신청형태', '내용설명', '예산/자원관리', '최신진행상황', '생성일', '수정일']]
        },
        {
          range: '신청!A1:F1',
          values: [['ID', '활동ID', '신청자', '신청자UID', '신청일', '상태']]
        }
      ]
    }
  });

  // 3. 시트 메타 다시 가져오기
  const meta2 = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties'
  });
  const actSheet = meta2.data.sheets.find(s => s.properties.title === '활동');
  const appSheet = meta2.data.sheets.find(s => s.properties.title === '신청');

  // 4. 헤더 스타일 + 열 너비 설정
  console.log('스타일 적용 중...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        // 활동 시트 헤더 스타일 (G-DEAL 초록색 배경, 흰색 글자)
        {
          repeatCell: {
            range: { sheetId: actSheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.4, green: 0.68, blue: 0.49 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        // 신청 시트 헤더 스타일
        {
          repeatCell: {
            range: { sheetId: appSheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.4, green: 0.68, blue: 0.49 },
                textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        },
        // 활동 시트 열 너비
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: actSheet.properties.sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
      ]
    }
  });

  console.log('\n====================================');
  console.log('시트 설정 완료!');
  console.log('====================================');
  console.log('스프레드시트 ID:', SPREADSHEET_ID);
}

main().catch(err => {
  console.error('오류 발생:', err.message);
  if (err.response && err.response.data) {
    console.error('상세:', JSON.stringify(err.response.data.error, null, 2));
  }
  process.exit(1);
});
