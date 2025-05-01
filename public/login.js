// 소켓 연결
const socket = io();

// DOM 요소
const authScreen = document.getElementById('auth-screen');
const loginForm = document.getElementById('login-form');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// 입력 필드 아이콘 래퍼 요소
const inputWrappers = document.querySelectorAll('.input-icon-wrapper');

// 전역 변수
let isProcessing = false; // 로그인 처리 중 상태
let currentUser = null; // 현재 로그인한 사용자

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// JWT 토큰 저장
function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

// JWT 토큰 가져오기
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// JWT 토큰 삭제
function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY); // 사용자 정보도 함께 삭제
}

// 사용자 정보 저장
function saveUserInfo(user) {
    console.log('사용자 정보 로컬 스토리지에 저장:', user);
    
    // 관리자 권한 확인 및 설정
    if (user) {
        // 1. 사용자명이 admin인 경우 무조건 관리자 권한 부여
        if (user.username && user.username.toLowerCase() === 'admin') {
            user.isAdmin = true;
            user.is_admin = true;
            console.log('admin 계정 - 관리자 권한 부여됨');
        }
        
        // 2. isAdmin 속성이 없고 is_admin 속성이 있는 경우 변환
        if (user.isAdmin === undefined && user.is_admin !== undefined) {
            user.isAdmin = user.is_admin === true || user.is_admin === 1;
            console.log('is_admin을 isAdmin으로 변환:', user.isAdmin);
        }
        
        // 3. is_admin 속성이 true면 isAdmin도 true로 설정
        if (user.is_admin === true || user.is_admin === 1) {
            user.isAdmin = true;
            console.log('is_admin 속성이 true - 관리자 권한 부여됨');
        }
        
        console.log('저장되는 사용자 정보의 관리자 여부:', user.isAdmin ? '예' : '아니오');
    }
    
    // window.currentUser에 설정
    window.currentUser = user;
    currentUser = user;
    
    // 로컬 스토리지에 저장
    try {
        const userData = { ...user };
        // 토큰이 있으면 함께 저장
        const token = getToken();
        if (token) {
            userData.token = token;
        }
        
        localStorage.setItem(USER_KEY, JSON.stringify(userData));
    } catch (error) {
        console.error('사용자 정보 저장 오류:', error);
    }
}

// 메인 메뉴 화면으로 이동
function redirectToMainMenu() {
    window.location.href = '/';
}

// 로그인 처리
function handleLogin() {
    if (isProcessing) return;
    
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    
    if (!username || !password) {
        loginError.textContent = '아이디와 비밀번호를 모두 입력해주세요.';
        return;
    }
    
    isProcessing = true;
    setButtonState(loginBtn, true, '로그인 중...');
    loginError.textContent = '';
    
    // API 로그인
    fetch('/api/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    })
    .then(response => response.json())
    .then(data => {
        isProcessing = false;
        setButtonState(loginBtn, false, '로그인');
        
        if (data.success) {
            // 폼 입력값 초기화
            loginUsername.value = '';
            loginPassword.value = '';
            
            // 토큰 저장
            saveToken(data.token);
            
            // 관리자 권한 확인 및 사용자 정보 저장
            if (data.user) {
                // 1. 사용자명이 admin인 경우
                if (data.user.username && data.user.username.toLowerCase() === 'admin') {
                    data.user.isAdmin = true;
                    data.user.is_admin = true;
                    console.log('admin 계정 로그인 - 관리자 권한 부여됨');
                }
                
                // 2. isAdmin 속성이 없고 is_admin 속성이 있는 경우
                if (data.user.isAdmin === undefined && data.user.is_admin !== undefined) {
                    data.user.isAdmin = data.user.is_admin === true || data.user.is_admin === 1;
                    console.log('is_admin을 isAdmin으로 변환:', data.user.isAdmin);
                }
                
                // 3. is_admin 속성이 true면 isAdmin도 true로 설정
                if (data.user.is_admin === true || data.user.is_admin === 1) {
                    data.user.isAdmin = true;
                    console.log('is_admin 속성이 true - 관리자 권한 부여됨');
                }
                
                console.log('로그인 사용자 정보:', data.user);
                console.log('관리자 여부:', data.user.isAdmin ? '예' : '아니오');
                
                // 사용자 정보 저장
                saveUserInfo(data.user);
            }
            
            // 로그인 성공 후 리디렉션
            window.location.href = 'index.html';
        } else {
            loginError.textContent = data.message || '로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.';
        }
    })
    .catch(error => {
        console.error('로그인 처리 중 오류:', error);
        isProcessing = false;
        setButtonState(loginBtn, false, '로그인');
        loginError.textContent = '서버와 통신 중 오류가 발생했습니다. 다시 시도해주세요.';
    });
}

// 토큰으로 자동 로그인
async function autoLogin() {
    const token = getToken();
    if (!token) return false;

    try {
        console.log('자동 로그인 시도: 토큰으로 사용자 확인');
        const response = await fetch('/api/verify-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ token }),
        });

        const data = await response.json();
        
        if (data.success) {
            console.log('자동 로그인 성공');
            
            // 새 토큰이 있으면 저장
            if (data.token) {
                console.log('새 토큰 저장');
                saveToken(data.token);
            }
            
            // 사용자 정보와 관리자 권한 확인
            console.log('자동 로그인 사용자 정보:', data.user);
            
            if (data.user) {
                // 1. 사용자명이 admin인 경우
                if (data.user.username && data.user.username.toLowerCase() === 'admin') {
                    data.user.isAdmin = true;
                    data.user.is_admin = true;
                    console.log('admin 계정 - 관리자 권한 부여됨');
                }
                
                // 2. isAdmin 속성이 없고 is_admin 속성이 있는 경우
                if (data.user.isAdmin === undefined && data.user.is_admin !== undefined) {
                    data.user.isAdmin = data.user.is_admin === true || data.user.is_admin === 1;
                    console.log('is_admin을 isAdmin으로 변환:', data.user.isAdmin);
                }
                
                // 3. is_admin 속성이 true면 isAdmin도 true로 설정
                if (data.user.is_admin === true || data.user.is_admin === 1) {
                    data.user.isAdmin = true;
                    console.log('is_admin 속성이 true - 관리자 권한 부여됨');
                }
                
                console.log('최종 관리자 여부:', data.user.isAdmin ? '예' : '아니오');
                
                // 사용자 정보 저장
                saveUserInfo(data.user);
            }
            
            return true;
        } else {
            console.error('자동 로그인 실패:', data.message);
            clearAuthData();
            return false;
        }
    } catch (error) {
        console.error('자동 로그인 중 오류 발생:', error);
        clearAuthData();
        return false;
    }
}

// 버튼 상태 설정 (로딩 중 또는 기본 상태)
function setButtonState(button, isLoading, text) {
    button.disabled = isLoading;
    button.innerHTML = isLoading 
        ? `<i class="fas fa-spinner fa-spin"></i> ${text}` 
        : `<i class="fas fa-sign-in-alt"></i> ${text}`;
}

// 소켓 리스너 설정
function setupSocketListeners() {
    socket.on('login_success', (data) => {
        console.log('소켓 로그인 성공:', data);
        redirectToMainMenu();
    });
    
    // 강제 로그아웃 이벤트 처리
    socket.on('forced_logout', (data) => {
        console.log('강제 로그아웃:', data.message);
        
        // 알림 표시
        alert(data.message);
        
        // 로그아웃 처리
        removeToken();
        
        // 에러 메시지 표시
        loginError.textContent = '다른 기기에서 로그인되었습니다. 다시 로그인해주세요.';
    });
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
    // 로그인 버튼 클릭
    loginBtn.addEventListener('click', handleLogin);
    
    // 엔터 키 처리
    loginUsername.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loginPassword.focus();
        }
    });
    
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });
    
    // 입력 필드 포커스 이벤트 설정
    setupInputFocusEvents();
}

// 초기화 함수
function init() {
    // 자동 로그인 시도
    autoLogin().then(success => {
        if (!success) {
            setupSocketListeners();
            setupEventListeners();
        }
    });
}

// DOM 로드 시 초기화
document.addEventListener('DOMContentLoaded', init); 