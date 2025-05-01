// DOM 요소 - 인증 화면
const authScreen = document.getElementById('auth-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const registerUsername = document.getElementById('register-username');
const registerPassword = document.getElementById('register-password');
const registerConfirmPassword = document.getElementById('register-confirm-password');
const registerBtn = document.getElementById('register-btn');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const registerLink = document.getElementById('register-link');
const loginLink = document.getElementById('login-link');

// 전역 변수
let isProcessing = false; // 로그인/회원가입 처리 중 상태
let currentUser = null; // 현재 로그인한 사용자
let socketInstance = null; // 소켓 인스턴스

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// 로그인 폼 표시
function showLoginForm() {
    // 폼 전환 애니메이션
    loginForm.style.opacity = 0;
    registerForm.style.opacity = 0;
    
    setTimeout(() => {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        setTimeout(() => {
            loginForm.style.opacity = 1;
        }, 50);
    }, 150);
    
    clearFormMessages();
}

// 회원가입 폼 표시
function showRegisterForm() {
    // 폼 전환 애니메이션
    loginForm.style.opacity = 0;
    registerForm.style.opacity = 0;
    
    setTimeout(() => {
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        setTimeout(() => {
            registerForm.style.opacity = 1;
        }, 50);
    }, 150);
    
    clearFormMessages();
}

// 폼 메시지 초기화
function clearFormMessages() {
    loginError.textContent = '';
    registerError.textContent = '';
    registerSuccess.textContent = '';
}

// 폼 입력 필드 초기화
function clearFormInputs() {
    loginUsername.value = '';
    loginPassword.value = '';
    registerUsername.value = '';
    registerPassword.value = '';
    registerConfirmPassword.value = '';
}

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
    } catch (e) {
        console.error('사용자 정보 저장 오류:', e);
    }
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
            
            // 사용자 정보 저장
            saveUserInfo(data.user);
            
            // 관리자 로그인인 경우
            if (data.user.isAdmin) {
                showMainMenuScreen();
                document.getElementById('admin-panel-button').classList.remove('hidden');
            } else {
                // 일반 사용자 로그인
                socketInstance.emit('login', { username: data.user.username });
            }
            
            return true;
        } else {
            console.log('자동 로그인 실패: 토큰이 유효하지 않음');
            // 유효하지 않은 토큰이면 삭제
            removeToken();
            return false;
        }
    } catch (error) {
        console.error('자동 로그인 오류:', error);
        removeToken();
        return false;
    }
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
            clearFormInputs();
            
            // JWT 토큰 저장
            if (data.token) {
                console.log('로그인 성공: 토큰 저장');
                saveToken(data.token);
            }
            
            // 사용자 정보 저장
            saveUserInfo(data.user);
            
            // 관리자 로그인인 경우
            if (data.user.isAdmin) {
                showMainMenuScreen();
                document.getElementById('admin-panel-button').classList.remove('hidden');
            } else {
                // 일반 사용자 로그인
                socketInstance.emit('login', { username });
            }
        } else {
            loginError.textContent = data.message;
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        loginError.textContent = '서버 오류가 발생했습니다.';
        isProcessing = false;
        setButtonState(loginBtn, false, '로그인');
    });
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
    registerError.textContent = '';
    registerSuccess.textContent = '';
    
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
            registerSuccess.textContent = data.message;
            registerUsername.value = '';
            registerPassword.value = '';
            registerConfirmPassword.value = '';
            
            // JWT 토큰 저장 (즉시 로그인)
            if (data.token) {
                saveToken(data.token);
            }
            
            // 3초 후 로그인 폼으로 전환
            setTimeout(() => {
                showLoginForm();
            }, 3000);
        } else {
            registerError.textContent = data.message;
        }
    })
    .catch(error => {
        console.error('Register error:', error);
        registerError.textContent = '서버 오류가 발생했습니다.';
        isProcessing = false;
        setButtonState(registerBtn, false, '회원가입');
    });
}

// 로그아웃 처리
function handleLogout() {
    // API 로그아웃
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // 소켓 로그아웃 이벤트 발생
            if (currentUser && !currentUser.isAdmin) {
                socketInstance.emit('logout');
            }
            
            // JWT 토큰 삭제
            removeToken();
            
            // 상태 초기화
            currentUser = null;
            
            // 화면 전환
            showAuthScreen();
            
            // 관리자 패널 숨기기
            document.getElementById('admin-panel-button').classList.add('hidden');
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
    });
}

// 인증 화면 표시
function showAuthScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    authScreen.classList.remove('hidden');
    clearFormInputs();
    clearFormMessages();
}

// 로그인/로그아웃 버튼 상태 설정
function setButtonState(button, isLoading, text) {
    button.disabled = isLoading;
    button.innerHTML = isLoading ? 
        `<i class="fas fa-spinner fa-spin"></i> ${text}` : 
        `<i class="fas fa-sign-in-alt"></i> ${text}`;
}

// 소켓 리스너 설정
function setupSocketListeners(socket) {
    // 로그인 응답 처리
    socket.on('login_response', (data) => {
        if (data.success) {
            // 사용자 정보 저장
            saveUserInfo(data.user);
            showMainMenuScreen();
        }
    });
    
    // 잔액 업데이트 처리
    socket.on('balance_update', (data) => {
        if (currentUser) {
            // 현재 사용자 잔액 업데이트
            currentUser.balance = data.balance;
            // 글로벌 객체도 업데이트
            if (window.currentUser) {
                window.currentUser.balance = data.balance;
            }
            // 로컬 스토리지 업데이트
            saveUserInfo(currentUser);
            
            // 메뉴 화면에 표시
            if (document.getElementById('menu-user-balance')) {
                document.getElementById('menu-user-balance').textContent = `$${data.balance.toFixed(2)}`;
            }
        }
    });
}

// 인증 모듈 초기화
export function initAuth(socket) {
    // 소켓 인스턴스 저장
    socketInstance = socket;
    
    // 페이지 로드 시 토큰이 있으면 자동 로그인 시도
    autoLogin().then(success => {
        if (!success) {
            // 자동 로그인 실패 시 로그인 화면 표시
            showAuthScreen();
        }
    });
    
    // 이벤트 리스너 설정
    registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
    });

    loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    // 포커스 애니메이션
    const inputs = document.querySelectorAll('.input-icon-wrapper input');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.parentElement.classList.add('focused');
        });
        input.addEventListener('blur', () => {
            input.parentElement.classList.remove('focused');
        });
    });

    // 로그인 이벤트
    loginBtn.addEventListener('click', handleLogin);
    loginUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginPassword.focus();
    });
    loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // 회원가입 이벤트
    registerBtn.addEventListener('click', handleRegister);
    registerUsername.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') registerPassword.focus();
    });
    registerPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') registerConfirmPassword.focus();
    });
    registerConfirmPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleRegister();
    });

    // 로그아웃 이벤트
    document.querySelectorAll('#logout-btn, #menu-logout-btn, #admin-logout-btn').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });

    // 소켓 리스너 설정
    setupSocketListeners(socket);
    
    // 접근성을 위한 전역 노출
    window.handleLogout = handleLogout;
    window.currentUser = currentUser;
    window.showAuthScreen = showAuthScreen;
}

// 메뉴 화면 표시 (다른 모듈에서 참조하기 위해 export)
export function showMainMenuScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('main-menu-screen').classList.remove('hidden');
    
    // 사용자 정보 업데이트
    if (currentUser) {
        document.getElementById('menu-user-name').textContent = currentUser.username;
        if (!currentUser.isAdmin) {
            document.getElementById('menu-user-balance').textContent = `$${currentUser.balance.toFixed(2)}`;
        } else {
            document.getElementById('menu-user-balance').textContent = '관리자';
        }
    }
} 