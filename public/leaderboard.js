// 랭킹 및 게임 기록 페이지 스크립트
console.log('랭킹 및 게임 기록 페이지 스크립트 로드됨');

// 전역 변수
let currentUser = window.currentUser || null;
console.log('currentUser 확인:', currentUser);

// 로컬 스토리지 키
const GAME_HISTORY_STORAGE_KEY = 'baccarat_game_history';
const STORAGE_CARDS_KEY = 'baccarat_game_cards';

// DOM 요소
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
const rankingsBody = document.getElementById('rankings-body');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const backToMenuBtn = document.getElementById('back-to-menu');
const logoutBtn = document.getElementById('logout-btn');
const updateTimeDisplay = document.getElementById('update-time');
const refreshBtn = document.getElementById('refresh-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// 소켓 연결
const socket = socketInitFn();
console.log('소켓 연결 생성됨');

// 초기화 함수
function init() {
    console.log("랭킹 및 게임 기록 페이지 초기화 중...");
    
    // 현재 사용자 정보 확인
    if (currentUser) {
        console.log("로컬 스토리지에서 불러온 사용자 정보:", currentUser.username);
        userNameDisplay.textContent = currentUser.username;
        userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    } else {
        console.log("로그인된 사용자 정보가 없습니다.");
        window.location.href = '/';
        return;
    }
    
    // 현재 시간으로 업데이트 시간 표시
    updateLastUpdateTime();
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners();
    
    // 저장된 게임 기록 불러오기
    loadGameHistory();
    
    // 랭킹 및 게임 데이터 요청
    requestGameData();
    
    console.log("랭킹 및 게임 기록 페이지 초기화 완료");
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 탭 전환 이벤트
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // 모든 탭 버튼에서 active 클래스 제거
            tabButtons.forEach(btn => btn.classList.remove('active'));
            // 클릭된 탭 버튼에 active 클래스 추가
            button.classList.add('active');
            
            // 모든 탭 패널 숨기기
            tabPanels.forEach(panel => panel.classList.remove('active'));
            // 선택된 탭 패널만 표시
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // 새로고침 버튼 이벤트
    refreshBtn.addEventListener('click', () => {
        // 회전 애니메이션 추가
        refreshBtn.classList.add('rotating');
        
        // 데이터 새로고침
        requestGameData();
        
        // 1초 후 애니메이션 제거
        setTimeout(() => {
            refreshBtn.classList.remove('rotating');
        }, 1000);
    });
    
    // 메뉴로 돌아가기 버튼
    backToMenuBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // 로그아웃 버튼
    logoutBtn.addEventListener('click', () => {
        // 로컬 스토리지에서 사용자 정보 제거
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        
        // 소켓에 로그아웃 이벤트 전송
        socket.emit('logout');
        
        // 로그인 페이지로 리디렉션
        window.location.href = '/';
    });
    
    // 게임 기록 초기화 버튼
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('게임 기록을 모두 삭제하시겠습니까?')) {
            clearGameHistory();
        }
    });
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    // 소켓 연결 상태 확인
    socket.on('connect', () => {
        console.log('서버에 연결되었습니다.');
        
        // 저장된 사용자 정보가 있는 경우 자동으로 로그인
        if (currentUser && currentUser.username) {
            console.log('자동 로그인 시도:', currentUser.username);
            socket.emit('login', {
                username: currentUser.username
            });
        } else {
            console.log('로그인된 사용자 정보가 없습니다.');
            window.location.href = '/';
        }
    });
    
    // 연결 오류 처리
    socket.on('connect_error', (err) => {
        console.error('연결 오류:', err.message);
        alert('서버 연결 오류: ' + err.message);
    });
    
    // 로그인 응답 처리
    socket.on('login_response', (response) => {
        console.log('로그인 응답:', response);
        
        if (response.success) {
            // 로그인 성공
            updateUserInfo(response.user);
            
            // 게임 데이터 요청
            requestGameData();
        } else {
            // 로그인 실패
            alert(response.message || '로그인에 실패했습니다.');
            
            // 로컬 스토리지 정보가 유효하지 않으면 다시 로그인하도록
            localStorage.removeItem('user');
            
            window.location.href = '/';
        }
    });
    
    // 게임 데이터 수신
    socket.on('game_data', (data) => {
        console.log('게임 데이터 수신:', data);
        updateHistoryList(data.history);
        updateRankings(data.rankings);
        updateLastUpdateTime();
    });
    
    // 랭킹 업데이트
    socket.on('rankings_update', (rankings) => {
        console.log('랭킹 업데이트 수신:', rankings);
        updateRankings(rankings);
        updateLastUpdateTime();
    });
    
    // 게임 완료 이벤트 수신 - 기록 업데이트
    socket.on('game_completed', (gameData) => {
        console.log('게임 완료 알림 수신:', gameData);
        
        // 현재 사용자와 관련된 게임인 경우에만 처리
        if (currentUser && gameData.player === currentUser.username) {
            updateHistory(gameData);
            updateLastUpdateTime();
        }
    });
}

// 게임 데이터 요청
function requestGameData() {
    socket.emit('request_game_data');
    console.log('게임 데이터 요청 전송');
}

// 사용자 정보 업데이트
function updateUserInfo(user) {
    currentUser = user;
    userNameDisplay.textContent = user.username;
    userBalanceDisplay.textContent = `$${user.balance.toFixed(2)}`;
    
    // 로컬 스토리지에도 업데이트
    localStorage.setItem('user', JSON.stringify(user));
}

// 마지막 업데이트 시간 표시
function updateLastUpdateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    updateTimeDisplay.textContent = timeString;
}

// 랭킹 업데이트
function updateRankings(rankings) {
    rankingsBody.innerHTML = '';
    
    if (!Array.isArray(rankings) || rankings.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px;">랭킹 정보가 없습니다.</td>';
        rankingsBody.appendChild(emptyRow);
        return;
    }
    
    rankings.forEach((player, index) => {
        const row = document.createElement('tr');
        const rankCell = document.createElement('td');
        const nameCell = document.createElement('td');
        const profitCell = document.createElement('td');
        const winRateCell = document.createElement('td');
        const totalGamesCell = document.createElement('td');
        
        // 상위 3위는 특별한 스타일 적용
        if (index < 3) {
            row.classList.add(`rank-${index + 1}`);
        }
        
        rankCell.textContent = index + 1;
        
        // 본인인 경우 강조 표시
        if (currentUser && player.username === currentUser.username) {
            nameCell.innerHTML = `<strong>${player.username} (나)</strong>`;
            nameCell.classList.add('current-user');
        } else {
            nameCell.textContent = player.username;
        }
        
        // 수익 표시 (색상으로 구분)
        const profit = player.profit;
        profitCell.textContent = `$${profit.toFixed(2)}`;
        if (profit > 0) {
            profitCell.classList.add('positive');
        } else if (profit < 0) {
            profitCell.classList.add('negative');
        }
        
        // 승률 계산 및 표시
        const total = player.wins + player.losses;
        const winRate = total > 0 ? (player.wins / total * 100).toFixed(1) : '0.0';
        winRateCell.textContent = `${winRate}%`;
        
        // 총 게임 수
        totalGamesCell.textContent = total;
        
        row.appendChild(rankCell);
        row.appendChild(nameCell);
        row.appendChild(profitCell);
        row.appendChild(winRateCell);
        row.appendChild(totalGamesCell);
        
        rankingsBody.appendChild(row);
    });
}

// 게임 기록 목록 업데이트
function updateHistoryList(history) {
    historyList.innerHTML = '';
    
    if (!Array.isArray(history) || history.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.className = 'empty-history';
        emptyItem.textContent = '게임 기록이 없습니다.';
        historyList.appendChild(emptyItem);
        return;
    }
    
    // 최신 기록부터 표시 (최대 20개)
    const recentHistory = history.slice(0, 20);
    
    recentHistory.forEach(item => {
        updateHistory(item, false); // 저장 안함
    });
}

// 게임 기록 항목 추가
function updateHistory(historyItem, shouldSave = true) {
    if (!historyItem) return;
    
    // 게임 아직 진행 중이면 기록 추가하지 않음
    if (historyItem.status && historyItem.status !== 'completed') {
        console.log('완료되지 않은 게임은 기록에 추가하지 않습니다:', historyItem.gameId);
        return;
    }
    
    const { winner, gameId, player, choice, bet, playerScore, bankerScore, isWin, time } = historyItem;
    const li = document.createElement('li');
    li.className = 'history-item';
    
    // 결과에 따른 클래스 설정
    let resultClass = '';
    let resultLabel = '';
    let resultText = '';
    
    if (winner === 'player' || (choice === 'player' && isWin)) {
        resultClass = 'player-win';
        resultLabel = 'P';
        resultText = '플레이어';
    } else if (winner === 'banker' || (choice === 'banker' && isWin)) {
        resultClass = 'banker-win';
        resultLabel = 'B';
        resultText = '뱅커';
    } else if (winner === 'tie' || (choice === 'tie' && isWin)) {
        resultClass = 'tie';
        resultLabel = 'T';
        resultText = '타이';
    } else if (isWin === false) {
        // 패배한 경우 - 선택한 옵션의 반대
        if (choice === 'player') {
            resultClass = 'banker-win';
            resultLabel = 'B';
            resultText = '뱅커';
        } else if (choice === 'banker') {
            resultClass = 'player-win';
            resultLabel = 'P';
            resultText = '플레이어';
        } else {
            resultClass = 'player-banker';
            resultLabel = 'PB';
            resultText = '플레이어/뱅커';
        }
    }
    
    // 게임 ID 표시
    const displayId = gameId ? gameId.toString().slice(-4) : Math.floor(Math.random() * 9000 + 1000);
    
    // 사용자 이름 표시 (현재 사용자인 경우 특별 표시)
    const playerName = player || (currentUser ? currentUser.username : '');
    const isCurrentUser = currentUser && playerName === currentUser.username;
    
    // 베팅 정보 및 선택 정보
    let betChoiceText = choice ? 
        (choice === 'player' ? '플레이어' : (choice === 'banker' ? '뱅커' : '타이')) : '';
    
    const betInfo = choice && bet 
        ? `<span class="history-bet" title="${playerName}의 베팅: ${betChoiceText} $${bet}">${choice.charAt(0).toUpperCase()} $${bet}</span>` 
        : '';
    
    // 점수 정보 추가
    const scoreInfo = playerScore !== undefined && bankerScore !== undefined 
        ? `<span class="history-score" title="플레이어: ${playerScore}, 뱅커: ${bankerScore}">${playerScore}:${bankerScore}</span>` 
        : '';
    
    // 승패 정보
    const winLoseInfo = isWin !== undefined ? 
        `<span class="history-result-text ${isWin ? 'win' : 'lose'}">${isWin ? '승리' : '패배'}</span>` : '';
    
    // 시간 정보
    const timeText = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
    
    li.innerHTML = `
        <div class="history-header">
            <span class="history-id" title="게임 ID: ${displayId}">#${displayId}</span>
            <span class="history-time" title="게임 시간">${timeText}</span>
        </div>
        <div class="history-body">
            <span class="history-result ${resultClass}" title="승리: ${resultText}">${resultLabel}</span>
            ${scoreInfo}
            <div class="history-details">
                <span class="history-player ${isCurrentUser ? 'current-user' : ''}" title="플레이어">${playerName}</span>
                ${betInfo}
                ${winLoseInfo}
            </div>
        </div>
    `;
    
    // 최신 기록을 위에 추가
    historyList.prepend(li);
    
    // 20개 이상이면 삭제
    if (historyList.children.length > 20) {
        historyList.removeChild(historyList.lastChild);
    }
    
    // 로컬 스토리지에 저장 (필요한 경우)
    if (shouldSave) {
        // 저장을 위한 객체 생성 (필요한 정보만 포함)
        const historyToSave = {
            gameId: gameId || displayId,
            time: time || Date.now(),
            player: playerName,
            choice: choice,
            bet: bet,
            playerScore: playerScore,
            bankerScore: bankerScore,
            isWin: isWin,
            winner: winner || resultText,
            status: 'completed'
        };
        saveGameHistory(historyToSave);
    }
}

// 로컬 스토리지에서 게임 기록 불러오기
function loadGameHistory() {
    try {
        const savedHistory = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        if (savedHistory) {
            const gameHistory = JSON.parse(savedHistory);
            
            // 기존 기록 비우기
            historyList.innerHTML = '';
            
            // 현재 사용자의 게임만 필터링
            const userGames = gameHistory.filter(game => 
                game.player === currentUser.username
            );
            
            // 저장된 게임 기록 표시 (최신순)
            userGames.reverse().forEach(item => {
                updateHistory(item, false); // 저장 안함
            });
            
            console.log(`${userGames.length}개의 게임 기록을 불러왔습니다.`);
        }
    } catch (error) {
        console.error('게임 기록을 불러오는 중 오류 발생:', error);
    }
}

// 로컬 스토리지에 게임 기록 저장
function saveGameHistory(historyItem) {
    try {
        // 기존 게임 기록 불러오기
        let gameHistory = [];
        const savedHistory = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        if (savedHistory) {
            gameHistory = JSON.parse(savedHistory);
        }
        
        // 중복 제거 (같은 게임 ID가 있으면 업데이트)
        const index = gameHistory.findIndex(item => item.gameId === historyItem.gameId);
        if (index !== -1) {
            gameHistory[index] = historyItem;
        } else {
            // 새 기록 추가
            gameHistory.push(historyItem);
        }
        
        // 최대 50개만 유지
        if (gameHistory.length > 50) {
            gameHistory = gameHistory.slice(gameHistory.length - 50);
        }
        
        // 저장
        localStorage.setItem(GAME_HISTORY_STORAGE_KEY, JSON.stringify(gameHistory));
    } catch (error) {
        console.error('게임 기록 저장 중 오류 발생:', error);
    }
}

// 게임 기록 클리어 함수
function clearGameHistory() {
    historyList.innerHTML = '';
    
    // 모든 게임 기록을 불러와서 현재 사용자의 게임만 제외하고 다시 저장
    try {
        const savedHistory = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        if (savedHistory) {
            const gameHistory = JSON.parse(savedHistory);
            const filteredHistory = gameHistory.filter(game => 
                game.player !== currentUser.username
            );
            localStorage.setItem(GAME_HISTORY_STORAGE_KEY, JSON.stringify(filteredHistory));
        }
    } catch (error) {
        console.error('게임 기록 삭제 중 오류 발생:', error);
    }
    
    alert('게임 기록이 삭제되었습니다.');
}

// 애니메이션을 위한 클래스 추가
document.addEventListener('DOMContentLoaded', () => {
    // 회전 애니메이션을 위한 CSS 클래스 추가
    const style = document.createElement('style');
    style.textContent = `
        .rotating {
            animation: rotate 1s linear;
        }
        
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
});

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init); 