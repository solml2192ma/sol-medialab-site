/*
 * Google Sheets 연동 설정
 * 1) sheets.google.com 에서 새 시트 생성
 * 2) 확장 프로그램 > Apps Script 메뉴 열고, 이 프로젝트의 apps-script.js 내용을 붙여넣기
 * 3) 배포 > 새 배포 > 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자로 설정 후 배포
 * 4) 발급된 웹 앱 URL을 아래 GOOGLE_SCRIPT_URL에 붙여넣기
 */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbykbtmr9z-dl1mB6KOOede5zrRiC5L1ee-MZnKRTQMK2nfli8Zz_d-5XmehOJZ86-lN/exec';

// 연락처 입력 시 다음 칸으로 자동 이동
const phoneInputs = ['phone1', 'phone2', 'phone3'].map((id) => document.getElementById(id));
phoneInputs.forEach((input, idx) => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^0-9]/g, '');
    if (input.value.length >= input.maxLength && phoneInputs[idx + 1]) {
      phoneInputs[idx + 1].focus();
    }
  });
});

const form = document.getElementById('quoteForm');
const submitBtn = document.getElementById('submitBtn');
const statusEl = document.getElementById('formStatus');
const modal = document.getElementById('successModal');
const modalConfirm = document.getElementById('modalConfirm');
const emailInput = document.getElementById('customerEmail');

function hasContactMethod() {
  const emailFilled = emailInput.value.trim().length > 0;
  const phoneFilled = phoneInputs.every((input) => input.value.trim().length > 0);
  return emailFilled || phoneFilled;
}

function updateContactMethodValidity() {
  emailInput.setCustomValidity(hasContactMethod() ? '' : '이메일 또는 연락처 중 하나는 반드시 입력해 주세요.');
}

[emailInput, ...phoneInputs].forEach((input) => {
  input.addEventListener('input', updateContactMethodValidity);
});
updateContactMethodValidity();

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'form-status' + (cls ? ' ' + cls : '');
}

function openModal() {
  modal.hidden = false;
}
function closeModal() {
  modal.hidden = true;
}
modalConfirm.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (GOOGLE_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
    setStatus('전송 설정이 아직 완료되지 않았습니다. assets/js/contact.js의 GOOGLE_SCRIPT_URL을 채워주세요.', 'error');
    return;
  }

  const phone = phoneInputs.map((f) => f.value).filter(Boolean).join('-');

  const params = new URLSearchParams({
    inquiry_type: document.getElementById('inquiryType').value,
    customer_name: document.getElementById('customerName').value,
    customer_email: document.getElementById('customerEmail').value,
    customer_phone: phone,
    message: document.getElementById('message').value,
  });

  submitBtn.disabled = true;
  setStatus('전송 중입니다...', 'sending');

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    setStatus('', '');
    form.reset();
    openModal();
  } catch (err) {
    console.error(err);
    setStatus('전송에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});
