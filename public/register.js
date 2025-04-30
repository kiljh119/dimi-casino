// 소켓 연결
const socket = io();

// DOM 요소
const registerForm = document.getElementById('register-form');
const registerUsername = document.getElementById('register-username');
const registerPassword = document.getElementById('register-password');
const registerConfirmPassword = document.getElementById('register-confirm-password');
const registerBtn = document.getElementById('register-btn');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');

// 입력 필드 아이콘 래퍼 요소
const inputWrappers = document.querySelectorAll('.input-icon-wrapper');

// 전역 변수
let isProcessing = false; // 회원가입 처리 중 상태

// 폼 메시지 초기화
function clearFormMessages() {
    registerError.textContent = '';
    registerSuccess.textContent = '';
}

// 회원가입 처리
function handleRegister() {
    if (isProcessing) return;
    
    const username = registerUsername.value.trim();
    const password = registerPassword.value.trim();
    const confirmPassword = registerConfirmPassword.value.trim();
    
    if (!username || !password || !confirmPassword) {
        registerError.textContent = '모든 필드를 입력해주세요.';
        return;
    }
    
    if (username.length < 3 || username.length > 15) {
        registerError.textContent = '아이디는 3~15자 사이여야 합니다.';
        return;
    }
    
    if (password.length < 6) {
        registerError.textContent = '비밀번호는 최소 6자 이상이어야 합니다.';
        return;
    }
    
    if (password !== confirmPassword) {
        registerError.textContent = '비밀번호가 일치하지 않습니다.';
        return;
    }
    
    isProcessing = true;
    setButtonState(registerBtn, true, '가입 중...');
    clearFormMessages();
    
    // API 회원가입
    fetch('/api/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })
    .then(response => response.json())
    .then(data => {
        isProcessing = false;
        setButtonState(registerBtn, false, '회원가입');
        
        if (data.success) {
            // 폼 입력 초기화
            registerUsername.value = '';
            registerPassword.value = '';
            registerConfirmPassword.value = '';
            
            // 성공 메시지 표시
            registerSuccess.textContent = '회원가입이 완료되었습니다. 이제 로그인하세요.';
            
            // 3초 후 로그인 페이지로 리디렉션
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } else {
            registerError.textContent = data.message;
        }
    })
    .catch(error => {
        console.error('Registration error:', error);
        registerError.textContent = '서버 오류가 발생했습니다.';
        isProcessing = false;
        setButtonState(registerBtn, false, '회원가입');
    });
}

// 버튼 상태 설정 (로딩 중 또는 기본 상태)
function setButtonState(button, isLoading, text) {
    button.disabled = isLoading;
    button.innerHTML = isLoading 
        ? `<i class="fas fa-spinner fa-spin"></i> ${text}` 
        : `<i class="fas fa-user-plus"></i> ${text}`;
}

// 입력 필드 포커스 이벤트 설정
function setupInputFocusEvents() {
    // 각 입력 필드 래퍼에 이벤트 추가
    inputWrappers.forEach(wrapper => {
        const input = wrapper.querySelector('input');
        
        if (input) {
            // 포커스 이벤트
            input.addEventListener('focus', () => {
                wrapper.classList.add('focused');
            });
            
            // 블러 이벤트
            input.addEventListener('blur', () => {
                wrapper.classList.remove('focused');
            });
        }
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 회원가입 버튼 클릭
    registerBtn.addEventListener('click', handleRegister);
    
    // 엔터 키 처리
    registerUsername.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            registerPassword.focus();
        }
    });
    
    registerPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            registerConfirmPassword.focus();
        }
    });
    
    registerConfirmPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRegister();
        }
    });
    
    // 입력 필드 포커스 이벤트 설정
    setupInputFocusEvents();
}

// 초기화 함수
function init() {
    setupEventListeners();
}

// DOM 로드 시 초기화
document.addEventListener('DOMContentLoaded', init); 