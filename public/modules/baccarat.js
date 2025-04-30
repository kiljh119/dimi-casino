// 바카라 게임 모듈

// DOM 요소
const gameScreen = document.getElementById('game-screen');
const playerCards = document.getElementById('player-cards');
const bankerCards = document.getElementById('banker-cards');
const playerScore = document.getElementById('player-score');
const bankerScore = document.getElementById('banker-score');
const gameStatus = document.getElementById('game-status');
const betOptions = document.querySelectorAll('.bet-btn');
const betAmount = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const historyList = document.getElementById('history-list');
const rankingsBody = document.getElementById('rankings-body');
const onlinePlayersList = document.getElementById('online-players-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// 전역 변수
let selectedBet = null;
let isGameInProgress = false;
let socketInstance = null; // 소켓 인스턴스

// 베팅 처리
function handlePlaceBet() {
    if (isGameInProgress) return;
    
    const amount = parseFloat(betAmount.value);
    if (!selectedBet || isNaN(amount) || amount <= 0) {
        gameStatus.textContent = '베팅 옵션과 금액을 선택해주세요.';
        gameStatus.className = 'error';
        return;
    }
    
    isGameInProgress = true;
    placeBetBtn.disabled = true;
    betOptions.forEach(btn => btn.disabled = true);
    betAmount.disabled = true;
    gameStatus.textContent = '게임 진행 중...';
    gameStatus.className = '';
    
    // 소켓을 통해 베팅 요청
    socketInstance.emit('place_bet', {
        choice: selectedBet,
        amount: amount
    });
}

// 베팅 UI 업데이트
function updateBetUI() {
    placeBetBtn.disabled = !selectedBet || isNaN(parseFloat(betAmount.value)) || parseFloat(betAmount.value) <= 0;
}

// 게임 결과 표시
function displayGameResult(result) {
    const { gameId, playerCards: pCards, bankerCards: bCards, playerScore: pScore, bankerScore: bScore, isWin, winAmount, balance } = result;
    
    // 카드 표시
    displayCards(playerCards, pCards);
    displayCards(bankerCards, bCards);
    
    // 점수 표시
    playerScore.textContent = pScore;
    bankerScore.textContent = bScore;
    
    // 결과 표시
    if (isWin) {
        gameStatus.textContent = `승리! $${winAmount.toFixed(2)} 획득`;
        gameStatus.className = 'win';
    } else {
        gameStatus.textContent = `패배! $${parseFloat(betAmount.value).toFixed(2)} 손실`;
        gameStatus.className = 'lose';
    }
    
    // 잔액 업데이트
    document.getElementById('user-balance').textContent = `$${balance.toFixed(2)}`;
    window.currentUser.balance = balance;
    
    // 게임 상태 초기화
    setTimeout(resetGameState, 3000);
}

// 게임 상태 초기화
function resetGameState() {
    isGameInProgress = false;
    placeBetBtn.disabled = false;
    betOptions.forEach(btn => btn.disabled = false);
    betAmount.disabled = false;
    clearCards();
    gameStatus.textContent = '베팅을 선택하세요';
    gameStatus.className = '';
}

// 카드 표시
function displayCards(container, cards) {
    container.innerHTML = '';
    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.suit}`;
        
        const valueElement = document.createElement('div');
        valueElement.className = 'value';
        valueElement.textContent = getCardDisplayValue(card.value);
        
        const suitElement = document.createElement('div');
        suitElement.className = 'suit';
        suitElement.innerHTML = getSuitSymbol(card.suit);
        
        cardElement.appendChild(valueElement);
        cardElement.appendChild(suitElement);
        container.appendChild(cardElement);
    });
}

// 카드 초기화
function clearCards() {
    playerCards.innerHTML = '';
    bankerCards.innerHTML = '';
    playerScore.textContent = '0';
    bankerScore.textContent = '0';
}

// 카드 값 표시 변환
function getCardDisplayValue(value) {
    if (value === 'A') return 'A';
    if (value === 'J') return 'J';
    if (value === 'Q') return 'Q';
    if (value === 'K') return 'K';
    return value;
}

// 카드 무늬 심볼 변환
function getSuitSymbol(suit) {
    switch (suit) {
        case 'hearts': return '♥';
        case 'diamonds': return '♦';
        case 'clubs': return '♣';
        case 'spades': return '♠';
        default: return '';
    }
}

// 유저 정보 업데이트
function updateUserInfo() {
    // 현재 로그인한 사용자 정보 표시
    const currentUser = window.currentUser;
    if (currentUser) {
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-balance').textContent = `$${currentUser.balance.toFixed(2)}`;
    }
}

// 히스토리 리스트 업데이트
function updateHistoryList(history) {
    historyList.innerHTML = '';
    history.forEach(item => {
        const li = document.createElement('li');
        li.className = item.includes('승리!') ? 'win' : 'lose';
        li.textContent = item;
        historyList.appendChild(li);
    });
}

// 히스토리 항목 추가
function updateHistory(historyItem) {
    // 첫 번째 항목으로 추가
    const li = document.createElement('li');
    li.className = historyItem.includes('승리!') ? 'win' : 'lose';
    li.textContent = historyItem;
    
    if (historyList.firstChild) {
        historyList.insertBefore(li, historyList.firstChild);
    } else {
        historyList.appendChild(li);
    }
    
    // 최대 50개 유지
    while (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
}

// 랭킹 업데이트
function updateRankings(rankings) {
    rankingsBody.innerHTML = '';
    
    rankings.forEach((rank, index) => {
        const tr = document.createElement('tr');
        
        const rankCell = document.createElement('td');
        rankCell.textContent = index + 1;
        
        const usernameCell = document.createElement('td');
        usernameCell.textContent = rank.username;
        
        const profitCell = document.createElement('td');
        profitCell.textContent = `$${parseFloat(rank.profit).toFixed(2)}`;
        profitCell.className = parseFloat(rank.profit) >= 0 ? 'positive' : 'negative';
        
        const gamesCell = document.createElement('td');
        gamesCell.textContent = rank.games;
        
        const winRateCell = document.createElement('td');
        winRateCell.textContent = `${rank.winRate}%`;
        
        tr.appendChild(rankCell);
        tr.appendChild(usernameCell);
        tr.appendChild(profitCell);
        tr.appendChild(gamesCell);
        tr.appendChild(winRateCell);
        
        rankingsBody.appendChild(tr);
    });
}

// 온라인 플레이어 업데이트
function updateOnlinePlayers(players) {
    onlinePlayersList.innerHTML = '';
    
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player;
        
        if (window.currentUser && player === window.currentUser.username) {
            li.className = 'current-user';
        }
        
        onlinePlayersList.appendChild(li);
    });
}

// 채팅 메시지 전송
function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    socketInstance.emit('chat_message', message);
    chatInput.value = '';
}

// 채팅 메시지 추가
function addChatMessage(message) {
    const li = document.createElement('li');
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-name';
    nameSpan.textContent = message.username;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = message.text;
    
    li.appendChild(timeSpan);
    li.appendChild(nameSpan);
    li.appendChild(textSpan);
    
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 시스템 메시지 추가
function addSystemMessage(text) {
    const li = document.createElement('li');
    li.className = 'system-message';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = text;
    
    li.appendChild(timeSpan);
    li.appendChild(textSpan);
    
    chatMessages.appendChild(li);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners(socket) {
    // 베팅 결과 처리
    socket.on('bet_response', (data) => {
        if (!data.success) {
            isGameInProgress = false;
            placeBetBtn.disabled = false;
            betOptions.forEach(btn => btn.disabled = false);
            betAmount.disabled = false;
            
            gameStatus.textContent = data.message;
            gameStatus.className = 'error';
        }
    });
    
    // 게임 결과 처리
    socket.on('game_result', displayGameResult);
    
    // 채팅 메시지 처리
    socket.on('chat_message', addChatMessage);
    
    // 시스템 메시지 처리
    socket.on('system_message', (message) => {
        addSystemMessage(message);
    });
    
    // 온라인 플레이어 업데이트
    socket.on('online_players_update', updateOnlinePlayers);
    
    // 랭킹 업데이트
    socket.on('rankings_update', updateRankings);
    
    // 히스토리 업데이트
    socket.on('history_update', updateHistory);
}

// 바카라 게임 모듈 초기화
export function initBaccarat(socket) {
    // 소켓 인스턴스 저장
    socketInstance = socket;
    
    // 베팅 선택 이벤트
    betOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            betOptions.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedBet = btn.dataset.choice;
            updateBetUI();
        });
    });
    
    // 베팅 금액 이벤트
    betAmount.addEventListener('input', updateBetUI);
    
    // 베팅 확정 이벤트
    placeBetBtn.addEventListener('click', handlePlaceBet);
    
    // 채팅 이벤트
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners(socket);
} 