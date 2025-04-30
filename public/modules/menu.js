// 메뉴 모듈
import { showMainMenuScreen } from './auth.js';

// DOM 요소
const mainMenuScreen = document.getElementById('main-menu-screen');
const playButtons = document.querySelectorAll('.play-btn');
const adminPanelButton = document.getElementById('admin-panel-button');
const goToAdminBtn = document.getElementById('go-to-admin');

// 게임 화면 표시
function showGameScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('game-screen').classList.remove('hidden');
    
    // 사용자 정보 업데이트
    const currentUser = window.currentUser;
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-balance').textContent = `$${currentUser.balance.toFixed(2)}`;
    }
}

// 관리자 화면 표시
function showAdminScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    document.getElementById('admin-screen').classList.remove('hidden');
}

// 메뉴 모듈 초기화
export function initMenu(socket) {
    // 게임 선택 이벤트
    playButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const game = btn.dataset.game;
            if (game === 'baccarat') {
                showGameScreen();
            } else if (game === 'blackjack') {
                // 사용자 정보 로컬 스토리지에 저장
                localStorage.setItem('user', JSON.stringify(window.currentUser));
                window.location.href = '/blackjack.html';
            }
        });
    });
    
    // 게임 카드 이벤트 - 전체 카드 클릭 시에도 게임으로 이동
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 이미 버튼 클릭 시 이벤트 전파 방지
            if (e.target.closest('.play-btn')) return;
            
            const gameId = card.id;
            if (gameId === 'baccarat-card') {
                showGameScreen();
            } else if (gameId === 'blackjack-card') {
                // 사용자 정보 로컬 스토리지에 저장
                localStorage.setItem('user', JSON.stringify(window.currentUser));
                window.location.href = '/blackjack.html';
            }
        });
    });
    
    // 관리자 페이지로 이동 버튼
    goToAdminBtn.addEventListener('click', () => {
        showAdminScreen();
    });
    
    // 관리자 페이지에서 메뉴로 돌아가기 버튼
    document.getElementById('admin-back-to-menu').addEventListener('click', () => {
        showMainMenuScreen();
    });
    
    // 바카라 게임에서 메뉴로 돌아가기 버튼
    document.getElementById('back-to-menu').addEventListener('click', () => {
        showMainMenuScreen();
    });
    
    // 소켓 이벤트 리스너 설정
    socket.on('online_players_update', players => {
        if (document.getElementById('menu-total-online')) {
            document.getElementById('menu-total-online').textContent = `${players.length}명 접속 중`;
        }
    });
    
    // 접근성을 위한 전역 노출
    window.showGameScreen = showGameScreen;
    window.showAdminScreen = showAdminScreen;
} 