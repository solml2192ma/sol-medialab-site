/*
 * EmailJS 연동 설정
 * 1) https://www.emailjs.com 에서 무료 가입
 * 2) Email Services 메뉴에서 사용할 이메일(Gmail 등) 연결 -> Service ID 발급
 * 3) Email Templates 메뉴에서 템플릿 생성 -> Template ID 발급
 *    템플릿 본문에는 아래에서 보내는 변수명을 그대로 사용하면 됩니다:
 *    {{inquiry_type}}, {{customer_name}}, {{customer_email}}, {{customer_phone}}, {{message}}
 *    수신 이메일(To Email)은 템플릿 설정에서 solml2192@gmail.com 으로 고정하거나 {{to_email}} 변수를 사용하세요.
 * 4) Account > General 메뉴에서 Public Key 발급
 * 5) 아래 세 값을 발급받은 값으로 교체
 */
const EMAILJS_SERVICE_ID = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY = 'YOUR_PUBLIC_KEY';
const TO_EMAIL = 'solml2192@gmail.com';

if (window.emailjs && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
  emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

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

  if (!window.emailjs || EMAILJS_SERVICE_ID === 'YOUR_SERVICE_ID') {
    setStatus('이메일 전송 설정이 아직 완료되지 않았습니다. assets/js/contact.js의 EmailJS 값을 채워주세요.', 'error');
    return;
  }

  const phone = phoneInputs.map((f) => f.value).filter(Boolean).join('-');

  const params = {
    inquiry_type: document.getElementById('inquiryType').value,
    customer_name: document.getElementById('customerName').value,
    customer_email: document.getElementById('customerEmail').value,
    customer_phone: phone,
    message: document.getElementById('message').value,
    to_email: TO_EMAIL,
  };

  submitBtn.disabled = true;
  setStatus('전송 중입니다...', 'sending');

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
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
