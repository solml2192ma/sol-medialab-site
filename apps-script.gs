/*
 * 사용법:
 * 1) sheets.google.com 에서 새 스프레드시트 생성 (예: "솔미디어랩 문의")
 * 2) 첫 번째 행에 헤더 입력: 접수시각 | 문의유형 | 이름(회사명) | 이메일 | 연락처 | 문의내용
 * 3) 확장 프로그램 > Apps Script 클릭
 * 4) 기존 코드를 지우고 이 파일 내용 전체를 붙여넣기
 * 5) 저장 후 배포 > 새 배포
 *    - 유형 선택: 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 6) 배포 클릭 → Google 계정 권한 승인 → 웹 앱 URL 복사
 * 7) 복사한 URL을 assets/js/contact.js의 GOOGLE_SCRIPT_URL에 붙여넣기
 */

const NOTIFY_EMAIL = 'solml2192@gmail.com';

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = (e && e.parameter) || {};
  const now = new Date();
  const timestamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    timestamp,
    data.inquiry_type || '',
    data.customer_name || '',
    data.customer_email || '',
    data.customer_phone || '',
    data.message || '',
  ]);

  const subject = '[SOL MEDIA LAB] 새 견적 문의: ' + (data.customer_name || '');
  const body =
    '문의 유형: ' + (data.inquiry_type || '') + '\n' +
    '이름(회사명): ' + (data.customer_name || '') + '\n' +
    '이메일: ' + (data.customer_email || '') + '\n' +
    '연락처: ' + (data.customer_phone || '') + '\n\n' +
    '문의 내용:\n' + (data.message || '') + '\n\n' +
    '접수 시각: ' + timestamp + ' (KST)';

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);

  return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
