// 메뉴 모듈

// DOM 요소
const mainMenuScreen = document.getElementById('main-menu-screen');
const playButtons = document.querySelectorAll('.play-btn');
const adminPanelButton = document.getElementById('admin-panel-button');
const goToAdminBtn = document.getElementById('go-to-admin');
const adminScreen = document.getElementById('admin-screen');
const goToMyPageBtn = document.getElementById('go-to-mypage');

// 관리자 화면 표시
function showAdminScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    adminScreen.classList.remove('hidden');
}

// 메인 메뉴 화면 표시
function showMainMenuScreen() {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
    mainMenuScreen.classList.remove('hidden');
    
    // 사용자 정보 업데이트
    updateUserInfo();
}

// 사용자 정보 업데이트 함수
function updateUserInfo() {
    const currentUser = window.app?.currentUser;
    if (currentUser) {
        document.getElementById('menu-user-name').textContent = currentUser.username;
        if (!currentUser.isAdmin) {
            document.getElementById('menu-user-balance').textContent = `$${currentUser.balance.toFixed(2)}`;
        } else {
            document.getElementById('menu-user-balance').textContent = '관리자';
        }
    }
}

// 서버에서 최신 사용자 정보 요청
function requestUserUpdate(socket) {
    if (!socket) return;
    
    const currentUser = window.app?.currentUser;
    if (currentUser && !currentUser.isAdmin) {
        console.log('서버에 사용자 정보 업데이트 요청:', currentUser.username);
        socket.emit('request_user_info', { username: currentUser.username });
    }
}

// 메뉴 모듈 초기화
export function initMenu(socket) {
    // 게임 선택 이벤트 - <a> 태그로 변경되어 이 이벤트는 더 이상 필요하지 않지만 코드는 유지
    playButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            // 기본 동작 방지 (a 태그 링크 이동 방지)
            e.preventDefault();
            console.log('게임 선택 버튼 클릭:', this.dataset.game);
            
            // 게임 종류에 따라 처리
            const game = this.dataset.game;
            if (game === 'baccarat' || game === 'ranking' || game === 'chat') {
                // 사용자 정보 로컬 스토리지에 저장
                if (window.app?.currentUser) {
                    console.log('게임 이동 전 사용자 정보 저장:', window.app.currentUser);
                    localStorage.setItem('user', JSON.stringify(window.app.currentUser));
                    // 해당 게임 페이지로 이동
                    window.location.href = `/${game}.html`;
                } else {
                    console.error('로그인 정보가 없습니다. 로그인 페이지로 이동합니다.');
                    window.location.href = 'login.html';
                }
            }
        });
    });
    
    // 게임 카드 이벤트 - 전체 카드 클릭 시에도 게임으로 이동
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // 이미 버튼 클릭 시 이벤트 전파 방지
            if (e.target.closest('.play-btn')) return;
            
            const gameId = card.id;
            let gameName = '';
            
            if (gameId === 'baccarat-card') {
                gameName = 'baccarat';
            } else if (gameId === 'ranking-card') {
                gameName = 'ranking';
            } else if (gameId === 'chat-card') {
                gameName = 'chat';
            }
            
            if (gameName) {
                // 사용자 정보 로컬 스토리지에 저장
                if (window.app?.currentUser) {
                    console.log('게임 이동 전 사용자 정보 저장 (카드 클릭):', window.app.currentUser);
                    localStorage.setItem('user', JSON.stringify(window.app.currentUser));
                    // 해당 게임 페이지로 이동
                    window.location.href = `/${gameName}.html`;
                } else {
                    console.error('로그인 정보가 없습니다. 로그인 페이지로 이동합니다.');
                    window.location.href = 'login.html';
                }
            }
        });
    });
    
    // 마이페이지로 이동 버튼
    if (goToMyPageBtn) {
        goToMyPageBtn.addEventListener('click', () => {
            // 사용자 정보 로컬 스토리지에 저장
            if (window.app?.currentUser) {
                console.log('마이페이지 이동 전 사용자 정보 저장:', window.app.currentUser);
                localStorage.setItem('user', JSON.stringify(window.app.currentUser));
                // 마이페이지로 이동
                window.location.href = '/my-page.html';
            }
        });
    }
    
    // 관리자 페이지로 이동 버튼
    goToAdminBtn.addEventListener('click', () => {
        showAdminScreen();
    });
    
    // 관리자 페이지에서 메뉴로 돌아가기 버튼
    document.getElementById('admin-back-to-menu').addEventListener('click', () => {
        showMainMenuScreen();
    });
    
    // 로그아웃 버튼 이벤트
    document.querySelectorAll('#logout-btn, #menu-logout-btn, #admin-logout-btn').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });
    
    // 소켓 이벤트 리스너 설정
    socket.on('online_players_update', players => {
        if (document.getElementById('menu-total-online')) {
            document.getElementById('menu-total-online').textContent = `${players.length}명 접속 중`;
        }
    });
    
    // 사용자 정보 업데이트 이벤트 처리
    socket.on('user_info_update', (userData) => {
        console.log('사용자 정보 업데이트 수신:', userData);
        
        if (window.app?.currentUser && userData.username === window.app.currentUser.username) {
            // 전역 사용자 정보 업데이트
            window.app.currentUser.balance = userData.balance;
            
            // 화면 업데이트
            updateUserInfo();
            
            // 로컬 스토리지 업데이트
            localStorage.setItem('user', JSON.stringify(window.app.currentUser));
        }
    });
    
    // 페이지 로드 시 사용자 정보 요청
    requestUserUpdate(socket);
    
    // 접근성을 위한 전역 노출
    window.showAdminScreen = showAdminScreen;
    window.showMainMenuScreen = showMainMenuScreen;
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
            // JWT 토큰 삭제
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            
            // 로그인 페이지로 리디렉션
            window.location.href = 'login.html';
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
    });
} 