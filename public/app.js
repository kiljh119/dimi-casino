// 소켓 연결
const socket = io();

// 모듈 가져오기
import { initMenu } from './modules/menu.js';
import { initAdmin } from './modules/admin.js';

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// 토큰 가져오기
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// 사용자 정보 가져오기
function getUserInfo() {
    const userJson = localStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
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
        if (!user.isAdmin) {
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
    
    // 사용자 정보 화면에 표시
    displayUserInfo(user);
    
    // 소켓 이벤트 설정
    setupSocketListeners();
    
    // 모듈 초기화
    initMenu(socket);
    initAdmin(socket);
    
    // 전역 객체 설정 (모듈 간 데이터 공유)
    window.app = {
        socket,
        currentUser: user
    };
    
    // 관리자 패널 표시 여부 결정
    if (user.isAdmin) {
        document.getElementById('admin-panel-button').classList.remove('hidden');
    }
    
    // 소켓 연결 및 로그인 이벤트 발생
    if (!user.isAdmin) {
        socket.emit('login', { username: user.username });
    }
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