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
    
    // 이전 게임의 효과 제거
    const gameTable = document.querySelector('.game-table');
    gameTable.classList.remove('win-effect', 'lose-effect');
    
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
    
    // 초기화
    clearCards();
    
    // 카드 애니메이션으로 표시 (번갈아가면서)
    showCardsWithAnimation(playerCards, bankerCards, pCards, bCards, pScore, bScore);
    
    // 결과 표시 (애니메이션 후)
    setTimeout(() => {
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
        
        // 게임 상태만 초기화 (카드는 유지)
        isGameInProgress = false;
        placeBetBtn.disabled = false;
        betOptions.forEach(btn => btn.disabled = false);
        betAmount.disabled = false;
    }, (pCards.length + bCards.length) * 1500 + 500); // 모든 카드 애니메이션 후 0.5초 뒤
}

// 카드 애니메이션으로 표시
function showCardsWithAnimation(playerContainer, bankerContainer, playerCards, bankerCards, playerFinalScore, bankerFinalScore) {
    const allCards = [];
    
    // 플레이어와 뱅커 카드를 번갈아가면서 보여줄 순서 설정
    for (let i = 0; i < Math.max(playerCards.length, bankerCards.length); i++) {
        if (i < playerCards.length) {
            allCards.push({ 
                container: playerContainer, 
                card: playerCards[i], 
                isPlayer: true,
                index: i 
            });
        }
        if (i < bankerCards.length) {
            allCards.push({ 
                container: bankerContainer, 
                card: bankerCards[i], 
                isPlayer: false,
                index: i 
            });
        }
    }
    
    // 점수 계산 함수
    function calculateScore(cards, index) {
        // 바카라 규칙에 따라 index까지의 카드로 점수 계산
        let score = 0;
        for (let i = 0; i <= index; i++) {
            if (i >= cards.length) break;
            
            let value = cards[i].value;
            // 바카라에서 J, Q, K, 10은 0점, A는 1점, 나머지는 숫자 그대로
            if (value === 'J' || value === 'Q' || value === 'K' || value === '10') {
                value = 0;
            } else if (value === 'A') {
                value = 1;
            } else {
                value = parseInt(value);
            }
            score += value;
        }
        // 바카라 규칙: 점수는 한 자리수만 사용 (10이면 0, 15면 5)
        return score % 10;
    }
    
    // 각 카드를 순차적으로 표시
    allCards.forEach((cardInfo, index) => {
        setTimeout(() => {
            // 카드 추가
            const cardElement = createCardElement(cardInfo.card);
            cardInfo.container.appendChild(cardElement);
            
            // 카드 애니메이션 효과
            setTimeout(() => {
                cardElement.classList.add('show');
            }, 50);
            
            // 카드가 추가될 때마다 현재까지의 점수 업데이트
            if (cardInfo.isPlayer) {
                const currentPlayerScore = calculateScore(playerCards, cardInfo.index);
                playerScore.textContent = cardInfo.index === playerCards.length - 1 ? playerFinalScore : currentPlayerScore;
            } else {
                const currentBankerScore = calculateScore(bankerCards, cardInfo.index);
                bankerScore.textContent = cardInfo.index === bankerCards.length - 1 ? bankerFinalScore : currentBankerScore;
            }
            
        }, index * 1500); // 1.5초 간격으로 카드 표시
    });
}

// 개선된 카드 요소 생성
function createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.suit}`;
    cardElement.classList.add('card-animation');
    
    const innerElement = document.createElement('div');
    innerElement.className = 'card-inner';
    
    const frontElement = document.createElement('div');
    frontElement.className = 'card-front';
    
    // 왼쪽 상단 카드 값
    const valueTopElement = document.createElement('div');
    valueTopElement.className = 'card-value-top';
    valueTopElement.textContent = getCardDisplayValue(card.value);
    
    // 왼쪽 상단 무늬
    const suitTopElement = document.createElement('div');
    suitTopElement.className = 'card-suit-top';
    suitTopElement.innerHTML = getSuitSymbol(card.suit);
    
    // 중앙 대형 무늬
    const centerElement = document.createElement('div');
    centerElement.className = 'card-center-suit';
    
    // J, Q, K, A는 특별한, 기호가 아닌 문자로 중앙에 표시
    if (card.value === 'J' || card.value === 'Q' || card.value === 'K' || card.value === 'A') {
        centerElement.textContent = card.value;
        centerElement.style.fontSize = '60px';
        centerElement.style.fontWeight = 'bold';
    } else {
        centerElement.innerHTML = getSuitSymbol(card.suit);
    }
    
    frontElement.appendChild(valueTopElement);
    frontElement.appendChild(suitTopElement);
    frontElement.appendChild(centerElement);
    
    const backElement = document.createElement('div');
    backElement.className = 'card-back';
    
    innerElement.appendChild(frontElement);
    innerElement.appendChild(backElement);
    
    cardElement.appendChild(innerElement);
    return cardElement;
}

// 게임 상태 초기화 (카드는 유지)
function resetGameState() {
    isGameInProgress = false;
    placeBetBtn.disabled = false;
    betOptions.forEach(btn => btn.disabled = false);
    betAmount.disabled = false;
    gameStatus.textContent = '베팅을 선택하세요';
    gameStatus.className = '';
    // 카드는 clearCards()를 호출하지 않아 유지됨
}

// 카드 초기화 (새 게임 시작할 때만 호출)
function clearCards() {
    playerCards.innerHTML = '';
    bankerCards.innerHTML = '';
    playerScore.textContent = '0';
    bankerScore.textContent = '0';
    
    // 이전 게임의 효과 제거
    const gameTable = document.querySelector('.game-table');
    gameTable.classList.remove('win-effect', 'lose-effect');
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
        } else {
            // 새 게임 시작 시 카드 초기화
            clearCards();
        }
    });
    
    // 게임 결과 처리
    socket.on('game_result', (data) => {
        console.log('게임 결과 수신:', data);
        
        // 카드 애니메이션으로 표시
        showCardsWithAnimation(playerCards, bankerCards, data.playerCards, data.bankerCards, data.playerScore, data.bankerScore);
        
        // 결과 표시 (애니메이션 후)
        setTimeout(() => {
            const gameTable = document.querySelector('.game-table');
            
            if (data.isWin) {
                gameStatus.textContent = `승리! $${data.winAmount.toFixed(2)} 획득`;
                gameStatus.className = 'game-status win';
                
                // 승리 화면 효과
                gameTable.classList.add('win-effect');
            } else {
                gameStatus.textContent = `패배! $${data.bet.toFixed(2)} 손실`;
                gameStatus.className = 'game-status lose';
                
                // 패배 화면 효과
                gameTable.classList.add('lose-effect');
            }
            
            // 잔액 업데이트
            if (data.newBalance !== undefined) {
                document.getElementById('user-balance').textContent = `$${data.newBalance.toFixed(2)}`;
                if (window.currentUser) {
                    window.currentUser.balance = data.newBalance;
                }
            }
            
            // 히스토리 항목 추가
            if (data.historyItem) {
                updateHistory(data.historyItem);
            }
            
            // 게임 상태 초기화 (카드는 유지)
            isGameInProgress = false;
            placeBetBtn.disabled = false;
            betOptions.forEach(btn => btn.disabled = false);
            betAmount.disabled = false;
        }, (data.playerCards.length + data.bankerCards.length) * 1500 + 500);
    });
    
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
    placeBetBtn.addEventListener('click', () => {
        // 새 게임 시작 시 카드 초기화
        clearCards();
        handlePlaceBet();
    });
    
    // 채팅 이벤트
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners(socket);
} 