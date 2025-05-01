// 소켓 연결
const socket = io();

// 모듈 가져오기
import { initMenu } from './modules/menu.js';

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// 토큰 가져오기
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// 사용자 정보 가져오기
function getUserInfo() {
    try {
        // 먼저 USER_KEY로 시도
        let userJson = localStorage.getItem(USER_KEY);
        
        // USER_KEY로 찾지 못했다면 'user' 키로 시도
        if (!userJson) {
            userJson = localStorage.getItem('user');
            if (userJson) {
                console.log("`user` 키에서 사용자 정보 찾음");
            }
        } else {
            console.log("USER_KEY에서 사용자 정보 찾음");
        }
        
        if (!userJson) {
            return null;
        }
        
        // JSON 파싱 및 반환
        const userData = JSON.parse(userJson);
        
        // 관리자 권한 확인 및 표준화
        if (userData) {
            // 1. is_admin 값을 isAdmin으로 변환
            if (userData.isAdmin === undefined && userData.is_admin !== undefined) {
                userData.isAdmin = userData.is_admin === 1 || userData.is_admin === true;
                console.log('is_admin을 isAdmin으로 변환:', userData.isAdmin);
            }
            
            // 2. 사용자명이 admin인 경우 무조건 관리자 권한 부여
            if (userData.username && userData.username.toLowerCase() === 'admin') {
                userData.isAdmin = true;
                userData.is_admin = true;
                console.log('admin 계정 - 관리자 권한 부여됨');
            }
            
            // 3. is_admin이 true이면 isAdmin도 true로 설정
            if (userData.is_admin === true || userData.is_admin === 1) {
                userData.isAdmin = true;
                console.log('is_admin 속성 감지 - 관리자 권한 부여됨');
            }
            
            console.log('최종 사용자 관리자 여부:', userData.isAdmin);
        }
        
        return userData;
    } catch (e) {
        console.error('사용자 정보 가져오기 오류:', e);
        return null;
    }
}

// 로그아웃 처리
function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.href = 'login.html';
}

// 사용자 정보 화면에 표시
function displayUserInfo(user) {
    const userNameElement = document.getElementById('menu-user-name');
    const userBalanceElement = document.getElementById('menu-user-balance');
    
    if (userNameElement && user) {
        userNameElement.textContent = user.username;
    }
    
    if (userBalanceElement && user) {
        // 관리자 여부 - isAdmin 또는 is_admin 필드 확인
        const isAdminUser = user.isAdmin === true || user.is_admin === 1 || user.is_admin === true;
        
        if (!isAdminUser) {
            userBalanceElement.textContent = `$${user.balance.toFixed(2)}`;
        } else {
            userBalanceElement.textContent = '관리자';
        }
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 로그인 상태 확인
    const token = getToken();
    const user = getUserInfo();
    
    if (!token || !user) {
        // 로그인되어 있지 않으면 로그인 페이지로 리디렉션
        window.location.href = 'login.html';
        return;
    }
    
    // 디버깅: 사용자 정보 출력
    console.log('현재 사용자 정보:', user);
    console.log('관리자 권한 여부:', user.isAdmin === true ? "관리자 맞음" : "관리자 아님");
    
    // 사용자 정보 화면에 표시
    displayUserInfo(user);
    
    // 소켓 이벤트 설정
    setupSocketListeners();
    
    // 모듈 초기화
    initMenu(socket);
    
    // 전역 객체 설정 (모듈 간 데이터 공유)
    window.app = {
        socket,
        currentUser: user
    };
    
    // 관리자 패널 표시 여부 결정
    const isAdminUser = user && (user.isAdmin === true || user.is_admin === 1 || user.is_admin === true || user.username.toLowerCase() === 'admin');
    
    if (isAdminUser) {
        // 디버깅: DOM 확인
        console.log('관리자 계정 확인됨:', user.username);
        
        // 새로운 관리자 버튼 처리
        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            adminLink.style.display = 'inline-block';
            adminLink.classList.add('admin-visible');
            console.log('관리자 링크 표시됨');
        } else {
            console.error('관리자 링크 요소를 찾을 수 없음');
            
            // 버튼이 없으면 직접 생성
            const headerDiv = document.querySelector(".header-actions");
            if (headerDiv) {
                const link = document.createElement("a");
                link.href = "admin.html";
                link.id = "admin-link";
                link.className = "admin-visible";
                link.innerHTML = '<i class="fas fa-cogs"></i> 관리자 페이지';
                link.style.display = 'inline-block';
                
                headerDiv.insertBefore(link, headerDiv.firstChild);
                console.log("관리자 링크 새로 생성됨");
            }
        }
    } else {
        console.log('일반 사용자 계정:', user ? user.username : '없음');
        // 일반 사용자인 경우 관리자 버튼을 확실히 숨김
        const adminLink = document.getElementById('admin-link');
        if (adminLink) {
            adminLink.style.display = 'none';
            adminLink.classList.remove('admin-visible');
        }
    }
    
    // 소켓 연결 및 로그인 이벤트 발생
    socket.emit('login', { username: user.username });
});

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    // 강제 로그아웃 이벤트 처리
    socket.on('forced_logout', (data) => {
        console.log('강제 로그아웃:', data.message);
        
        // 알림 표시
        alert(data.message);
        
        // 로그아웃 처리
        handleLogout();
    });
    
    // 잔액 업데이트 이벤트 처리
    socket.on('balance_update', (data) => {
        // 현재 사용자의 잔액 업데이트
        const user = getUserInfo();
        if (user && user.username === data.username) {
            user.balance = data.balance;
            localStorage.setItem(USER_KEY, JSON.stringify(user));
            
            // 화면 업데이트
            const userBalanceElement = document.getElementById('menu-user-balance');
            if (userBalanceElement) {
                userBalanceElement.textContent = `$${data.balance.toFixed(2)}`;
            }
            
            // 전역 객체 업데이트
            if (window.app && window.app.currentUser) {
                window.app.currentUser.balance = data.balance;
            }
        }
    });
}