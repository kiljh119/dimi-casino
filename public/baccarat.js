// 바카라 게임 모듈
console.log('바카라 게임 스크립트 로드됨');

// 로컬 스토리지에서 사용자 데이터는 이미 HTML에서 로드했으므로 생략
// window.currentUser 변수 사용
let currentUser = window.currentUser || null;
console.log('currentUser 확인:', currentUser);

// 소켓 연결
const socket = socketInitFn(); // 페이지에서 정의된 socketInitFn 사용
console.log('소켓 연결 생성됨');

// DOM 요소
console.log('DOM 요소 선택 시작');
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
const backToMenuBtn = document.getElementById('back-to-menu');
const logoutBtn = document.getElementById('logout-btn');
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
console.log('DOM 요소 선택 완료');

// 디버깅: DOM 요소 확인
console.log('베팅 버튼:', betOptions);
console.log('베팅 확정 버튼:', placeBetBtn);

// 전역 변수
let selectedBet = null;
let isGameInProgress = false;

// 전역 변수에 로컬 스토리지 키 추가
const CHAT_STORAGE_KEY = 'baccarat_chat_history';
const GAME_HISTORY_STORAGE_KEY = 'baccarat_game_history';
const STORAGE_MAX_ITEMS = 50; // 최대 저장 항목 수

// 전역 변수에 모달 관련 변수 추가
const STORAGE_CARDS_KEY = 'baccarat_game_cards';

// 페이지 로드 시 로컬 스토리지 데이터로 화면 초기 설정
if (currentUser) {
    userNameDisplay.textContent = currentUser.username;
    userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    console.log('사용자 정보 화면에 표시됨');
}

// 베팅 처리
function handlePlaceBet() {
    console.log('베팅 처리 함수 호출됨');
    
    if (isGameInProgress) {
        console.log('이미 게임이 진행 중입니다.');
        return;
    }
    
    if (!currentUser || !currentUser.username) {
        console.error('로그인 정보가 없습니다.');
        gameStatus.textContent = '로그인이 필요합니다';
        gameStatus.className = 'error';
        
        // 로그인 페이지로 리디렉션
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
        return;
    }
    
    const amount = parseFloat(betAmount.value);
    if (!selectedBet || isNaN(amount) || amount <= 0) {
        gameStatus.textContent = '베팅 옵션과 금액을 선택해주세요.';
        gameStatus.className = 'error';
        console.log('베팅 옵션이나 금액이 유효하지 않습니다.');
        return;
    }
    
    console.log(`베팅 정보: ${selectedBet}, 금액: ${amount}`);
    
    isGameInProgress = true;
    placeBetBtn.disabled = true;
    betOptions.forEach(btn => btn.disabled = true);
    betAmount.disabled = true;
    gameStatus.textContent = '게임 진행 중...';
    gameStatus.className = '';
    
    // 이전 게임의 효과 제거
    const gameTable = document.querySelector('.game-table');
    gameTable.classList.remove('win-effect', 'lose-effect');
    
    // 소켓을 통해 베팅 요청 (사용자 정보도 함께 전송)
    console.log('place_bet 이벤트 발생:', { username: currentUser.username, choice: selectedBet, amount: amount });
    socket.emit('place_bet', {
        username: currentUser.username,
        choice: selectedBet,
        amount: amount
    });
}

// 베팅 UI 업데이트
function updateBetUI() {
    console.log('베팅 UI 업데이트, 선택된 베팅:', selectedBet);
    placeBetBtn.disabled = !selectedBet || isNaN(parseFloat(betAmount.value)) || parseFloat(betAmount.value) <= 0;
}

// 게임 결과 표시
function displayGameResult(result) {
    console.log('게임 결과 표시:', result);
    
    // 결과 데이터 추출
    const { gameId, playerCards, bankerCards, playerScore, bankerScore, isWin, winAmount, bet, newBalance, choice } = result;
    
    // 나중에 사용하기 위해 마지막 게임 결과 저장
    window.lastGameResult = { ...result, status: 'completed' };
    
    // 초기화
    clearCards();
    
    // 게임 테이블 요소 가져오기
    const gameTable = document.querySelector('.game-table');
    
    // 이전 효과 제거
    gameTable.classList.remove('win-effect', 'lose-effect');
    
    // 카드 애니메이션으로 표시 (번갈아가면서)
    const playerContainer = document.getElementById('player-cards');
    const bankerContainer = document.getElementById('banker-cards');
    
    showCardsWithAnimation(playerContainer, bankerContainer, playerCards, bankerCards, playerScore, bankerScore);
    
    // 결과 표시 (애니메이션 후)
    setTimeout(() => {
        if (isWin) {
            // 승리 효과
            gameStatus.textContent = `승리! $${winAmount.toFixed(2)} 획득`;
            gameStatus.className = 'win';
            gameTable.classList.add('win-effect');
            
            // 추가: 승리 애니메이션 효과
            const confetti = document.createElement('div');
            confetti.className = 'confetti-container';
            for (let i = 0; i < 50; i++) {
                const confettiPiece = document.createElement('div');
                confettiPiece.className = 'confetti';
                confettiPiece.style.left = Math.random() * 100 + '%';
                confettiPiece.style.animationDelay = Math.random() * 3 + 's';
                confettiPiece.style.backgroundColor = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f'][Math.floor(Math.random() * 6)];
                confetti.appendChild(confettiPiece);
            }
            gameTable.appendChild(confetti);
            
            // 3초 후 승리 효과 제거
            setTimeout(() => {
                gameTable.removeChild(confetti);
            }, 3000);
        } else {
            // 패배 효과
            gameStatus.textContent = `패배! $${parseFloat(bet).toFixed(2)} 손실`;
            gameStatus.className = 'lose';
            gameTable.classList.add('lose-effect');
        }
        
        // 잔액 업데이트
        userBalanceDisplay.textContent = `$${newBalance.toFixed(2)}`;
        if (currentUser) {
            currentUser.balance = newBalance;
        }
        
        // 게임 상태만 초기화 (카드는 유지)
        isGameInProgress = false;
        placeBetBtn.disabled = false;
        betOptions.forEach(btn => btn.disabled = false);
        betAmount.disabled = false;
    }, (playerCards.length + bankerCards.length) * 1500 + 500); // 모든 카드 애니메이션 후 0.5초 뒤
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
function updateUserInfo(user) {
    currentUser = user;
    userNameDisplay.textContent = user.username;
    userBalanceDisplay.textContent = `$${user.balance.toFixed(2)}`;
}

// 게임 기록 목록 업데이트
function updateHistoryList(history) {
    console.log('게임 데이터 기록 수신');
    // 더 이상 화면에 표시하지 않음
}

// 게임 기록 클리어 함수 추가
function clearGameHistory() {
    console.log('이제 게임 기록은 별도 페이지에서 관리됩니다.');
}

// 게임 기록 클리어 함수 추가
function clearChatHistory() {
    chatMessages.innerHTML = '';
    localStorage.removeItem(CHAT_STORAGE_KEY);
    console.log('채팅 기록이 삭제되었습니다.');
}

// 게임 기록 항목 추가
function updateHistory(historyItem, shouldSave = true) {
    if (!historyItem) return;
    
    // 게임 아직 진행 중이면 기록 추가하지 않음
    if (historyItem.status && historyItem.status !== 'completed') {
        console.log('완료되지 않은 게임은 기록에 추가하지 않습니다:', historyItem.gameId);
        return;
    }
    
    const { winner, gameId, player, choice, bet, playerScore, bankerScore, isWin, time, playerCards, bankerCards } = historyItem;
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
    
    // 게임 항목 클릭시 상세 정보 보기
    li.addEventListener('click', () => {
        showGameDetailsModal(historyItem);
    });
    
    // 커서를 포인터로 변경하여 클릭 가능함을 표시
    li.style.cursor = 'pointer';
    
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
            status: 'completed',
            playerCards: playerCards || [],
            bankerCards: bankerCards || []
        };
        saveGameHistory(historyToSave);
        
        // 카드 정보가 있으면 따로 저장 (용량 절약을 위해)
        if (playerCards || bankerCards) {
            saveGameCards(gameId || displayId, playerCards, bankerCards);
        }
    }
}

// 게임 카드 정보 저장 (별도 스토리지)
function saveGameCards(gameId, playerCards, bankerCards) {
    try {
        // 기존 카드 데이터 불러오기
        let cardsData = {};
        const savedCards = localStorage.getItem(STORAGE_CARDS_KEY);
        if (savedCards) {
            cardsData = JSON.parse(savedCards);
        }
        
        // 새 카드 정보 추가
        cardsData[gameId] = {
            playerCards: playerCards || [],
            bankerCards: bankerCards || []
        };
        
        // 저장 용량 제한을 위해 오래된 항목 삭제 (최대 20개만 유지)
        const keys = Object.keys(cardsData);
        if (keys.length > 20) {
            // 가장 오래된 항목 삭제
            const oldestKeys = keys.slice(0, keys.length - 20);
            oldestKeys.forEach(key => {
                delete cardsData[key];
            });
        }
        
        // 저장
        localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(cardsData));
    } catch (error) {
        console.error('게임 카드 정보 저장 오류:', error);
    }
}

// 게임 카드 정보 로드
function loadGameCards(gameId) {
    try {
        const savedCards = localStorage.getItem(STORAGE_CARDS_KEY);
        if (savedCards) {
            const cardsData = JSON.parse(savedCards);
            return cardsData[gameId] || null;
        }
        return null;
    } catch (error) {
        console.error('게임 카드 정보 로드 오류:', error);
        return null;
    }
}

// 게임 상세 정보 모달 표시
function showGameDetailsModal(gameData) {
    // 이미 모달이 있으면 제거
    const existingModal = document.getElementById('game-details-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 카드 정보 로드 (없으면 gameData에서 가져옴)
    let playerCards = gameData.playerCards || [];
    let bankerCards = gameData.bankerCards || [];
    
    if (playerCards.length === 0 || bankerCards.length === 0) {
        const cardsData = loadGameCards(gameData.gameId);
        if (cardsData) {
            playerCards = cardsData.playerCards || [];
            bankerCards = cardsData.bankerCards || [];
        }
    }
    
    // 모달 생성
    const modal = document.createElement('div');
    modal.id = 'game-details-modal';
    modal.className = 'modal';
    
    // 시간 정보
    const timeText = gameData.time ? new Date(gameData.time).toLocaleString() : new Date().toLocaleString();
    
    // 선택한 베팅 정보
    const betChoiceText = gameData.choice ? 
        (gameData.choice === 'player' ? '플레이어' : (gameData.choice === 'banker' ? '뱅커' : '타이')) : '';
    
    // 결과 정보
    const resultText = gameData.winner === 'player' ? '플레이어' :
                      (gameData.winner === 'banker' ? '뱅커' : '타이');
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content game-details-modal-content';
    modalContent.innerHTML = `
        <div class="modal-header ${gameData.isWin ? 'win-header' : 'lose-header'}">
            <h3>게임 #${gameData.gameId ? gameData.gameId.toString().slice(-4) : ''} 상세 정보</h3>
            <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="game-result-banner ${gameData.isWin ? 'win-banner' : 'lose-banner'}">
                <span class="result-icon">${gameData.isWin ? '🏆' : '💸'}</span>
                <span class="result-text">${gameData.isWin ? '승리' : '패배'}</span>
                <span class="result-amount">${gameData.isWin ? `+$${gameData.winAmount || gameData.bet}` : `-$${gameData.bet || 0}`}</span>
            </div>
            
            <div class="game-info-section">
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calendar-alt"></i> 일시</div>
                    <div class="info-value">${timeText}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-user"></i> 플레이어</div>
                    <div class="info-value">${gameData.player || ''}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-dice"></i> 베팅</div>
                    <div class="info-value">${betChoiceText} <span class="bet-amount">$${gameData.bet || 0}</span></div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-trophy"></i> 승자</div>
                    <div class="info-value">${resultText}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calculator"></i> 스코어</div>
                    <div class="info-value">
                        <span class="player-score">${gameData.playerScore || 0}</span> : 
                        <span class="banker-score">${gameData.bankerScore || 0}</span>
                    </div>
                </div>
            </div>
            
            <div class="cards-section">
                <div class="player-cards-section">
                    <h4><i class="fas fa-user"></i> 플레이어 카드</h4>
                    <div class="cards-container" id="modal-player-cards"></div>
                </div>
                <div class="banker-cards-section">
                    <h4><i class="fas fa-landmark"></i> 뱅커 카드</h4>
                    <div class="cards-container" id="modal-banker-cards"></div>
                </div>
            </div>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 모달 닫기 버튼
    const closeBtn = modal.querySelector('.close-modal-btn');
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300); // 애니메이션 후 제거
    });
    
    // 모달 외부 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300); // 애니메이션 후 제거
        }
    });
    
    // ESC 키로 닫기
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300); // 애니메이션 후 제거
            document.removeEventListener('keydown', escHandler);
        }
    });
    
    // 카드 렌더링
    const playerCardsContainer = document.getElementById('modal-player-cards');
    const bankerCardsContainer = document.getElementById('modal-banker-cards');
    
    // 카드 표시
    renderModalCards(playerCardsContainer, playerCards);
    renderModalCards(bankerCardsContainer, bankerCards);
    
    // 모달 표시 (애니메이션)
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// 모달에 카드 렌더링
function renderModalCards(container, cards) {
    if (!container) return;
    
    if (!cards || cards.length === 0) {
        const noCard = document.createElement('div');
        noCard.className = 'no-card';
        noCard.textContent = '카드 정보 없음';
        container.appendChild(noCard);
        return;
    }
    
    cards.forEach(card => {
        const cardElement = createCardElement(card);
        cardElement.classList.add('show'); // 바로 표시
        cardElement.classList.add('modal-card'); // 모달용 카드 스타일
        container.appendChild(cardElement);
    });
}

// 랭킹 업데이트
socket.on('rankings_update', (rankings) => {
    console.log('랭킹 업데이트 수신:', rankings);
    // 랭킹 페이지에서 확인하도록 유도 (채팅창에는 표시하지 않음)
    console.log('랭킹이 업데이트되었습니다. 랭킹 및 기록 페이지에서 확인하세요.');
});

// 온라인 플레이어 목록 업데이트
function updateOnlinePlayers(players) {
    console.log('접속자 목록 업데이트:', players);
    
    if (!onlinePlayersList) {
        console.error('온라인 플레이어 목록 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 접속자 목록 초기화
    onlinePlayersList.innerHTML = '';
    
    // 플레이어 목록이 배열이 아니면 변환
    const playerList = Array.isArray(players) ? players : 
                      (typeof players === 'object' ? Object.keys(players) : []);
    
    // 각 플레이어에 대한 항목 생성
    playerList.forEach(player => {
        const li = document.createElement('li');
        
        // player가 문자열인 경우 (username만 전달된 경우)
        const username = typeof player === 'string' ? player : player.username;
        const isAdmin = typeof player === 'object' && player.isAdmin;
        
        // 관리자는 별도 표시
        if (isAdmin) {
            li.innerHTML = `<span class="admin-badge">관리자</span> ${username}`;
        } else {
            li.textContent = username;
        }
        
        // 현재 사용자 강조 표시
        if (currentUser && username === currentUser.username) {
            li.classList.add('current-user');
        }
        
        onlinePlayersList.appendChild(li);
    });
}

// 채팅 메시지 전송
function sendChatMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) return;
    
    if (!currentUser || !currentUser.username) {
        console.log('로그인 후 채팅을 이용할 수 있습니다.');
        return;
    }
    
    // 소켓을 통해 서버로 메시지 전송 (사용자 정보도 함께 전송)
    socket.emit('chat_message', {
        username: currentUser.username,
        message: messageText,
        time: Date.now()
    });
    
    // 입력 필드 초기화
    chatInput.value = '';
}

// 채팅 메시지 표시
function addChatMessage(message, shouldSave = true) {
    console.log('채팅 메시지 수신:', message);
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    // 메시지 형식 처리 - 다양한 형태의 메시지 객체 지원
    let username = '';
    let text = '';
    let time = '';
    
    if (typeof message === 'object') {
        // 다양한 필드 이름 처리
        username = message.sender || message.username || message.user || '알 수 없음';
        text = message.message || message.text || message.content || '';
        time = message.time ? new Date(message.time).toLocaleTimeString() : new Date().toLocaleTimeString();
        
        // 메시지 객체 자체가 출력된 경우 처리
        if (text === '[object Object]') {
            text = JSON.stringify(message.data || message.payload || {});
            // JSON 형식이 너무 길면 간략화
            if (text.length > 100) {
                text = text.substring(0, 100) + '...';
            }
        }
    } else if (typeof message === 'string') {
        // 문자열 메시지
        text = message;
        username = currentUser ? currentUser.username : '나';
        time = new Date().toLocaleTimeString();
    } else {
        // 기타 예상치 못한 형식
        text = '지원되지 않는 메시지 형식';
        username = '시스템';
        time = new Date().toLocaleTimeString();
    }
    
    // 본인 메시지 구분
    if (currentUser && username === currentUser.username) {
        messageElement.classList.add('my-message');
    }
    
    // 관리자 메시지 구분
    if (message.isAdmin) {
        messageElement.classList.add('admin-message');
        messageElement.innerHTML = `
            <div class="message-info">
                <span class="admin-badge">관리자</span>
                <span class="message-sender">${username}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${text}</div>
        `;
    } else {
        messageElement.innerHTML = `
            <div class="message-info">
                <span class="message-sender">${username}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${text}</div>
        `;
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 로컬 스토리지에 저장 (필요한 경우)
    if (shouldSave) {
        const messageToSave = {
            sender: username,
            message: text,
            time: message.time || Date.now(),
            isAdmin: message.isAdmin || false
        };
        saveChatMessage(messageToSave);
    }
}

// 시스템 메시지 표시
function addSystemMessage(text, shouldSave = true) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message system-message';
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    messageElement.innerHTML = `
        <div class="message-info">
            <span class="message-sender">시스템</span>
            <span class="message-time">${timeString}</span>
        </div>
        <div class="message-text">${text}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // 로컬 스토리지에 저장 (필요한 경우)
    if (shouldSave) {
        const messageToSave = {
            sender: '시스템',
            message: text,
            time: now.getTime(),
            isSystem: true
        };
        saveChatMessage(messageToSave);
    }
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    console.log("바카라 소켓 이벤트 리스너 설정 중...");
    
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
    
    socket.on('connect_error', (err) => {
        console.error('연결 오류:', err.message);
        gameStatus.textContent = '서버 연결 오류: ' + err.message;
        gameStatus.className = 'error';
    });
    
    // 강제 로그아웃 이벤트 처리
    socket.on('forced_logout', (data) => {
        console.log('강제 로그아웃:', data.message);
        
        // 알림 표시
        alert(data.message);
        
        // 로그아웃 처리
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        
        // 로그인 페이지로 리디렉션
        window.location.href = 'login.html';
    });
    
    // 로그인 응답 처리
    socket.on('login_response', (response) => {
        console.log('로그인 응답:', response);
        
        if (response.success) {
            // 로그인 성공
            updateUserInfo(response.user);
            
            // 게임 데이터 요청
            socket.emit('request_game_data');
        } else {
            // 로그인 실패
            gameStatus.textContent = response.message || '로그인에 실패했습니다.';
            gameStatus.className = 'error';
            
            // 로컬 스토리지 정보가 유효하지 않으면 다시 로그인하도록
            localStorage.removeItem('user');
            
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
    });
    
    // 인증 상태 확인 (이전 방식의 인증 처리도 유지)
    socket.on('auth_status', (data) => {
        console.log('인증 상태:', data);
        if (data.authenticated) {
            updateUserInfo(data.user);
            
            // 게임 데이터 요청
            socket.emit('request_game_data');
        } else {
            // 인증 실패 시 로그인 페이지로 리디렉션
            gameStatus.textContent = '인증에 실패했습니다. 로그인 페이지로 이동합니다.';
            gameStatus.className = 'error';
            
            // 로컬 스토리지 정보가 유효하지 않으면 제거
            localStorage.removeItem('user');
            
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
    });
    
    // 게임 데이터 수신
    socket.on('game_data', (data) => {
        console.log('게임 데이터 수신:', data);
        // 게임 기록과 랭킹은 더 이상 여기서 업데이트하지 않음
        updateOnlinePlayers(data.onlinePlayers);
    });
    
    // 베팅 결과 수신 - 서버에서 던지는 이벤트 이름으로 수정 (중요: bet_result → game_result)
    socket.on('game_result', (result) => {
        console.log('베팅 결과 수신:', result);
        
        // 게임 결과 표시 - 애니메이션만 시작하고 기록은 아직 업데이트하지 않음
        displayGameResult(result);
    });

    // 게임 완료 이벤트 수신 - 기록 업데이트
    socket.on('game_completed', (gameData) => {
        console.log('게임 완료 알림 (베팅 후 10초):', gameData);
        
        // 게임 기록 및 랭킹이 업데이트되었음을 알림 (채팅창에는 표시하지 않음)
        console.log('게임 결과가 기록되었습니다. 랭킹 및 기록 페이지에서 확인하세요.');
    });
    
    // 온라인 플레이어 목록 업데이트 (이벤트 두 가지 모두 처리)
    socket.on('online_players', (players) => {
        updateOnlinePlayers(players);
    });
    
    socket.on('online_players_update', (players) => {
        updateOnlinePlayers(players);
    });
    
    // 채팅 메시지 수신
    socket.on('chat_message', (message) => {
        addChatMessage(message);
    });
    
    // 시스템 메시지 수신
    socket.on('system_message', (message) => {
        // 시스템 메시지는 콘솔에만 표시
        console.log('시스템 메시지:', message);
    });
    
    // 채팅창 정리 명령 처리
    socket.on('clear_chat', () => {
        clearChatHistory();
        console.log('관리자가 채팅창을 정리했습니다.');
    });
    
    // 오류 메시지 수신
    socket.on('error_message', (message) => {
        console.error('오류 메시지:', message);
        gameStatus.textContent = message;
        gameStatus.className = 'error';
        resetGameState();
    });
    
    // 성공 메시지 수신
    socket.on('success_message', (message) => {
        gameStatus.textContent = message;
        gameStatus.className = 'success';
    });
    
    // 잔액 업데이트 수신
    socket.on('balance_update', (data) => {
        currentUser.balance = data.balance;
        userBalanceDisplay.textContent = `$${data.balance.toFixed(2)}`;
    });
    
    // 서버에서 보내는 에러 메시지 처리
    socket.on('error', (error) => {
        console.error('서버 오류:', error);
        gameStatus.textContent = error.message || '오류가 발생했습니다';
        gameStatus.className = 'error';
        resetGameState();
    });
    
    // 베팅 응답 처리
    socket.on('bet_response', (response) => {
        console.log('베팅 응답:', response);
        if (!response.success) {
            gameStatus.textContent = response.message;
            gameStatus.className = 'error';
            resetGameState();
        }
    });
    
    // 메뉴로 돌아가기 처리
    socket.on('return_to_menu', () => {
        window.location.href = '/';
    });
}

// 이벤트 리스너 등록
function setupEventListeners() {
    console.log('이벤트 리스너 설정 시작');
    
    // 베팅 버튼 이벤트
    betOptions.forEach((btn, index) => {
        console.log(`베팅 버튼 ${index} 이벤트 등록:`, btn);
        btn.addEventListener('click', function() {
            console.log(`베팅 버튼 클릭됨: ${this.dataset.choice}`);
            betOptions.forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedBet = this.dataset.choice;
            updateBetUI();
        });
    });
    
    // 베팅 금액 변경 이벤트
    if (betAmount) {
        betAmount.addEventListener('input', function() {
            console.log('베팅 금액 변경:', this.value);
            updateBetUI();
        });
    } else {
        console.error('베팅 금액 요소를 찾을 수 없습니다.');
    }
    
    // 베팅 확정 버튼 클릭
    if (placeBetBtn) {
        placeBetBtn.addEventListener('click', function() {
            console.log('베팅 확정 버튼 클릭됨');
            handlePlaceBet();
        });
    } else {
        console.error('베팅 확정 버튼 요소를 찾을 수 없습니다.');
    }
    
    // 채팅 전송 이벤트
    if (sendChatBtn && chatInput) {
        sendChatBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    // 메뉴로 돌아가기 버튼
    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            console.log('메뉴로 돌아가기 버튼 클릭됨');
            window.location.href = '/';
        });
    }
    
    // 로그아웃 버튼
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            console.log('로그아웃 버튼 클릭됨');
            
            // 로컬 스토리지에서 사용자 정보 제거
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
            
            // 소켓에 로그아웃 이벤트 전송
            socket.emit('logout');
            
            // 로그인 페이지로 리디렉션
            window.location.href = '/';
        });
    }
    
    // 채팅 기록 초기화 버튼
    const clearChatBtn = document.getElementById('clear-chat-btn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            if (confirm('채팅 기록을 모두 삭제하시겠습니까?')) {
                clearChatHistory();
                console.log('채팅 기록이 삭제되었습니다.');
            }
        });
    }
    
    console.log('이벤트 리스너 설정 완료');
}

// 초기화 함수
function init() {
    console.log("바카라 게임 초기화 중...");
    
    // 현재 사용자 정보 확인
    if (currentUser) {
        console.log("로컬 스토리지에서 불러온 사용자 정보:", currentUser.username);
        userNameDisplay.textContent = currentUser.username;
        userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    } else {
        console.log("로그인된 사용자 정보가 없습니다.");
    }
    
    setupSocketListeners();
    setupEventListeners();
    
    // 페이지 로드 시 자동으로 게임 상태 초기화
    resetGameState();
    
    // 저장된 채팅 메시지 불러오기
    loadChatHistory();
    
    // 저장된 게임 기록 불러오기
    loadGameHistory();
    
    console.log("바카라 게임 초기화 완료");
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded 이벤트 발생');
    init();
});

// 로컬 스토리지에서 채팅 기록 불러오기
function loadChatHistory() {
    try {
        const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);
        if (savedChat) {
            const chatHistory = JSON.parse(savedChat);
            
            // 기존 채팅 비우기
            chatMessages.innerHTML = '';
            
            // 저장된 채팅 표시 (시스템 메시지 제외)
            chatHistory.filter(msg => !msg.isSystem && msg.sender !== '시스템').forEach(message => {
                addChatMessage(message, false); // 저장 안함
            });
            
            console.log(`${chatHistory.length}개의 채팅 메시지 중 시스템 메시지를 제외하고 불러왔습니다.`);
            
            // 스크롤을 아래로 이동
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    } catch (error) {
        console.error('채팅 기록을 불러오는 중 오류 발생:', error);
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
            
            // 저장된 게임 기록 표시 (최신순)
            gameHistory.reverse().forEach(item => {
                updateHistory(item, false); // 저장 안함
            });
            
            console.log(`${gameHistory.length}개의 게임 기록을 불러왔습니다.`);
        }
    } catch (error) {
        console.error('게임 기록을 불러오는 중 오류 발생:', error);
    }
}

// 로컬 스토리지에 채팅 저장
function saveChatMessage(message) {
    try {
        // 기존 메시지 불러오기
        let chatHistory = [];
        const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);
        if (savedChat) {
            chatHistory = JSON.parse(savedChat);
        }
        
        // 새 메시지 추가
        chatHistory.push(message);
        
        // 최대 개수 유지
        if (chatHistory.length > STORAGE_MAX_ITEMS) {
            chatHistory = chatHistory.slice(chatHistory.length - STORAGE_MAX_ITEMS);
        }
        
        // 저장
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (error) {
        console.error('채팅 메시지 저장 중 오류 발생:', error);
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
        
        // 최대 개수 유지
        if (gameHistory.length > STORAGE_MAX_ITEMS) {
            gameHistory = gameHistory.slice(gameHistory.length - STORAGE_MAX_ITEMS);
        }
        
        // 저장
        localStorage.setItem(GAME_HISTORY_STORAGE_KEY, JSON.stringify(gameHistory));
    } catch (error) {
        console.error('게임 기록 저장 중 오류 발생:', error);
    }
} 