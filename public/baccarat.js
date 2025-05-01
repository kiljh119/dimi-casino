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
const gameRecords = document.getElementById('game-records');
// 새로운 DOM 요소
const playersActivity = document.getElementById('players-activity');
console.log('DOM 요소 선택 완료');

// 디버깅: DOM 요소 확인
console.log('베팅 버튼:', betOptions);
console.log('베팅 확정 버튼:', placeBetBtn);

// 전역 변수
let selectedBet = null;
let isGameInProgress = false;

// 전역 변수 - 공통 채팅 시스템
let chatSystem = null;

// 전역 변수에 게임 관련 저장소 키 추가
const GAME_HISTORY_STORAGE_KEY = 'baccarat_game_history';
const STORAGE_MAX_ITEMS = 50; // 최대 저장 항목 수
const STORAGE_CARDS_KEY = 'baccarat_game_cards';

// 전역 변수에 진행 중인 게임 목록 추가
let activeGames = [];

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
        
        // 게임 결과를 기록에 추가
        addGameRecordItem({
            gameId,
            playerScore,
            bankerScore,
            winner: playerScore > bankerScore ? 'player' : (bankerScore > playerScore ? 'banker' : 'tie'),
            choice,
            isWin,
            bet,
            winAmount,
            time: Date.now()
        });
        
        // 게임 기록에 '게임 기록이 없습니다' 메시지가 있으면 제거
        const noRecordsMessage = gameRecords.querySelector('.no-records-message');
        if (noRecordsMessage) {
            noRecordsMessage.remove();
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
    localStorage.removeItem('baccarat_chat_history');
    console.log('채팅 기록이 삭제되었습니다.');
}

// 게임 기록 항목 추가 (새로운 스타일)
function addGameRecordItem(gameData, shouldSave = true) {
    if (!gameRecords || !gameData) return;
    
    // 승패 결과에 따른 클래스와 라벨 설정
    let resultClass = '';
    let resultLabel = '';
    
    if (gameData.isWin === true) {
        resultClass = 'win';
        resultLabel = '승';
    } else if (gameData.isWin === false) {
        resultClass = 'lose';
        resultLabel = '패';
    } else if (gameData.winner === 'tie') {
        resultClass = 'tie';
        resultLabel = '타이';
    }
    
    // 게임 기록 아이템 생성
    const recordItem = document.createElement('div');
    recordItem.className = `game-record-item ${resultClass}`;
    recordItem.textContent = resultLabel;
    
    // 툴팁 추가
    const tooltip = document.createElement('div');
    tooltip.className = 'game-record-tooltip';
    
    // 선택한 베팅 옵션 표시
    let betChoiceText = '';
    if (gameData.choice === 'player') {
        betChoiceText = '플레이어';
    } else if (gameData.choice === 'banker') {
        betChoiceText = '뱅커';
    } else if (gameData.choice === 'tie') {
        betChoiceText = '타이';
    }
    
    tooltip.textContent = `베팅: ${betChoiceText} | 점수: ${gameData.playerScore}:${gameData.bankerScore}`;
    
    // 게임 ID가 있으면 툴팁에 추가
    if (gameData.gameId) {
        tooltip.textContent += ` | #${gameData.gameId.toString().slice(-4)}`;
    }
    
    // 시간 정보 추가
    if (gameData.time) {
        const timeStr = new Date(gameData.time).toLocaleTimeString();
        tooltip.textContent += ` | ${timeStr}`;
    }
    
    document.body.appendChild(tooltip);
    
    // 데이터 저장 (나중에 클릭 이벤트에서 사용)
    recordItem.dataset.gameData = JSON.stringify(gameData);
    
    // 툴팁 표시 이벤트
    recordItem.addEventListener('mouseover', function() {
        const rect = this.getBoundingClientRect();
        tooltip.style.position = 'fixed';
        tooltip.style.top = `${rect.bottom + 5}px`;
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.opacity = '1';
        tooltip.style.zIndex = '1000';
    });
    
    recordItem.addEventListener('mouseout', function() {
        tooltip.style.opacity = '0';
    });
    
    // 클릭 이벤트 (상세 정보 표시)
    recordItem.addEventListener('click', function() {
        try {
            const data = JSON.parse(this.dataset.gameData);
            showGameRecordModal(data);
        } catch (err) {
            console.error('게임 데이터 파싱 오류:', err);
        }
    });
    
    // 게임 기록 컨테이너에 추가 (새로운 게임을 항상 첫 번째에 추가)
    gameRecords.prepend(recordItem);
    
    // 최대 표시 개수 제한 (15개)
    while (gameRecords.children.length > 15) {
        gameRecords.removeChild(gameRecords.lastChild);
    }
    
    // 로컬 스토리지에 저장
    if (shouldSave) {
        saveGameRecordToStorage(gameData);
    }
}

// 게임 기록을 스토리지에 저장
function saveGameRecordToStorage(gameData) {
    try {
        const GAME_RECORDS_KEY = 'baccarat_game_records';
        let records = [];
        
        // 기존 기록 불러오기
        const savedRecords = localStorage.getItem(GAME_RECORDS_KEY);
        if (savedRecords) {
            records = JSON.parse(savedRecords);
        }
        
        // 시간 정보가 없으면 현재 시간 추가
        if (!gameData.time) {
            gameData.time = Date.now();
        }
        
        // 중복 제거 (같은 gameId가 이미 있으면 업데이트)
        const existingIndex = records.findIndex(r => r.gameId === gameData.gameId);
        if (existingIndex !== -1) {
            records[existingIndex] = gameData;
        } else {
            // 새 기록 추가
            records.unshift(gameData);
        }
        
        // 시간순으로 정렬 (최신이 앞에 오도록)
        records.sort((a, b) => (b.time || 0) - (a.time || 0));
        
        // 최대 저장 개수 제한 (50개)
        if (records.length > 50) {
            records = records.slice(0, 50);
        }
        
        // 저장
        localStorage.setItem(GAME_RECORDS_KEY, JSON.stringify(records));
    } catch (err) {
        console.error('게임 기록 저장 오류:', err);
    }
}

// 저장된 게임 기록 불러오기
function loadGameRecords() {
    try {
        const GAME_RECORDS_KEY = 'baccarat_game_records';
        const savedRecords = localStorage.getItem(GAME_RECORDS_KEY);
        
        // 게임 기록 컨테이너 초기화
        gameRecords.innerHTML = '';
        
        if (!savedRecords || JSON.parse(savedRecords).length === 0) {
            // 기록이 없을 때 메시지 표시
            const noRecordsMessage = document.createElement('div');
            noRecordsMessage.className = 'no-records-message';
            noRecordsMessage.textContent = '게임 기록이 없습니다';
            gameRecords.appendChild(noRecordsMessage);
            return;
        }
        
        // 정렬된 기록 가져오기
        let records = JSON.parse(savedRecords);
        
        // 시간순으로 정렬 (최신이 앞에 오도록)
        records.sort((a, b) => (b.time || 0) - (a.time || 0));
        
        // 각 기록 항목 추가 (최대 15개)
        const displayRecords = records.slice(0, 15);
        
        // 기록이 있는지 확인
        if (displayRecords.length > 0) {
            // 순서를 뒤집어서 추가 (과거 → 최신 순으로 DOM에 추가)
            // 이렇게 하면 flexbox에서 최신 기록이 왼쪽에 표시됨
            [...displayRecords].reverse().forEach(record => {
                addGameRecordItem(record, false); // 다시 저장하지 않음
            });
            console.log(`${displayRecords.length}개의 게임 기록을 불러왔습니다.`);
        } else {
            // 기록이 없을 때 메시지 표시
            const noRecordsMessage = document.createElement('div');
            noRecordsMessage.className = 'no-records-message';
            noRecordsMessage.textContent = '게임 기록이 없습니다';
            gameRecords.appendChild(noRecordsMessage);
        }
    } catch (err) {
        console.error('게임 기록 불러오기 오류:', err);
        // 오류 발생 시 메시지 표시
        gameRecords.innerHTML = '';
        const errorMessage = document.createElement('div');
        errorMessage.className = 'no-records-message';
        errorMessage.textContent = '게임 기록을 불러오는 중 오류가 발생했습니다';
        gameRecords.appendChild(errorMessage);
    }
}

// 게임 기록 모달 표시
function showGameRecordModal(gameData) {
    // 이미 모달이 있으면 제거
    const existingModal = document.getElementById('game-record-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 모달 생성
    const modal = document.createElement('div');
    modal.id = 'game-record-modal';
    modal.className = 'modal';
    
    // 시간 정보
    const timeText = gameData.time ? new Date(gameData.time).toLocaleString() : new Date().toLocaleString();
    
    // 선택한 베팅 정보
    let betChoiceText = '';
    if (gameData.choice === 'player') {
        betChoiceText = '플레이어';
    } else if (gameData.choice === 'banker') {
        betChoiceText = '뱅커';
    } else if (gameData.choice === 'tie') {
        betChoiceText = '타이';
    }
    
    // 승자 정보
    let winnerText = '';
    if (gameData.winner === 'player') {
        winnerText = '플레이어';
    } else if (gameData.winner === 'banker') {
        winnerText = '뱅커';
    } else if (gameData.winner === 'tie') {
        winnerText = '타이';
    }
    
    const isWinClass = gameData.isWin ? 'win-header' : 'lose-header';
    const resultText = gameData.isWin ? '승리' : '패배';
    const resultIcon = gameData.isWin ? '🏆' : '💸';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content game-details-modal-content';
    modalContent.innerHTML = `
        <div class="modal-header ${isWinClass}">
            <h3>게임 상세 정보</h3>
            <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="game-result-banner ${gameData.isWin ? 'win-banner' : 'lose-banner'}">
                <span class="result-icon">${resultIcon}</span>
                <span class="result-text">${resultText}</span>
                <span class="result-amount">${gameData.isWin ? `+$${gameData.winAmount || 0}` : `-$${gameData.bet || 0}`}</span>
            </div>
            
            <div class="game-info-section">
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calendar-alt"></i> 일시</div>
                    <div class="info-value">${timeText}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-dice"></i> 베팅</div>
                    <div class="info-value">${betChoiceText} <span class="bet-amount">$${gameData.bet || 0}</span></div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-trophy"></i> 승자</div>
                    <div class="info-value">${winnerText}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calculator"></i> 스코어</div>
                    <div class="info-value">
                        <span class="player-score">${gameData.playerScore || 0}</span> : 
                        <span class="banker-score">${gameData.bankerScore || 0}</span>
                    </div>
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
    
    // 모달 표시 (애니메이션)
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// 랭킹 업데이트
socket.on('rankings_update', (rankings) => {
    console.log('랭킹 업데이트 수신:', rankings);
    // 랭킹 페이지에서 확인하도록 유도 (채팅창에는 표시하지 않음)
    console.log('랭킹이 업데이트되었습니다. 랭킹 및 기록 페이지에서 확인하세요.');
});

// 온라인 플레이어 목록 업데이트 이벤트
socket.on('online_players_update', (players) => {
    console.log('온라인 플레이어 목록 업데이트 이벤트 수신됨');
    // ChatSystem 모듈에서 처리하므로 여기서는 아무 작업도 하지 않음
});

// 플레이어 활동 아이템 생성 함수
function createActivityItem(activity) {
    // 활동 항목 요소 생성
    const activityItem = document.createElement('div');
    
    // 현재 사용자의 활동인지 확인하여 클래스 추가
    const isMyActivity = currentUser && activity.username === currentUser.username;
    
    // 임시 게임인지 확인 (완료되지 않은 게임)
    const isTemporary = activity.temporary === true;
    
    // 클래스 설정 (승패 결과, 나의 활동 여부, 임시 게임 여부)
    activityItem.className = `activity-item ${activity.isWin ? 'win' : 'lose'} ${isMyActivity ? 'my-activity' : ''} ${isTemporary ? 'temporary-activity' : ''}`;
    
    // 임시 게임인 경우 타이틀 추가
    if (isTemporary) {
        activityItem.title = '진행 중인 게임은 상세 정보를 볼 수 없습니다';
    } else {
        activityItem.title = '클릭하여 카드 정보 보기';
    }
    
    if (activity.gameId) {
        activityItem.dataset.gameId = activity.gameId;
    }
    
    activityItem.dataset.id = activity.id;
    activityItem.dataset.expanded = 'false';
    
    // 활동 데이터 저장 (나중에 참조하기 위해)
    activityItem.dataset.gameData = JSON.stringify(activity);
    
    // 선택한 베팅 옵션 텍스트
    let choiceText = '';
    if (activity.choice === 'player') {
        choiceText = '플레이어';
    } else if (activity.choice === 'banker') {
        choiceText = '뱅커';
    } else if (activity.choice === 'tie') {
        choiceText = '타이';
    }
    
    // 시간 포맷팅
    const timeStr = new Date(activity.time).toLocaleTimeString();
    
    // HTML 구성 - 기본 정보
    activityItem.innerHTML = `
        <div class="activity-header">
            <span class="activity-user">${activity.username}${isMyActivity ? ' (나)' : ''}</span>
            <span class="activity-time">${timeStr}</span>
        </div>
        <div class="activity-content">
            <div class="activity-bet">
                <span class="activity-choice ${activity.choice}">${choiceText}</span>
                <span class="activity-amount">$${activity.betAmount.toFixed(2)}</span>
            </div>
            <div class="activity-result">
                ${isTemporary ? 
                    '<span class="activity-score">준비 중</span><span class="temporary-badge">진행 중</span>' : 
                    `<span class="activity-score">${activity.playerScore}:${activity.bankerScore}</span>
                     <span class="activity-status ${activity.isWin ? 'win' : 'lose'}">${activity.isWin ? '승리' : '패배'}</span>`
                }
            </div>
        </div>
        <div class="activity-details" style="display: none;">
            <div class="activity-cards-container">
                <div class="activity-cards-section">
                    <h4>플레이어 카드</h4>
                    <div class="activity-cards player-cards"></div>
                </div>
                <div class="activity-cards-section">
                    <h4>뱅커 카드</h4>
                    <div class="activity-cards banker-cards"></div>
                </div>
            </div>
        </div>
    `;
    
    // 클릭 이벤트 추가 (확장/축소)
    activityItem.addEventListener('click', (e) => {
        // 임시 게임(진행 중인 게임)인 경우 클릭 동작 비활성화
        if (isTemporary) {
            console.log('진행 중인 게임은 상세 정보를 볼 수 없습니다.');
            return;
        }
        
        const detailsSection = activityItem.querySelector('.activity-details');
        const isExpanded = activityItem.dataset.expanded === 'true';
        
        if (isExpanded) {
            // 축소
            detailsSection.style.display = 'none';
            activityItem.dataset.expanded = 'false';
        } else {
            // 확장 - 카드 정보 표시
            detailsSection.style.display = 'block';
            activityItem.dataset.expanded = 'true';
            
            // 카드 표시
            renderActivityCards(activity, activityItem);
        }
    });
    
    return activityItem;
}

// 활동 아이템에 카드 렌더링
function renderActivityCards(activity, activityItem) {
    const playerCardsContainer = activityItem.querySelector('.activity-cards.player-cards');
    const bankerCardsContainer = activityItem.querySelector('.activity-cards.banker-cards');
    
    // 이미 카드가 렌더링되어 있으면 건너뜀
    if (playerCardsContainer.children.length > 0) return;
    
    // 플레이어 카드 렌더링
    if (Array.isArray(activity.playerCards) && activity.playerCards.length > 0) {
        activity.playerCards.forEach(card => {
            const cardElement = createMiniCardElement(card);
            playerCardsContainer.appendChild(cardElement);
        });
    } else {
        playerCardsContainer.innerHTML = '<div class="no-cards">카드 정보 없음</div>';
    }
    
    // 뱅커 카드 렌더링
    if (Array.isArray(activity.bankerCards) && activity.bankerCards.length > 0) {
        activity.bankerCards.forEach(card => {
            const cardElement = createMiniCardElement(card);
            bankerCardsContainer.appendChild(cardElement);
        });
    } else {
        bankerCardsContainer.innerHTML = '<div class="no-cards">카드 정보 없음</div>';
    }
}

// 작은 카드 요소 생성
function createMiniCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `mini-card ${card.suit}`;
    
    // 카드 텍스트 (숫자 + 무늬)
    const value = getCardDisplayValue(card.value);
    const suit = getSuitSymbol(card.suit);
    
    cardElement.innerHTML = `
        <div class="mini-card-value">${value}</div>
        <div class="mini-card-suit">${suit}</div>
    `;
    
    return cardElement;
}

// 활동 상세 정보 모달 표시
function showActivityDetailsModal(activity) {
    // 이미 모달이 있으면 제거
    const existingModal = document.getElementById('activity-details-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 시간 포맷팅
    const timeStr = new Date(activity.time).toLocaleString();
    
    // 선택한 베팅 정보
    let choiceText = '';
    if (activity.choice === 'player') {
        choiceText = '플레이어';
    } else if (activity.choice === 'banker') {
        choiceText = '뱅커';
    } else if (activity.choice === 'tie') {
        choiceText = '타이';
    }
    
    // 모달 생성
    const modal = document.createElement('div');
    modal.id = 'activity-details-modal';
    modal.className = 'modal activity-details-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const isWinClass = activity.isWin ? 'win-header' : 'lose-header';
    
    modalContent.innerHTML = `
        <div class="modal-header ${isWinClass}">
            <h3>게임 상세 정보</h3>
            <button class="close-modal-btn">&times;</button>
        </div>
        <div class="modal-body">
            <div class="game-info-section">
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-user"></i> 플레이어</div>
                    <div class="info-value">${activity.username}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calendar-alt"></i> 일시</div>
                    <div class="info-value">${timeStr}</div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-dice"></i> 베팅</div>
                    <div class="info-value">${choiceText} <span class="bet-amount">$${activity.betAmount.toFixed(2)}</span></div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-trophy"></i> 결과</div>
                    <div class="info-value">
                        <span class="${activity.isWin ? 'success-color' : 'error-color'}">${activity.isWin ? '승리' : '패배'}</span>
                        ${activity.isWin ? `(+$${activity.winAmount.toFixed(2)})` : ''}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label"><i class="fas fa-calculator"></i> 스코어</div>
                    <div class="info-value">
                        <span class="player-score">${activity.playerScore}</span> : 
                        <span class="banker-score">${activity.bankerScore}</span>
                    </div>
                </div>
                <hr>
                <div class="activity-modal-cards">
                    <h4>플레이어 카드</h4>
                    <div class="modal-cards-container player-cards-container"></div>
                    <h4>뱅커 카드</h4>
                    <div class="modal-cards-container banker-cards-container"></div>
                </div>
            </div>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 모달에 카드 표시
    const playerCardsContainer = modal.querySelector('.player-cards-container');
    const bankerCardsContainer = modal.querySelector('.banker-cards-container');
    
    // 플레이어 카드
    if (Array.isArray(activity.playerCards) && activity.playerCards.length > 0) {
        activity.playerCards.forEach(card => {
            const cardElement = createCardElement(card);
            playerCardsContainer.appendChild(cardElement);
        });
    } else {
        playerCardsContainer.innerHTML = '<div class="no-cards-message">카드 정보가 없습니다</div>';
    }
    
    // 뱅커 카드
    if (Array.isArray(activity.bankerCards) && activity.bankerCards.length > 0) {
        activity.bankerCards.forEach(card => {
            const cardElement = createCardElement(card);
            bankerCardsContainer.appendChild(cardElement);
        });
    } else {
        bankerCardsContainer.innerHTML = '<div class="no-cards-message">카드 정보가 없습니다</div>';
    }
    
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
    
    // 모달 표시 (애니메이션)
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// 전체 활동 기록 모달 표시
function showAllActivityModal() {
    // 이미 모달이 있으면 제거
    const existingModal = document.getElementById('all-activity-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 모달 생성
    const modal = document.createElement('div');
    modal.id = 'all-activity-modal';
    modal.className = 'modal activity-details-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h3>전체 게임 현황</h3>
            <button class="close-modal-btn">&times;</button>
            </div>
        <div class="activity-filter-bar">
            <select id="filter-user">
                <option value="">모든 플레이어</option>
            </select>
            <select id="filter-result">
                <option value="">모든 결과</option>
                <option value="win">승리</option>
                <option value="lose">패배</option>
            </select>
            <button id="apply-filter">필터 적용</button>
            </div>
        <div class="activity-table-container">
            <table class="activity-table">
                <thead>
                    <tr>
                        <th>플레이어</th>
                        <th>베팅</th>
                        <th>금액</th>
                        <th>결과</th>
                        <th>점수</th>
                        <th>카드 정보</th>
                        <th>시간</th>
                    </tr>
                </thead>
                <tbody id="activity-table-body">
                    <tr>
                        <td colspan="7" class="loading-message">기록 불러오는 중...</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="activity-pagination">
            <button data-page="1" class="active">1</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 서버에서 활동 기록 가져오기
    socket.emit('request_other_players_history');
    
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
    
    // 모달 표시 (애니메이션)
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// 활동 기록을 테이블에 표시
function displayActivityHistory(activities) {
    const tableBody = document.getElementById('activity-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (!activities || activities.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" class="no-activity-message">게임 기록이 없습니다</td>`;
        tableBody.appendChild(row);
        return;
    }
    
    // 플레이어 필터 옵션 업데이트
    const filterUser = document.getElementById('filter-user');
    if (filterUser) {
        // 기존 옵션 유지하면서 새 사용자 추가
        const existingUsers = new Set(Array.from(filterUser.options)
            .map(option => option.value)
            .filter(value => value !== ''));
        
        const newUsers = new Set(activities.map(activity => activity.username));
        
        newUsers.forEach(username => {
            if (!existingUsers.has(username)) {
                const option = document.createElement('option');
                option.value = username;
                option.textContent = username;
                filterUser.appendChild(option);
            }
        });
    }
    
    activities.forEach(activity => {
        const row = document.createElement('tr');
        
        // 선택한 베팅 옵션 텍스트
        let choiceText = '';
        if (activity.choice === 'player') {
            choiceText = '플레이어';
        } else if (activity.choice === 'banker') {
            choiceText = '뱅커';
        } else if (activity.choice === 'tie') {
            choiceText = '타이';
        }
        
        // 시간 포맷팅
        const timeStr = new Date(activity.time).toLocaleTimeString();
        
        // 카드 정보 간략하게 표시
        let playerCardSummary = '';
        let bankerCardSummary = '';
        
        if (Array.isArray(activity.playerCards) && activity.playerCards.length > 0) {
            playerCardSummary = `<div class="card-info-cell">`;
            activity.playerCards.forEach(card => {
                const value = getCardDisplayValue(card.value);
                const suit = getSuitSymbol(card.suit);
                playerCardSummary += `<div class="card-info-icon ${card.suit}" title="${value}${suit}">${value}</div>`;
            });
            playerCardSummary += `</div>`;
        } else {
            playerCardSummary = '-';
        }
        
        if (Array.isArray(activity.bankerCards) && activity.bankerCards.length > 0) {
            bankerCardSummary = `<div class="card-info-cell">`;
            activity.bankerCards.forEach(card => {
                const value = getCardDisplayValue(card.value);
                const suit = getSuitSymbol(card.suit);
                bankerCardSummary += `<div class="card-info-icon ${card.suit}" title="${value}${suit}">${value}</div>`;
            });
            bankerCardSummary += `</div>`;
        } else {
            bankerCardSummary = '-';
        }
        
        row.innerHTML = `
            <td>${activity.username}</td>
            <td><span class="activity-choice ${activity.choice}">${choiceText}</span></td>
            <td>$${activity.betAmount.toFixed(2)}</td>
            <td><span class="activity-status ${activity.isWin ? 'win' : 'lose'}">${activity.isWin ? '승리' : '패배'}</span></td>
            <td>${activity.playerScore}:${activity.bankerScore}</td>
            <td>${playerCardSummary} / ${bankerCardSummary}</td>
            <td>${timeStr}</td>
        `;
        
        // 행 클릭 시 상세 정보 표시
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            showActivityDetailsModal(activity);
        });
        
        tableBody.appendChild(row);
    });
}

// 활동 패널 초기화
function initActivityPanel() {
    // 활동 목록이 비어 있으면 메시지 표시
    if (!playersActivity.children.length) {
        const noActivityMessage = document.createElement('div');
        noActivityMessage.className = 'no-activity-message';
        noActivityMessage.textContent = '아직 게임 기록이 없습니다';
        playersActivity.appendChild(noActivityMessage);
    }
}

// 활동 아이템 추가
function addActivityItem(activity, prepend = true) {
    // 'no-activity-message' 클래스를 가진 요소 찾기
    const noActivityMessage = playersActivity.querySelector('.no-activity-message');
    
    // 메시지가 있으면 제거
    if (noActivityMessage) {
        playersActivity.removeChild(noActivityMessage);
    }
    
    // 활동 아이템 생성
    const activityItem = createActivityItem(activity);
    
    // 앞에 추가할지 뒤에 추가할지
    if (prepend) {
        playersActivity.prepend(activityItem);
    } else {
        playersActivity.appendChild(activityItem);
    }
    
    // 최대 10개만 표시
    while (playersActivity.children.length > 10) {
        playersActivity.removeChild(playersActivity.lastChild);
    }
}

// 진행 중인 게임 저장
function saveActiveGames() {
    try {
        sessionStorage.setItem('baccarat_active_games', JSON.stringify(activeGames));
    } catch (error) {
        console.error('진행 중인 게임 저장 오류:', error);
    }
}

// 진행 중인 게임 불러오기
function loadActiveGames() {
    try {
        const savedGames = sessionStorage.getItem('baccarat_active_games');
        if (savedGames) {
            activeGames = JSON.parse(savedGames);
            console.log('진행 중인 게임 로드:', activeGames.length, '개');
        }
    } catch (error) {
        console.error('진행 중인 게임 로드 오류:', error);
        activeGames = [];
    }
}

// 진행 중인 게임 추가
function addActiveGame(game) {
    // 이미 있는 게임인지 확인
    const existingIndex = activeGames.findIndex(g => g.gameId === game.gameId);
    
    if (existingIndex === -1) {
        // 새 게임 추가
        activeGames.push(game);
    } else {
        // 기존 게임 업데이트
        activeGames[existingIndex] = game;
    }
    
    // 세션 스토리지에 저장
    saveActiveGames();
}

// 완료된 게임 제거
function removeActiveGame(gameId) {
    activeGames = activeGames.filter(game => game.gameId !== gameId);
    saveActiveGames();
}

// 소켓 이벤트 리스너 설정 수정
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
            
            // 다른 플레이어의 게임 기록 요청
            socket.emit('request_other_players_history');
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
            
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
    });
    
    // 게임 결과 수신 이벤트
    socket.on('game_result', (result) => {
        console.log('게임 결과 수신:', result);
        
        // 게임 결과 표시
        displayGameResult(result);
        
        // 자신의 게임 결과도 활동 패널에 추가
        if (result.playerCards && result.bankerCards) {
            const activityData = {
                gameId: result.gameId, // 게임 ID 추가
                username: currentUser.username,
                choice: result.choice,
                betAmount: result.bet,
                isWin: result.isWin,
                winAmount: result.isWin ? result.winAmount : 0,
                playerScore: result.playerScore,
                bankerScore: result.bankerScore,
                playerCards: result.playerCards,
                bankerCards: result.bankerCards,
                time: Date.now(),
                temporary: true // 임시 플래그 추가
            };
            
            // 진행 중인 게임에 추가
            addActiveGame(activityData);
            
            // 활동 패널에 추가
            addActivityItem(activityData);
        }
    });
    
    // 사용자 정보 업데이트 이벤트
    socket.on('user_info_update', (userData) => {
        console.log('사용자 정보 업데이트:', userData);
        updateUserInfo(userData);
    });
    
    // 랭킹 업데이트 이벤트
    socket.on('rankings_update', (rankings) => {
        console.log('랭킹 업데이트:', rankings);
        // 랭킹 표시 함수 호출 (필요한 경우)
    });

    // 베팅 응답 처리
    socket.on('bet_response', (response) => {
        console.log('베팅 응답:', response);
        
        if (!response.success) {
            // 베팅 실패 처리
            isGameInProgress = false;
            placeBetBtn.disabled = false;
            betOptions.forEach(btn => btn.disabled = false);
            betAmount.disabled = false;
            
            gameStatus.textContent = response.message || '베팅 처리 중 오류가 발생했습니다.';
            gameStatus.className = 'error';
        }
    });
    
    // 에러 메시지 처리
    socket.on('error_message', (message) => {
        console.error('서버 오류:', message);
        gameStatus.textContent = message;
        gameStatus.className = 'error';
    });

    // 다른 플레이어 게임 결과 수신
    socket.on('other_player_result', (result) => {
        console.log('다른 플레이어 게임 결과 수신:', result);
        
        // 자신의 게임 결과인 경우 무시 (이미 game_result 이벤트에서 처리됨)
        if (currentUser && result.username === currentUser.username) {
            console.log('자신의 게임 결과이므로 무시');
            return;
        }
        
        // 이미 같은 게임 ID가 활동 패널에 표시되어 있는지 확인
        if (result.gameId && playersActivity.querySelector(`[data-game-id="${result.gameId}"]`)) {
            console.log('이미 표시된 게임 ID:', result.gameId);
            return;
        }
        
        // 자신의 결과가 아닌 경우에만 활동 패널에 추가
        const activityWithGameId = { ...result, temporary: true }; // 임시 표시
        addActivityItem(activityWithGameId);
    });
    
    // 게임 완료 처리 이벤트
    socket.on('game_completed', (completedGame) => {
        console.log('게임 완료 처리:', completedGame);
        
        // 활동 패널에서 같은 게임 ID를 가진 임시 아이템 업데이트
        if (playersActivity && completedGame.gameId) {
            const items = playersActivity.querySelectorAll('.activity-item');
            items.forEach(item => {
                try {
                    // 데이터 속성 확인
                    const itemData = item.dataset.gameData ? JSON.parse(item.dataset.gameData) : null;
                    
                    // 같은 게임 ID를 가진 아이템 찾기
                    if (itemData && itemData.gameId === completedGame.gameId) {
                        // 임시 클래스 제거
                        item.classList.remove('temporary-activity');
                        
                        // 데이터 업데이트 (필요한 경우)
                        itemData.temporary = false;
                        item.dataset.gameData = JSON.stringify(itemData);
                        
                        // 진행 중 배지를 승리/패배 상태로 교체
                        const tempBadge = item.querySelector('.temporary-badge');
                        if (tempBadge) {
                            const activityResult = item.querySelector('.activity-result');
                            const scoreSpan = activityResult.querySelector('.activity-score');
                            
                            // 점수 업데이트
                            if (scoreSpan) {
                                scoreSpan.textContent = `${itemData.playerScore}:${itemData.bankerScore}`;
                            }
                            
                            // 진행 중 배지 제거
                            tempBadge.remove();
                            
                            // 승리/패배 상태 추가
                            const statusSpan = document.createElement('span');
                            statusSpan.className = `activity-status ${itemData.isWin ? 'win' : 'lose'}`;
                            statusSpan.textContent = itemData.isWin ? '승리' : '패배';
                            activityResult.appendChild(statusSpan);
                        }
                        
                        // 타이틀 업데이트 - 클릭 가능함을 표시
                        item.title = '클릭하여 카드 정보 보기';
                        
                        // 클릭 가능한 스타일로 변경
                        item.style.cursor = 'pointer';
                        item.style.pointerEvents = 'auto';
                        item.style.opacity = '1';
                        
                        // 클릭 이벤트 복원
                        item.onclick = (e) => {
                            const detailsSection = item.querySelector('.activity-details');
                            const isExpanded = item.dataset.expanded === 'true';
                            
                            if (isExpanded) {
                                // 축소
                                detailsSection.style.display = 'none';
                                item.dataset.expanded = 'false';
                            } else {
                                // 확장 - 카드 정보 표시
                                detailsSection.style.display = 'block';
                                item.dataset.expanded = 'true';
                                
                                // 카드 표시
                                renderActivityCards(itemData, item);
                            }
                        };
                        
                        console.log('게임 완료 처리됨:', completedGame.gameId);
                        
                        // 완료된 게임은 목록에서 제거
                        removeActiveGame(completedGame.gameId);
                    }
                } catch (error) {
                    console.error('아이템 업데이트 중 오류:', error);
                }
            });
        }
    });
    
    // 게임 상세 정보 수신
    socket.on('game_details', (gameDetails) => {
        console.log('게임 상세 정보 수신:', gameDetails);
        
        // 모달로 상세 정보 표시
        showActivityDetailsModal(gameDetails);
    });
    
    // 다른 플레이어들의 게임 기록 수신
    socket.on('other_players_history', (history) => {
        console.log('다른 플레이어들의 게임 기록 수신:', history.length, '개');
        
        // 모달이 열려 있으면 테이블에 표시
        if (document.getElementById('all-activity-modal')) {
            displayActivityHistory(history);
        }
        
        // 활동 패널에 최신 10개만 표시
        if (playersActivity) {
            // 기존 내용 초기화
            playersActivity.innerHTML = '';
            
            // 최대 10개까지만 표시
            const recentHistory = history.slice(0, 10);
            
            // 활동 내역 추가
            recentHistory.forEach(activity => {
                addActivityItem(activity, false);
            });
            
            // 내역이 없으면 메시지 표시
            if (recentHistory.length === 0 && activeGames.length === 0) {
                const noActivityMessage = document.createElement('div');
                noActivityMessage.className = 'no-activity-message';
                noActivityMessage.textContent = '아직 게임 기록이 없습니다';
                playersActivity.appendChild(noActivityMessage);
            }
            
            // 진행 중인 게임 표시
            displayActiveGames();
        }
    });
}

// 소켓 연결 시 진행 중인 게임 표시
function displayActiveGames() {
    console.log('진행 중인 게임 표시:', activeGames.length, '개');
    
    if (activeGames.length > 0) {
        // 현재 표시된 내용 유지하고 추가
        activeGames.forEach(game => {
            // 이미 DOM에 존재하는지 확인
            const existingItem = playersActivity.querySelector(`[data-game-id="${game.gameId}"]`);
            if (!existingItem) {
                addActivityItem(game);
            }
        });
    }
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
    
    console.log('이벤트 리스너 설정 완료');
}

// 초기화 함수
function init() {
    console.log('바카라 게임 초기화...');
    
    // 전역 변수 및 요소 초기화
    selectedBet = null;
    isGameInProgress = false;
    
    // 현재 사용자 정보 확인
    if (currentUser) {
        console.log("로컬 스토리지에서 불러온 사용자 정보:", currentUser.username);
        userNameDisplay.textContent = currentUser.username;
        userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    } else {
        console.log("로그인된 사용자 정보가 없습니다.");
    }
    
    // 공통 채팅 시스템 초기화
    if (window.ChatSystem) {
        chatSystem = new ChatSystem({
            socket: socket,
            chatMessages: chatMessages,
            chatInput: chatInput,
            sendChatBtn: sendChatBtn,
            username: currentUser ? currentUser.username : '',
            isAdmin: currentUser && currentUser.isAdmin,
            onlinePlayersList: onlinePlayersList
        });
        
        chatSystem.init();
        console.log("공통 채팅 시스템 초기화 완료");
    } else {
        console.error("ChatSystem 클래스를 찾을 수 없습니다. 공통 채팅 모듈이 로드되었는지 확인하세요.");
    }
    
    // 게임 결과 기록 불러오기
    loadGameRecords();
    
    // 활동 패널 초기화
    initActivityPanel();
    
    // 페이지 로드 시 자동으로 게임 상태 초기화
    resetGameState();
    
    // 세션 스토리지에서 진행 중인 게임 불러오기
    loadActiveGames();
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners();
    
    // 이벤트 리스너 등록
    setupEventListeners();
    
    console.log("바카라 게임 초기화 완료");
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded 이벤트 발생');
    init();
});