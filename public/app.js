// 소켓 연결
const socket = io();

// 모듈 가져오기
import { initAuth, showMainMenuScreen } from './modules/auth.js';
import { initBaccarat } from './modules/baccarat.js';
import { initMenu } from './modules/menu.js';
import { initAdmin } from './modules/admin.js';

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 모듈 초기화
    initAuth(socket);
    initBaccarat(socket);
    initMenu(socket);
    initAdmin(socket);
    
    // 전역 객체 설정 (모듈 간 데이터 공유)
    window.app = {
        socket,
        showMainMenuScreen
    };
});