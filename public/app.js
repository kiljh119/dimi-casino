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