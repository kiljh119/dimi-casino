// 소켓 연결
const socket = io();

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// 토큰 및 사용자 정보 가져오기
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUserInfo() {
    const userJson = localStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
}

// 토큰 갱신
function refreshToken() {
    const currentToken = getToken();
    if (!currentToken) return Promise.reject('토큰이 없습니다.');
    
    return fetch('/api/verify-token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.token) {
            // 새 토큰 저장
            localStorage.setItem(TOKEN_KEY, data.token);
            return data.token;
        } else {
            throw new Error(data.message || '토큰 갱신에 실패했습니다.');
        }
    });
}

// 로그아웃 처리
function handleLogout() {
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            window.location.href = 'login.html';
        }
    })
    .catch(error => {
        console.error('Logout error:', error);
    });
}

// 사용자 정보 화면에 표시
function displayUserInfo(user) {
    // 헤더 정보
    document.getElementById('user-name').textContent = user.username;
    
    if (!user.isAdmin) {
        document.getElementById('user-balance').textContent = `$${user.balance.toFixed(2)}`;
    } else {
        document.getElementById('user-balance').textContent = '관리자';
    }
    
    // 계정 정보 섹션
    document.getElementById('account-username').textContent = user.username;
    document.getElementById('account-balance').textContent = `$${user.balance.toFixed(2)}`;
    
    // 추가 정보 가져오기
    fetchUserDetails(user.id);
}

// 사용자 상세 정보 가져오기
function fetchUserDetails(userId) {
    console.log('사용자 상세 정보 요청 시작');
    const token = getToken();
    
    if (!token) {
        console.error('토큰이 없습니다. 로그인 페이지로 리디렉션합니다.');
        window.location.href = 'login.html';
        return;
    }
    
    console.log('사용자 상세 정보 요청 토큰:', token.substring(0, 20) + '...');
    
    fetch(`/api/user/details`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        console.log('사용자 상세 정보 응답 상태:', response.status);
        
        if (response.status === 401 || response.status === 403) {
            console.log('인증 오류 발생, 토큰 갱신 시도');
            // 토큰이 유효하지 않은 경우
            return refreshToken()
                .then(newToken => {
                    console.log('토큰 갱신 성공, 새 토큰으로 재시도');
                    // 새 토큰으로 다시 시도
                    return fetch(`/api/user/details`, {
                        headers: {
                            'Authorization': `Bearer ${newToken}`
                        }
                    });
                })
                .catch(err => {
                    console.error('토큰 갱신 실패:', err);
                    // 토큰 갱신에 실패한 경우 사용자에게 알림
                    alert('세션이 만료되었습니다. 다시 로그인해주세요.');
                    // 로컬 스토리지 초기화
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(USER_KEY);
                    // 로그인 페이지로 리디렉션
                    window.location.href = 'login.html';
                    throw new Error('토큰 갱신 실패');
                });
        }
        return response;
    })
    .then(response => response.json())
    .then(data => {
        console.log('사용자 상세 정보 응답 데이터:', data);
        
        if (data.success) {
            const user = data.user;
            
            // 사용자 정보 업데이트
            document.getElementById('account-wins').textContent = user.wins || 0;
            document.getElementById('account-losses').textContent = user.losses || 0;
            document.getElementById('account-profit').textContent = `$${(user.profit || 0).toFixed(2)}`;
            
            // 가입일 포맷팅
            if (user.created_at) {
                const date = new Date(user.created_at);
                document.getElementById('account-created').textContent = date.toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            // 게임 히스토리 가져오기
            fetchGameHistory();
        } else {
            console.error('사용자 상세 정보 요청 실패:', data.message);
        }
    })
    .catch(error => {
        console.error('사용자 상세 정보 요청 중 오류 발생:', error);
    });
}

// 게임 히스토리 가져오기
function fetchGameHistory() {
    const token = getToken();
    
    fetch('/api/history', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.history && data.history.length > 0) {
            renderGameHistory(data.history);
            document.getElementById('no-history-message').style.display = 'none';
        } else {
            document.getElementById('no-history-message').style.display = 'flex';
        }
    })
    .catch(error => {
        console.error('Error fetching game history:', error);
    });
}

// 게임 히스토리 렌더링
function renderGameHistory(history) {
    const tableBody = document.getElementById('game-history-table');
    tableBody.innerHTML = '';
    
    history.forEach(record => {
        const row = document.createElement('tr');
        
        // 날짜 및 시간 포맷팅
        const date = new Date(record.created_at);
        const formattedDate = date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>
                <span class="result-badge ${record.game_result}">${
                    record.game_result === 'player' ? '플레이어' : 
                    record.game_result === 'banker' ? '뱅커' : '타이'
                }</span>
            </td>
            <td>$${record.amount.toFixed(2)}</td>
            <td>
                <span class="result-badge ${record.win_lose === 'win' ? 'win' : 'lose'}">
                    ${record.win_lose === 'win' ? '승리' : '패배'}
                </span>
            </td>
            <td>${record.player_score}</td>
            <td>${record.banker_score}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// 비밀번호 변경 함수
function changePassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageElement = document.getElementById('password-message');
    
    // 필드 검증
    if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage(messageElement, '모든 필드를 입력해주세요.', 'error');
        return;
    }
    
    // 새 비밀번호 확인
    if (newPassword !== confirmPassword) {
        showMessage(messageElement, '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', 'error');
        return;
    }
    
    // 비밀번호 복잡성 검사
    if (newPassword.length < 6) {
        showMessage(messageElement, '비밀번호는 최소 6자 이상이어야 합니다.', 'error');
        return;
    }
    
    // API 호출
    const token = getToken();
    console.log('비밀번호 변경 요청 전 토큰:', token ? token.substring(0, 20) + '...' : 'undefined');
    
    // 토큰 갱신 시도
    refreshToken()
        .then(newToken => {
            console.log('새로 갱신된 토큰으로 비밀번호 변경 시도');
            
            return fetch('/api/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${newToken}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword
                })
            });
        })
        .catch(err => {
            console.log('토큰 갱신 실패, 기존 토큰으로 시도:', err);
            
            return fetch('/api/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword
                })
            });
        })
        .then(response => {
            console.log('서버 응답 상태:', response.status);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                showMessage(messageElement, '비밀번호가 성공적으로 변경되었습니다.', 'success');
                // 폼 초기화
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } else {
                showMessage(messageElement, data.message || '비밀번호 변경에 실패했습니다.', 'error');
            }
        })
        .catch(error => {
            console.error('Error changing password:', error);
            showMessage(messageElement, '서버 오류가 발생했습니다.', 'error');
        });
}

// 메시지 표시 함수
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
    
    // 5초 후 메시지 숨김
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
    // 로그인 상태 확인
    const token = getToken();
    const user = getUserInfo();
    
    if (!token || !user) {
        // 로그인되어 있지 않으면 로그인 페이지로 리디렉션
        window.location.href = 'login.html';
        return;
    }
    
    // 토큰 갱신 시도
    console.log('페이지 로드 시 토큰 갱신 시도');
    refreshToken()
        .then(newToken => {
            console.log('페이지 로드 시 토큰 갱신 성공');
            // 사용자 정보 표시
            displayUserInfo(user);
        })
        .catch(error => {
            console.error('페이지 로드 시 토큰 갱신 실패:', error);
            // 토큰 갱신에 실패했지만, 기존 토큰으로 계속 시도
            displayUserInfo(user);
        });
    
    // 메뉴로 돌아가기 버튼
    document.getElementById('back-to-menu').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // 로그아웃 버튼
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // 비밀번호 변경 버튼
    document.getElementById('change-password-btn').addEventListener('click', changePassword);
    
    // 소켓 이벤트 설정
    socket.on('balance_update', (data) => {
        // 현재 사용자의 잔액 업데이트
        if (user && user.username === data.username) {
            user.balance = data.balance;
            localStorage.setItem(USER_KEY, JSON.stringify(user));
            
            // 화면 업데이트
            document.getElementById('user-balance').textContent = `$${data.balance.toFixed(2)}`;
            document.getElementById('account-balance').textContent = `$${data.balance.toFixed(2)}`;
        }
    });
}); 