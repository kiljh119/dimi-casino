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
const STORAGE_CARDS_KEY = 'baccarat_game_cards';
const STORAGE_MAX_ITEMS = 50; // 최대 저장 항목 수

// 디버그 로깅 함수 추가 
function debugLog(message, data) {
    const debug = true; // 디버깅 로그 활성화 여부
    if (debug) {
        if (data) {
            // 중요 디버깅 데이터를 구분하기 위한 스타일 추가
            if (message.includes('게임 기록') || message.includes('진행 중') || message.includes('완료 알림')) {
                console.log(`%c[DEBUG] ${message}`, 'color: #2196F3; font-weight: bold;', data);
            } else {
                console.log(`[DEBUG] ${message}`, data);
            }
        } else {
            if (message.includes('게임 기록') || message.includes('진행 중') || message.includes('완료 알림')) {
                console.log(`%c[DEBUG] ${message}`, 'color: #2196F3; font-weight: bold;');
            } else {
                console.log(`[DEBUG] ${message}`);
            }
        }
    }
}

// 페이지 로드 시 로컬 스토리지 데이터로 화면 초기 설정
if (currentUser) {
    userNameDisplay.textContent = currentUser.username;
    userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    console.log('사용자 정보 화면에 표시됨');
}

// 베팅 시작 처리
function handlePlaceBet() {
    if (!selectedBet) {
        alert('베팅 옵션을 선택해주세요.');
        return;
    }
    
    if (!betAmount.value || isNaN(parseFloat(betAmount.value)) || parseFloat(betAmount.value) <= 0) {
        alert('유효한 베팅 금액을 입력해주세요.');
        return;
    }
    
    // 이전 게임의 결과 표시 및 효과 제거
    const gameTable = document.querySelector('.game-table');
    gameTable.classList.remove('win-effect', 'lose-effect');
    
    // 이전 게임의 카드 초기화
    clearCards();
    
    // 동일한 게임 ID가 여러 번 발생하지 않도록 타임스탬프 포함
    const gameId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // 게임 진행 중 상태로 설정
    isGameInProgress = true;
    
    // 중복 베팅 방지
    placeBetBtn.disabled = true;
    betOptions.forEach(btn => btn.disabled = true);
    betAmount.disabled = true;
    
    // 베팅 진행 중 메시지 표시
    gameStatus.textContent = '베팅 대기 중...';
    gameStatus.className = 'waiting';
    
    // 베팅 중 애니메이션 추가
    const loadingDotsElement = document.createElement('span');
    loadingDotsElement.className = 'loading-dots';
    loadingDotsElement.textContent = '';
    gameStatus.appendChild(loadingDotsElement);
    
    // 로딩 애니메이션 스타일 추가
    if (!document.getElementById('loading-animation-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'loading-animation-styles';
        styleElement.textContent = `
            .loading-dots {
                display: inline-block;
                position: relative;
                width: 30px;
                margin-left: 6px;
            }
            .loading-dots:after {
                content: '...';
                animation: loading 1.5s infinite;
                letter-spacing: 2px;
            }
            @keyframes loading {
                0%, 100% { opacity: 0.2; }
                50% { opacity: 1; }
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    // 게임 생성 및 실행 중인 게임 목록에 추가
    const newHistoryItem = {
        gameId: gameId,
        time: Date.now(),
        player: currentUser.username,
        choice: selectedBet,
        bet: parseFloat(betAmount.value),
        status: 'in_progress'
    };
    
    // 진행 중인 게임 표시 (히스토리 목록 상단에 추가)
    updateHistory(newHistoryItem, false);
    
    // 서버에 베팅 정보 전송
    socket.emit('place_bet', {
        gameId: gameId,
        choice: selectedBet,
        amount: parseFloat(betAmount.value),
        username: currentUser.username
    });
    
    console.log('베팅 시작: 선택 =', selectedBet, '금액 =', betAmount.value);
    
    // 게임 응답이 오지 않을 경우를 대비한 타임아웃 설정
    setTimeout(() => {
        if (isGameInProgress) {
            const loadingElement = gameStatus.querySelector('.loading-dots');
            if (loadingElement) {
                loadingElement.remove();
            }
        }
    }, 10000);
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
    const { playerCards, bankerCards, playerScore, bankerScore, isWin, winAmount, bet, newBalance, choice, gameId } = result;
    
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
    
    // 기록 미리 생성해 두지만 아직 UI에 표시하지 않음
    const gameHistory = {
        gameId: gameId || result.gameId || Math.floor(Math.random() * 900000) + 100000,
        time: Date.now(),
        player: currentUser ? currentUser.username : '',
        choice: result.choice || choice || selectedBet, // 여러 방식으로 전달될 수 있음
        bet: parseFloat(result.bet || bet || document.getElementById('bet-amount').value), // 숫자로 확실하게 변환
        playerScore: playerScore,
        bankerScore: bankerScore,
        isWin: isWin,
        winner: playerScore > bankerScore ? 'player' : (bankerScore > playerScore ? 'banker' : 'tie'),
        status: 'completed',
        playerCards: playerCards,
        bankerCards: bankerCards,
        winAmount: winAmount
    };
    
    console.log('게임 기록 데이터:', gameHistory); // 디버깅용
    
    // 카드 수와 각 카드 표시 시간을 기반으로 애니메이션 시간 계산
    const totalCards = (playerCards?.length || 0) + (bankerCards?.length || 0);
    const cardAnimationTime = totalCards * 1000; // 각 카드당 1초
    const pauseAfterCards = 1500; // 마지막 카드 후 1.5초 대기
    const totalAnimationTime = cardAnimationTime + pauseAfterCards;
    
    console.log(`카드 애니메이션 시간 계산: ${totalCards}장 × 1초 + ${pauseAfterCards/1000}초 = ${totalAnimationTime}ms`);
    
    // 카드 애니메이션 완료 후 결과 표시를 위한 전역 변수 설정
    window.cardAnimationDone = false;
    window.showingResults = false;
    
    // 게임 진행 상태와 결과는 카드 애니메이션 후에 표시되도록 함
    showCardsWithAnimation(playerContainer, bankerContainer, playerCards, bankerCards, playerScore, bankerScore);
    
    // 카드 애니메이션 완료 이벤트 리스너 설정
    window.cardAnimationCompleteCallback = function() {
        console.log('카드 애니메이션 완료됨');
        window.cardAnimationDone = true;
        
        // 마지막 카드가 표시된 후 일정 시간 대기 후 결과 표시
        setTimeout(() => {
            if (window.showingResults) return; // 이미 결과 표시 중이면 중복 실행 방지
            window.showingResults = true;
            
            displayFinalResult();
        }, pauseAfterCards);
    };
    
    // 안전장치: 카드 애니메이션이 너무 오래 걸리거나 실패할 경우 결과 표시
    setTimeout(() => {
        if (!window.showingResults) {
            console.log('안전장치: 결과 표시 타이머 실행');
            window.showingResults = true;
            displayFinalResult();
        }
    }, totalAnimationTime);
    
    // 최종 결과 표시 함수
    function displayFinalResult() {
        console.log('최종 결과 표시');
        // 애니메이션 요소 제거 (있으면)
        const animationElements = gameStatus.querySelectorAll('.status-animation');
        animationElements.forEach(elem => elem.remove());
        
        // 기존 진행 중인 게임 항목 찾아서 제거
        const existingInProgressItem = document.querySelector(`.history-item[data-game-id="${gameHistory.gameId}"][data-status="in_progress"]`);
        if (existingInProgressItem) {
            existingInProgressItem.remove();
        }
        
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
            
            // 초록색 효과가 나타날 때 랭킹 업데이트 요청
            if (socket) {
                debugLog('초록색 효과와 함께 랭킹 업데이트 요청');
                socket.emit('request_rankings');
            }
            
            // 게임 기록 추가 - 애니메이션 완료 후 (로컬 스토리지에 저장)
            updateHistory(gameHistory, true);
            
            // 3초 후 승리 효과 제거
            setTimeout(() => {
                if (gameTable.contains(confetti)) {
                    gameTable.removeChild(confetti);
                }
            }, 3000);
        } else {
            // 패배 효과
            gameStatus.textContent = `패배! $${parseFloat(bet).toFixed(2)} 손실`;
            gameStatus.className = 'lose';
            gameTable.classList.add('lose-effect');
            
            // 빨간색 효과가 나타날 때 랭킹 업데이트 요청
            if (socket) {
                debugLog('빨간색 효과와 함께 랭킹 업데이트 요청');
                socket.emit('request_rankings');
            }
            
            // 게임 기록 추가 - 애니메이션 완료 후 (로컬 스토리지에 저장)
            updateHistory(gameHistory, true);
        }
        
        // 사용자 잔액 업데이트
        if (newBalance !== undefined) {
            updateUserInfo({
                ...currentUser,
                balance: newBalance
            });
        }
        
        // 게임 진행 중 상태 해제 및 버튼 활성화 (결과 메시지는 그대로 유지)
        isGameInProgress = false;
        placeBetBtn.disabled = false;
        betOptions.forEach(btn => btn.disabled = false);
        betAmount.disabled = false;
    }
}

// 카드 애니메이션으로 표시
function showCardsWithAnimation(playerContainer, bankerContainer, playerCards, bankerCards, playerFinalScore, bankerFinalScore) {
    const allCards = [];
    
    // "카드 확인 중" 메시지 표시
    gameStatus.textContent = '카드 확인 중...';
    gameStatus.className = 'info';
    
    // 상태 메시지 스타일 추가
    if (!document.getElementById('game-status-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'game-status-styles';
        styleElement.textContent = `
            #game-status {
                font-family: 'Noto Sans KR', 'Poppins', sans-serif;
                font-size: 1.2rem;
                letter-spacing: 0.5px;
                transition: all 0.3s ease;
                padding: 8px 12px;
                border-radius: 4px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }
            #game-status.info {
                color: #1976D2;
                font-weight: 500;
                background-color: rgba(25, 118, 210, 0.1);
            }
            #game-status.win {
                color: #4CAF50;
                font-weight: 600;
                background-color: rgba(76, 175, 80, 0.1);
                text-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
            }
            #game-status.lose {
                color: #F44336;
                font-weight: 600;
                background-color: rgba(244, 67, 54, 0.1);
                text-shadow: 0 0 5px rgba(244, 67, 54, 0.5);
            }
            #game-status.waiting {
                color: #FF9800;
                font-weight: 500;
                background-color: rgba(255, 152, 0, 0.1);
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    // 카드 애니메이션 진행 중 상태 설정
    window.cardsAnimationInProgress = true;
    
    // 게임 기록에 표시될 "카드 확인 중" 항목 업데이트
    const inProgressItems = document.querySelectorAll('.history-item.in-progress');
    inProgressItems.forEach(item => {
        const statusElement = item.querySelector('.history-status');
        if (statusElement) {
            statusElement.textContent = '🔄 카드 확인 중...';
        }
    });
    
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
    
    // 점수 화면을 초기에 비워둠
    playerScore.textContent = "";
    bankerScore.textContent = "";
    
    // 플레이어와 뱅커 카드 분리
    const playerCardsOnly = allCards.filter(card => card.isPlayer);
    const bankerCardsOnly = allCards.filter(card => !card.isPlayer);
    
    // 카드 없는 경우 즉시 콜백 실행 후 리턴
    if (allCards.length === 0) {
        playerScore.textContent = playerFinalScore;
        bankerScore.textContent = bankerFinalScore;
        window.cardsAnimationInProgress = false;
        
        // 애니메이션 완료 콜백 호출
        if (typeof window.cardAnimationCompleteCallback === 'function') {
            window.cardAnimationCompleteCallback();
        }
        return;
    }
    
    // 각 카드를 순차적으로 표시
    allCards.forEach((cardInfo, index) => {
        setTimeout(() => {
            // 카드 추가
            const cardElement = createCardElement(cardInfo.card);
            cardInfo.container.appendChild(cardElement);
            
            // 게임 상태 메시지는 항상 동일하게 유지 (괄호 없음)
            gameStatus.textContent = '카드 확인 중...';
            
            // 카드 애니메이션 효과
            setTimeout(() => {
                cardElement.classList.add('show');
            }, 50);
            
            // 현재까지 보여진 카드들을 기준으로 실시간 점수 계산
            // 플레이어 점수 계산
            const playerCardsShown = playerCardsOnly.filter((_, i) => {
                const cardIndex = allCards.findIndex(c => c === playerCardsOnly[i]);
                return cardIndex <= index;
            });
            if (playerCardsShown.length > 0) {
                const currentPlayerScore = calculateScore(
                    playerCards,
                    playerCardsShown[playerCardsShown.length - 1].index
                );
                playerScore.textContent = currentPlayerScore;
            }
            
            // 뱅커 점수 계산
            const bankerCardsShown = bankerCardsOnly.filter((_, i) => {
                const cardIndex = allCards.findIndex(c => c === bankerCardsOnly[i]);
                return cardIndex <= index;
            });
            if (bankerCardsShown.length > 0) {
                const currentBankerScore = calculateScore(
                    bankerCards,
                    bankerCardsShown[bankerCardsShown.length - 1].index
                );
                bankerScore.textContent = currentBankerScore;
            }
            
            // 마지막 카드가 표시된 경우에만 최종 점수 표시
            if (index === allCards.length - 1) {
                // 마지막 카드를 표시한 후에 최종 점수 표시
                setTimeout(() => {
                    playerScore.textContent = playerFinalScore;
                    bankerScore.textContent = bankerFinalScore;
                    // 카드 애니메이션 완료 상태로 설정
                    window.cardsAnimationInProgress = false;
                    
                    // 애니메이션 완료 콜백 호출
                    if (typeof window.cardAnimationCompleteCallback === 'function') {
                        window.cardAnimationCompleteCallback();
                    }
                }, 500); // 마지막 카드 표시 후 0.5초 뒤에 최종 점수 표시
            }
        }, 1000 * index); // 각 카드마다 1초 간격 (약간 빠르게 진행)
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
    
    // 결과 메시지가 있으면 그대로 유지, 없으면 기본 메시지 표시
    if (!gameStatus.textContent || 
        !gameStatus.className || 
        (!gameStatus.className.includes('win') && !gameStatus.className.includes('lose'))) {
        gameStatus.textContent = '베팅을 선택하세요';
        gameStatus.className = '';
    }
    
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
    console.log('게임 기록 목록 업데이트:', history);
    historyList.innerHTML = '';
    
    // 유효한 배열인지 확인
    if (!Array.isArray(history)) {
        debugLog('유효하지 않은 게임 기록 데이터:', history);
        return;
    }
    
    // 시간 정보를 기준으로 내림차순 정렬 (최신순)
    const sortedHistory = [...history].sort((a, b) => {
        // null 체크 및 기본값 설정
        const timeA = a && a.time ? new Date(a.time).getTime() : 0;
        const timeB = b && b.time ? new Date(b.time).getTime() : 0;
        return timeB - timeA; // 내림차순 (최신이 먼저)
    });
    
    // 최대 20개만 표시
    const recentHistory = sortedHistory.slice(0, 20);
    
    // 정렬된 기록 표시
    recentHistory.forEach(item => {
        if (item) {
            updateHistory(item);
        }
    });
}

// 게임 기록 항목 추가
function updateHistory(historyItem, shouldSave = true) {
    if (!historyItem) return;
    
    // 필수 데이터 유효성 검사 추가 - 필수 필드가 없는 기록은 처리하지 않음
    if (!historyItem.gameId || !historyItem.player) {
        debugLog('게임 기록에 필수 정보가 누락되었습니다:', historyItem);
        return;
    }
    
    // 플레이어 이름 검증 (빈 문자열, undefined, null 등 방지)
    if (typeof historyItem.player !== 'string' || historyItem.player.trim() === '') {
        debugLog('게임 기록에 유효하지 않은 플레이어 이름:', historyItem);
        return;
    }
    
    // 게임 ID 검증
    if (typeof historyItem.gameId !== 'string' && typeof historyItem.gameId !== 'number') {
        debugLog('게임 기록에 유효하지 않은 게임 ID:', historyItem);
        return;
    }
    
    // 베팅 정보 유효성 검사 - 진행 중이 아닌데 베팅 정보가 없으면 처리하지 않음
    if (historyItem.status !== 'in_progress' && historyItem.status !== 'completed') {
        debugLog('게임 기록에 상태 정보가 누락되었습니다:', historyItem);
        return;
    }
    
    // 베팅 금액이나 선택 정보가 없는 경우 처리하지 않음 (진행 중 상태인 경우는 필수)
    if (historyItem.status === 'in_progress' && (!historyItem.choice || !historyItem.bet || isNaN(parseFloat(historyItem.bet)))) {
        debugLog('게임 진행 중 기록에 베팅 정보가 누락되었습니다:', historyItem);
        return;
    }
    
    // 완료된 게임은 추가 검증
    if (historyItem.status === 'completed') {
        // 승패 결과 정보가 없으면 처리하지 않음
        if (historyItem.isWin === undefined) {
            debugLog('완료된 게임 기록에 승패 정보가 누락되었습니다:', historyItem);
            return;
        }
        
        // 플레이어 및 뱅커 점수 검증
        if (historyItem.playerScore === undefined || historyItem.bankerScore === undefined) {
            debugLog('완료된 게임 기록에 점수 정보가 누락되었습니다:', historyItem);
            return;
        }
        
        // 카드 정보 검증
        if (!Array.isArray(historyItem.playerCards) || !Array.isArray(historyItem.bankerCards)) {
            debugLog('완료된 게임 기록에 카드 정보가 유효하지 않습니다:', historyItem);
            return;
        }
    }
    
    // 게임이 이미 완료된 경우 이전에 표시된 "게임중" 항목 찾아서 제거
    if (historyItem.status === 'completed' && historyItem.gameId) {
        const existingInProgressItem = document.querySelector(`.history-item[data-game-id="${historyItem.gameId}"][data-status="in_progress"]`);
        if (existingInProgressItem) {
            debugLog(`게임 완료로 업데이트: ${historyItem.gameId}`);
            // 기존 항목 삭제
            existingInProgressItem.remove();
        }
    }
    
    // 이미 존재하는 완료된 게임 ID인지 확인 (중복 방지)
    if (historyItem.status === 'completed') {
        const existingCompletedItem = document.querySelector(`.history-item[data-game-id="${historyItem.gameId}"][data-status="completed"]`);
        if (existingCompletedItem) {
            debugLog(`이미 표시된 완료된 게임 기록입니다: ${historyItem.gameId}`);
            return;
        }
    }
    
    const { winner, gameId, player, choice, bet, playerScore, bankerScore, isWin, time, playerCards, bankerCards, status, isInProgress } = historyItem;
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.gameId = gameId || '';
    li.dataset.player = player || '';
    li.dataset.status = status || 'unknown';
    li.dataset.time = time || Date.now(); // 시간 정보를 데이터 속성으로 추가
    
    // 현재 사용자의 게임인지 여부
    const isSelfGame = currentUser && player === currentUser.username;
    if (isSelfGame) {
        li.classList.add('self-game');
    }
    
    // 승패 결과에 따라 테두리 색상만 표시하도록 하고 배경색은 적용하지 않음
    if (isWin !== undefined) {
        if (isWin) {
            li.dataset.result = 'win';
        } else {
            li.dataset.result = 'lose';
        }
    }
    
    // 공통 데이터 포맷팅
    const timeText = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
    const betAmount = parseFloat(bet);
    const betChoiceText = choice ? 
        (choice === 'player' ? '플레이어' : (choice === 'banker' ? '뱅커' : '타이')) : '';
    
    // CSS 스타일 추가 (한 번만)
    if (!document.getElementById('history-styles')) {
        const styles = document.createElement('style');
        styles.id = 'history-styles';
        styles.textContent = `
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.6; }
                100% { opacity: 1; }
            }
            .in-progress {
                animation: pulse 1.5s infinite;
                background-color: rgba(33, 150, 243, 0.1);
                border-left: 3px solid #2196F3;
            }
            .history-status {
                color: #2196F3;
                font-weight: bold;
                margin-left: 5px;
            }
            .self-game {
                border-left: 3px solid #4CAF50;
            }
            .player-win {
                color: var(--player-color, #3498db);
            }
            .banker-win {
                color: var(--banker-color, #e74c3c);
            }
            .tie {
                color: var(--tie-color, #2ecc71);
            }
            .history-result.win {
                color: var(--success-color, #20c997);
                font-weight: bold;
            }
            .history-result.loss {
                color: var(--error-color, #ff6b6b);
                font-weight: bold;
            }
            .history-item:hover {
                background-color: rgba(0, 0, 0, 0.05);
                cursor: pointer;
            }
            /* 결과에 따른 테두리 스타일 수정 */
            .history-item[data-result="win"] {
                border-left: 3px solid var(--success-color, #20c997);
            }
            .history-item[data-result="lose"] {
                border-left: 3px solid var(--error-color, #ff6b6b);
            }
            .history-result-label {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                line-height: 1;
                text-align: center;
                border-radius: 50%;
                color: var(--text-color);
                font-weight: bold;
                margin-left: 5px;
                border: 1px solid rgba(0, 0, 0, 0.1);
            }
            .history-result-label.player-win {
                color: var(--player-color, #3498db);
                border-color: var(--player-color, #3498db);
            }
            .history-result-label.banker-win {
                color: var(--banker-color, #e74c3c);
                border-color: var(--banker-color, #e74c3c);
            }
            .history-result-label.tie {
                color: var(--tie-color, #2ecc71);
                border-color: var(--tie-color, #2ecc71);
            }
            /* 승리/패배 텍스트 스타일 개선 */
            .history-result {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                font-weight: 600;
                padding: 3px 6px;
                border-radius: 4px;
                background-color: rgba(0, 0, 0, 0.05);
                margin-left: 5px;
                width: fit-content;
                max-width: 70px;
                overflow: hidden;
                white-space: nowrap;
            }
            .history-result.win {
                color: var(--success-color, #20c997);
            }
            .history-result.loss {
                color: var(--error-color, #ff6b6b);
            }
            /* 이모티콘 스타일 수정 */
            .result-icon {
                display: inline-block;
                width: 16px;
                height: 16px;
                line-height: 16px;
                text-align: center;
                font-size: 12px;
            }
            /* 점수와 카드 영역 개선 */
            .history-cards {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-left: auto;
            }
            .history-score {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                padding: 3px 8px;
                background-color: rgba(0, 0, 0, 0.05);
                border-radius: 4px;
                min-width: 45px;
            }
            .score-divider {
                margin: 0 3px;
                opacity: 0.6;
            }
            .history-player {
                font-weight: bold;
                margin-right: 5px;
            }
            .history-detail-view {
                margin-top: 8px;
                padding: 10px;
                background-color: rgba(0, 0, 0, 0.03);
                border-radius: 5px;
                border: 1px solid rgba(0, 0, 0, 0.08);
                display: none;
            }
            .history-item.show-details .history-detail-view {
                display: block;
            }
            .player-cards-container, .banker-cards-container {
                margin-bottom: 8px;
            }
            .player-cards-label, .banker-cards-label {
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 0.9em;
                color: var(--text-color);
            }
            .player-cards-mini, .banker-cards-mini {
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                padding: 5px;
                background-color: rgba(255, 255, 255, 0.5);
                border-radius: 4px;
                min-height: 50px;
                align-items: center;
            }
            .no-card {
                font-size: 0.85em;
                color: #777;
                font-style: italic;
                margin: 0 auto;
            }
        `;
        document.head.appendChild(styles);
    }
    
    // 게임 진행 중인 경우 특별한 스타일 적용
    if (status === 'in_progress' || isInProgress) {
        li.classList.add('in-progress');
            
        li.innerHTML = `
            <div class="history-header">
                <span class="history-id" title="게임 ID: ${gameId.toString().slice(-4)}">#${gameId.toString().slice(-4)}</span>
                <span class="history-time" title="게임 시간">${timeText}</span>
                <span class="history-status">🔄 게임 진행 중</span>
            </div>
            <div class="history-body">
                <div class="history-details">
                    <span class="history-player" title="플레이어">${player}</span>
                    <span class="history-bet" title="베팅: ${betChoiceText} $${betAmount.toFixed(2)}">
                        <strong>${betChoiceText}</strong> <span class="bet-amount">$${betAmount.toFixed(2)}</span>
                    </span>
                </div>
                <div class="history-cards">
                    <span class="history-cards-info">🃏 카드를 확인중입니다...</span>
                </div>
            </div>
        `;
    }
    // 완료된 게임인 경우
    else {
        // 결과에 따른 클래스 설정
        let resultClass = '';
        let resultLabel = '';
        let resultText = '';
        
        // winner 정보가 있으면 우선 사용
        if (winner) {
            if (winner === 'player') {
                resultClass = 'player-win';
                resultLabel = 'P';
                resultText = '플레이어';
            } else if (winner === 'banker') {
                resultClass = 'banker-win';
                resultLabel = 'B';
                resultText = '뱅커';
            } else if (winner === 'tie') {
                resultClass = 'tie';
                resultLabel = 'T';
                resultText = '타이';
            }
        }
        // winner 정보가 없으면 플레이어의 선택과 승패 결과로 판단
        else if (choice && isWin !== undefined) {
            if (choice === 'player' && isWin) {
                resultClass = 'player-win';
                resultLabel = 'P';
                resultText = '플레이어';
            } else if (choice === 'banker' && isWin) {
                resultClass = 'banker-win';
                resultLabel = 'B';
                resultText = '뱅커';
            } else if (choice === 'tie' && isWin) {
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
        }
        
        // 승패 텍스트 및 스타일
        const winLossClass = isWin ? 'win' : 'loss';
        const winLossText = isWin ? '승리' : '패배';
        const winLossIcon = isWin ? '🏆' : '❌';
        
        // 카드 정보 및 점수
        const pScore = playerScore !== undefined ? playerScore : 0;
        const bScore = bankerScore !== undefined ? bankerScore : 0;
        
        // 완료된 게임의 HTML 생성
        // 색상 클래스를 요소에 직접 추가하지 않고, 내부 요소에만 필요한 클래스를 추가
        if (isWin !== undefined) {
            li.dataset.result = isWin ? 'win' : 'lose';
        }
        li.innerHTML = `
            <div class="history-header">
                <span class="history-id" title="게임 ID: ${gameId.toString().slice(-4)}">#${gameId.toString().slice(-4)}</span>
                <span class="history-time" title="게임 시간">${timeText}</span>
            </div>
            <div class="history-body">
                <div class="history-details">
                    <span class="history-player" title="플레이어">${player}</span>
                    <span class="history-bet" title="베팅: ${betChoiceText} $${betAmount.toFixed(2)}">
                        <strong>${betChoiceText}</strong> <span class="bet-amount">$${betAmount.toFixed(2)}</span>
                    </span>
                    <span class="history-result ${winLossClass}" title="${winLossText}"><span class="result-icon">${winLossIcon}</span> ${winLossText}</span>
                </div>
                <div class="history-cards">
                    <span class="history-result-label ${resultClass}" title="${resultText} 승리">${resultLabel}</span>
                    <div class="history-score">
                        <span class="player-score" title="플레이어 점수">${pScore}</span>
                        <span class="score-divider">:</span>
                        <span class="banker-score" title="뱅커 점수">${bScore}</span>
                    </div>
                </div>
            </div>
            <div class="history-detail-view">
                <div class="player-cards-container">
                    <div class="player-cards-label">플레이어 카드:</div>
                    <div class="player-cards-mini"></div>
                </div>
                <div class="banker-cards-container">
                    <div class="banker-cards-label">뱅커 카드:</div>
                    <div class="banker-cards-mini"></div>
                </div>
            </div>
        `;
        
        // 카드를 클릭하면 상세 정보 표시
        li.addEventListener('click', () => {
            // 상세 정보 토글
            li.classList.toggle('show-details');
            
            // 상세 정보가 표시되는 경우에만 미니 카드 렌더링
            if (li.classList.contains('show-details')) {
                // 플레이어 카드 표시
                const playerCardsContainer = li.querySelector('.player-cards-mini');
                renderMiniCards(playerCardsContainer, playerCards);
                
                // 뱅커 카드 표시
                const bankerCardsContainer = li.querySelector('.banker-cards-mini');
                renderMiniCards(bankerCardsContainer, bankerCards);
            }
        });
    }
    
    // 최신 기록을 위에 추가 (항상 최상단에 추가)
    historyList.insertBefore(li, historyList.firstChild);
    
    // 로컬 스토리지에 게임 히스토리 저장 (옵션)
    if (shouldSave && historyItem.status === 'completed') {
        saveGameHistory(historyItem);
    }
    
    // 완료된 게임인 경우 카드 정보 저장
    if (status === 'completed' && playerCards && bankerCards && gameId) {
        saveGameCards(gameId, playerCards, bankerCards);
    }
    
    // 기록이 너무 많아지면 오래된 것 제거
    const MAX_HISTORY_ITEMS = 30;
    const historyItems = historyList.querySelectorAll('.history-item');
    if (historyItems.length > MAX_HISTORY_ITEMS) {
        historyList.removeChild(historyList.lastChild);
    }
}

// 미니 카드 렌더링 함수 추가
function renderMiniCards(container, cards) {
    if (!container) {
        debugLog('renderMiniCards: 컨테이너가 없습니다');
        return;
    }
    
    container.innerHTML = '';
    
    if (!cards || cards.length === 0) {
        const noCard = document.createElement('div');
        noCard.className = 'no-card';
        noCard.textContent = '카드 정보 없음';
        container.appendChild(noCard);
        return;
    }
    
    debugLog(`renderMiniCards: ${cards.length}개의 카드를 렌더링합니다`, cards);
    
    // 미니 카드 스타일이 없으면 추가
    if (!document.getElementById('mini-cards-style')) {
        const style = document.createElement('style');
        style.id = 'mini-cards-style';
        style.textContent = `
            .mini-card {
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 30px;
                height: 40px;
                margin: 0 3px;
                background-color: white;
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                position: relative;
                font-size: 0.85em;
                border: 1px solid #ddd;
                overflow: hidden;
            }
            .mini-card.hearts, .mini-card.diamonds {
                color: var(--banker-color, #e74c3c);
            }
            .mini-card.clubs, .mini-card.spades {
                color: #000;
            }
            .card-value {
                font-weight: bold;
                font-size: 0.9em;
                line-height: 1;
                margin-bottom: 2px;
            }
            .card-suit {
                font-size: 1em;
                line-height: 1;
            }
            .history-detail-view {
                margin-top: 8px;
                padding: 10px;
                background-color: rgba(0, 0, 0, 0.03);
                border-radius: 5px;
                border: 1px solid rgba(0, 0, 0, 0.08);
            }
            .player-cards-container, .banker-cards-container {
                margin-bottom: 8px;
            }
            .player-cards-label, .banker-cards-label {
                font-weight: bold;
                margin-bottom: 5px;
                font-size: 0.9em;
                color: var(--text-color);
            }
            .player-cards-mini, .banker-cards-mini {
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                padding: 5px;
                background-color: rgba(255, 255, 255, 0.5);
                border-radius: 4px;
                min-height: 50px;
                align-items: center;
            }
            .no-card {
                font-size: 0.85em;
                color: #777;
                font-style: italic;
                margin: 0 auto;
            }
        `;
        document.head.appendChild(style);
    }
    
    cards.forEach(card => {
        // 카드 데이터 검증
        if (!card || !card.suit || !card.value) {
            console.error('유효하지 않은 카드 데이터:', card);
            return;
        }
        
        const miniCard = document.createElement('div');
        miniCard.className = `mini-card ${card.suit}`;
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'card-value';
        valueSpan.textContent = getCardDisplayValue(card.value);
        
        const suitSpan = document.createElement('span');
        suitSpan.className = 'card-suit';
        suitSpan.innerHTML = getSuitSymbol(card.suit);
        
        miniCard.appendChild(valueSpan);
        miniCard.appendChild(suitSpan);
        container.appendChild(miniCard);
    });
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

// 랭킹 업데이트
function updateRankings(rankings) {
    debugLog('랭킹 업데이트:', rankings);
    rankingsBody.innerHTML = '';
    
    if (!rankings || rankings.length === 0) {
        console.error('랭킹 데이터가 없습니다');
        return;
    }
    
    // 랭킹을 보유 금액(balance) 기준으로 정렬
    const sortedRankings = [...rankings].sort((a, b) => {
        // 먼저 balance 기준으로 정렬 (내림차순)
        const balanceA = parseFloat(a.balance) || 0;
        const balanceB = parseFloat(b.balance) || 0;
        
        if (balanceB !== balanceA) {
            return balanceB - balanceA;
        }
        
        // balance가 같으면 profit 기준으로 정렬 (내림차순)
        const profitA = parseFloat(a.profit) || 0;
        const profitB = parseFloat(b.profit) || 0;
        
        if (profitB !== profitA) {
            return profitB - profitA;
        }
        
        // profit도 같으면 승률 기준으로 정렬 (내림차순)
        const winRateA = a.wins && (a.wins + a.losses) > 0 ? (a.wins / (a.wins + a.losses)) : 0;
        const winRateB = b.wins && (b.wins + b.losses) > 0 ? (b.wins / (b.wins + b.losses)) : 0;
        
        return winRateB - winRateA;
    });
    
    // 랭킹 테이블 헤더 업데이트
    updateRankingsTableHeader();
    
    // 랭킹 데이터 표시
    sortedRankings.forEach((player, index) => {
        const row = document.createElement('tr');
        const rankCell = document.createElement('td');
        const nameCell = document.createElement('td');
        const balanceCell = document.createElement('td'); // 보유 금액 셀
        const profitCell = document.createElement('td');
        const winRateCell = document.createElement('td');
        
        rankCell.textContent = index + 1;
        nameCell.textContent = player.username;
        
        // 보유 금액 표시
        const balance = parseFloat(player.balance) || 0;
        balanceCell.textContent = `$${balance.toFixed(2)}`;
        balanceCell.className = 'balance';
        
        // 수익 표시 (색상으로 구분)
        const profit = parseFloat(player.profit) || 0;
        profitCell.textContent = `$${profit.toFixed(2)}`;
        if (profit > 0) {
            profitCell.classList.add('positive');
        } else if (profit < 0) {
            profitCell.classList.add('negative');
        }
        
        // 승률 계산 및 표시
        const wins = parseInt(player.wins) || 0;
        const losses = parseInt(player.losses) || 0;
        const total = wins + losses;
        const winRate = total > 0 ? (wins / total * 100).toFixed(1) : '0.0';
        winRateCell.textContent = `${winRate}%`;
        
        row.appendChild(rankCell);
        row.appendChild(nameCell);
        row.appendChild(balanceCell); // 보유 금액 셀 추가
        row.appendChild(profitCell);
        row.appendChild(winRateCell);
        
        // 현재 사용자 강조 표시
        if (currentUser && player.username === currentUser.username) {
            row.classList.add('current-user-row');
        }
        
        rankingsBody.appendChild(row);
    });
}

// 랭킹 테이블 헤더 업데이트 함수
function updateRankingsTableHeader() {
    // 기존 테이블 헤더 찾기
    const rankingsTable = document.getElementById('rankings-table');
    let thead = rankingsTable.querySelector('thead');
    
    if (!thead) {
        // 테이블 헤더가 없으면 새로 생성
        thead = document.createElement('thead');
        rankingsTable.appendChild(thead);
    }
    
    // 기존 헤더 삭제
    thead.innerHTML = '';
    
    // 새 헤더 생성
    const headerRow = document.createElement('tr');
    headerRow.id = 'rankings-header';
    
    // 헤더 컬럼 생성
    const headers = [
        { id: 'rank', text: '순위' },
        { id: 'name', text: '이름' },
        { id: 'balance', text: '보유 금액' },
        { id: 'profit', text: '수익' },
        { id: 'winrate', text: '승률' }
    ];
    
    headers.forEach(header => {
        const th = document.createElement('th');
        th.id = `header-${header.id}`;
        th.textContent = header.text;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
}

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
        addSystemMessage('로그인 후 채팅을 이용할 수 있습니다.');
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
    
    // 이벤트 추적을 위한 로깅 설정
    if (!window.socketEventLog) {
        window.socketEventLog = [];
        
        // 원래 socket.on 메서드 저장
        const originalOn = socket.on;
        
        // 새로운 socket.on 메서드로 오버라이드하여 모든 이벤트 추적
        socket.on = function(eventName, callback) {
            // 원래 핸들러 호출
            originalOn.call(socket, eventName, function(data) {
                // 특정 이벤트만 로깅 (너무 많은 이벤트는 피함)
                if (['game_started', 'game_completed', 'game_result'].includes(eventName)) {
                    const logEntry = {
                        event: eventName,
                        time: new Date().toISOString(),
                        data: JSON.parse(JSON.stringify(data)) // 깊은 복사로 변경 방지
                    };
                    window.socketEventLog.push(logEntry);
                    console.log(`%c[SOCKET EVENT] ${eventName}`, 'color: #9C27B0; font-weight: bold;', data);
                    
                    // 로그 크기 제한
                    if (window.socketEventLog.length > 50) {
                        window.socketEventLog.shift();
                    }
                }
                
                // 원래 콜백 호출
                callback.call(this, data);
            });
        };
        
        // 소켓 연결 종료 시 이벤트 로그 저장
        window.addEventListener('beforeunload', function() {
            try {
                if (window.socketEventLog.length > 0) {
                    localStorage.setItem('socket_event_log', JSON.stringify(window.socketEventLog));
                }
            } catch (e) {
                console.error('소켓 이벤트 로그 저장 실패:', e);
            }
        });
        
        // 저장된 로그 불러오기
        try {
            const savedLog = localStorage.getItem('socket_event_log');
            if (savedLog) {
                const parsedLog = JSON.parse(savedLog);
                console.log('%c이전 세션의 소켓 이벤트 로그:', 'color: #9C27B0; font-weight: bold;', parsedLog);
            }
        } catch (e) {
            console.error('이전 소켓 이벤트 로그 불러오기 실패:', e);
        }
    }
    
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
        updateHistoryList(data.history);
        updateRankings(data.rankings);
        updateOnlinePlayers(data.onlinePlayers);
    });
    
    // 베팅 결과 수신 - 서버에서 던지는 이벤트 이름으로 수정 (중요: bet_result → game_result)
    socket.on('game_result', (result) => {
        console.log('베팅 결과 수신:', result);
        
        // 베팅 진행 중 메시지 즉시 제거
        gameStatus.textContent = '카드 확인 중...';
        
        // 애니메이션 요소 제거 (있으면)
        const animationElements = gameStatus.querySelectorAll('.status-animation');
        animationElements.forEach(elem => elem.remove());
        
        // 게임 결과 표시
        displayGameResult(result);
    });

    // 게임 완료 이벤트 수신 - 기록 업데이트하지 않고 카드 정보만 저장
    socket.on('game_completed', (data) => {
        debugLog('게임 완료 알림 수신:', data);
        
        // 데이터 유효성 검사
        if (!data || typeof data !== 'object') {
            console.error('유효하지 않은 게임 완료 데이터:', data);
            return;
        }
        
        // 필수 필드 검증
        if (!data.gameId || !data.player) {
            console.error('게임 완료 데이터에 필수 필드 누락:', data);
            return;
        }
        
        // 정상적인 플레이어 이름이 있는지 확인 (빈 문자열, undefined, null 등 방지)
        if (!data.player || typeof data.player !== 'string' || data.player.trim() === '') {
            console.error('게임 완료: 유효하지 않은 플레이어 이름:', data.player);
            return;
        }
        
        // 자신의 게임인지 확인
        const isSelfGame = currentUser && data.player === currentUser.username;
        debugLog(`게임 완료 소유자 확인: ${data.player} (자신의 게임: ${isSelfGame ? '예' : '아니오'})`);
        
        // 자신의 게임 결과는 displayGameResult에서 이미 처리되었으므로 무시
        if (isSelfGame) {
            debugLog(`자신의 게임 완료 기록은 무시합니다: ${data.gameId}`);
            return;
        }
        
        try {
            // 이미 이 게임 ID가 있는지 확인 (중복 방지)
            const existingCompletedItem = document.querySelector(`.history-item[data-game-id="${data.gameId}"][data-status="completed"]`);
            if (existingCompletedItem) {
                debugLog(`이미 완료 표시된 게임 기록입니다: ${data.gameId}`);
                return;
            }
            
            // 필수 정보 검증 (베팅 정보)
            if (!data.choice || !data.bet || isNaN(parseFloat(data.bet))) {
                console.error('게임 완료: 베팅 정보가 유효하지 않습니다:', data);
                return;
            }
            
            // 베팅 금액 변환 및 검증
            const betAmount = parseFloat(data.bet);
            if (isNaN(betAmount) || betAmount <= 0) {
                console.error('게임 완료: 유효하지 않은 베팅 금액:', data.bet);
                return;
            }
            
            // 정상적인 선택(choice) 값인지 확인
            const validChoices = ['player', 'banker', 'tie'];
            if (!validChoices.includes(data.choice)) {
                console.error('게임 완료: 유효하지 않은 선택값:', data.choice);
                return;
            }
            
            // 카드 정보와 점수 검증
            if (!Array.isArray(data.playerCards) || !Array.isArray(data.bankerCards)) {
                console.error('게임 완료: 카드 정보가 유효하지 않습니다:', data);
                return;
            }
            
            // 점수 정보 안전하게 파싱
            const playerScore = parseInt(data.playerScore) || 0;
            const bankerScore = parseInt(data.bankerScore) || 0;
            
            // winner 정보 결정 (서버 정보 우선, 없으면 점수로 판단)
            let winner = data.winner;
            if (!winner) {
                if (playerScore > bankerScore) {
                    winner = 'player';
                } else if (bankerScore > playerScore) {
                    winner = 'banker';
                } else {
                    winner = 'tie';
                }
            }
            
            // 승패 여부 검증
            const isWin = !!data.isWin;
            
            // 우승 금액 유효성 검사
            let winAmount = 0;
            if (isWin) {
                winAmount = parseFloat(data.winAmount) || 0;
                if (isNaN(winAmount) || winAmount < 0) {
                    winAmount = 0; // 기본값 설정
                }
            }
            
            debugLog(`다른 유저의 게임 완료 기록 추가: ${data.player}, 선택: ${data.choice}, 결과: ${winner}`);
            
            // 게임 진행 중 상태 항목이 있는지 확인하여 업데이트
            const existingInProgressItem = document.querySelector(`.history-item[data-game-id="${data.gameId}"][data-status="in_progress"]`);
            
            // 완료된 게임 항목 설정
            const historyItem = {
                gameId: data.gameId,
                player: data.player,
                choice: data.choice,
                bet: betAmount,
                isWin: isWin,
                winAmount: winAmount,
                playerScore: playerScore,
                bankerScore: bankerScore,
                playerCards: data.playerCards,
                bankerCards: data.bankerCards,
                time: data.time || Date.now(),
                winner: winner,
                status: 'completed'
            };
            
            // 다른 플레이어의 게임도 애니메이션 처리하여 표시
            const cardsDelay = 0; // 대기 시간 제거
            
            // 기존 진행 중 항목 존재 여부에 따라 처리
            if (existingInProgressItem) {
                debugLog(`기존 진행 중 게임을 완료 상태로 업데이트: ${data.gameId}`);
                
                // 게임 진행 중인 항목이 있다면 카드 확인 중으로 상태 변경
                const statusElement = existingInProgressItem.querySelector('.history-status');
                if (statusElement) {
                    statusElement.textContent = '🔄 카드 확인 중...';
                }
                
                // 지연 없이 바로 완료된 게임으로 업데이트
                existingInProgressItem.remove();
                
                // 완료된 게임 추가 (로컬 스토리지에 저장)
                updateHistory(historyItem, true);
            } else {
                // 이미 기존 항목이 제거되었거나 없는 경우, 게임 결과를 바로 추가
                debugLog(`진행 중 게임 없이 완료된 게임 추가: ${data.gameId}`);
                
                // 진행 중인 게임으로 먼저 표시 후 바로 결과 표시
                const inProgressItem = {
                    gameId: data.gameId,
                    player: data.player,
                    choice: data.choice,
                    bet: betAmount,
                    time: data.time || Date.now(),
                    status: 'in_progress',
                    isInProgress: true
                };
                
                // 진행 중인 게임으로 먼저 표시 (최상단에 표시되도록)
                updateHistory(inProgressItem, false);
                
                // 즉시 "게임 진행 중" 항목 제거
                const tempProgressItem = document.querySelector(`.history-item[data-game-id="${data.gameId}"][data-status="in_progress"]`);
                if (tempProgressItem) {
                    tempProgressItem.remove();
                }
                
                // 완료된 게임 추가 (로컬 스토리지에 저장)
                updateHistory(historyItem, true);
            }
        } catch (error) {
            console.error('게임 기록 처리 오류:', error);
        }
    });
    
    // 온라인 플레이어 목록 업데이트 (이벤트 두 가지 모두 처리)
    socket.on('online_players', (players) => {
        updateOnlinePlayers(players);
    });
    
    socket.on('online_players_update', (players) => {
        updateOnlinePlayers(players);
    });
    
    // 랭킹 업데이트
    socket.on('rankings_update', (rankings) => {
        updateRankings(rankings);
    });
    
    // 채팅 메시지 수신
    socket.on('chat_message', (message) => {
        addChatMessage(message);
    });
    
    // 시스템 메시지 수신
    socket.on('system_message', (message) => {
        addSystemMessage(message);
    });
    
    // 채팅창 정리 명령 처리
    socket.on('clear_chat', () => {
        clearChatHistory();
        addSystemMessage('관리자가 채팅창을 정리했습니다.', true);
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

    // 게임 시작 처리
    socket.on('game_started', (data) => {
        debugLog('새 게임 시작 이벤트 수신:', data);
        
        // 게임 데이터 유효성 검사 강화
        if (!data || typeof data !== 'object') {
            console.error('유효하지 않은 게임 시작 데이터:', data);
            return;
        }
        
        // 필수 필드 검증
        if (!data.gameId || !data.player || !data.choice || !data.bet) {
            console.error('게임 시작 데이터에 필수 필드 누락:', data);
            return;
        }
        
        // 베팅 금액 변환 및 검증
        const betAmount = parseFloat(data.bet);
        if (isNaN(betAmount) || betAmount <= 0) {
            console.error('게임 시작: 유효하지 않은 베팅 금액:', data.bet);
            return;
        }
        
        // 자신의 게임인지 확인
        const isSelfGame = currentUser && data.player === currentUser.username;
        debugLog(`게임 소유자 확인: ${data.player} (자신의 게임: ${isSelfGame ? '예' : '아니오'})`);
        
        // 자신의 게임은 무시 (이미 handlePlaceBet에서 처리함)
        if (isSelfGame) {
            debugLog(`자신의 게임 시작 기록은 무시합니다: ${data.gameId}`);
            return;
        }
        
        // 정상적인 플레이어 이름이 있는지 확인 (빈 문자열, undefined, null 등 방지)
        if (!data.player || typeof data.player !== 'string' || data.player.trim() === '') {
            console.error('게임 시작: 유효하지 않은 플레이어 이름:', data.player);
            return;
        }
        
        // 정상적인 선택(choice) 값인지 확인
        const validChoices = ['player', 'banker', 'tie'];
        if (!validChoices.includes(data.choice)) {
            console.error('게임 시작: 유효하지 않은 선택값:', data.choice);
            return;
        }
        
        // 이미 존재하는 게임 ID인지 확인 (중복 방지)
        const existingItem = document.querySelector(`.history-item[data-game-id="${data.gameId}"]`);
        if (existingItem) {
            debugLog(`게임 시작: 이미 존재하는 게임 ID입니다: ${data.gameId}`);
            return;
        }
            
        debugLog(`다른 유저의 게임 시작 기록 추가: ${data.player}, 선택: ${data.choice}, 금액: ${betAmount}`);
        
        // 사용자 게임 시작 데이터 정리
        const gameStartTime = data.time || Date.now();
        
        // 게임 상태 메시지 추가 (다른 유저의 게임 진행 정보 표시)
        if (!isSelfGame) {
            const choiceText = data.choice === 'player' ? '플레이어' : data.choice === 'banker' ? '뱅커' : '타이';
            gameStatus.textContent = `${data.player}님이 ${choiceText}에 $${betAmount.toFixed(2)}를 베팅했습니다. 게임 진행 중...`;
            gameStatus.className = 'info';
        }
        
        // 다른 사용자의 게임 시작을 "게임 진행 중" 상태로 표시
        const inProgressHistoryItem = {
            gameId: data.gameId,
            time: gameStartTime,
            player: data.player,
            choice: data.choice,
            bet: betAmount,
            status: 'in_progress',
            isInProgress: true
        };
        
        // 게임 진행 중 상태를 기록에 추가 (로컬 스토리지에는 저장하지 않음)
        // 항상 최신 항목이 맨 위에 표시되도록 함
        updateHistory(inProgressHistoryItem, false);
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
                addSystemMessage('채팅 기록이 삭제되었습니다.', true);
            }
        });
    }
    
    // 게임 기록 초기화 버튼
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('게임 기록을 모두 삭제하시겠습니까?')) {
                clearGameHistory();
                addSystemMessage('게임 기록이 삭제되었습니다.', true);
            }
        });
    }
    
    console.log('이벤트 리스너 설정 완료');
}

// 초기화 함수
function init() {
    debugLog("바카라 게임 초기화 중...");
    
    // 랭킹 테이블용 스타일 추가
    addRankingStyles();
    
    // 현재 사용자 정보 확인
    if (currentUser) {
        debugLog("로컬 스토리지에서 불러온 사용자 정보:", currentUser);
        userNameDisplay.textContent = currentUser.username;
        userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    } else {
        debugLog("로그인된 사용자 정보가 없습니다.");
    }
    
    // 페이지 로드 시 자동으로 게임 상태 초기화
    resetGameState();
    
    // 로컬 스토리지 체크
    checkLocalStorage();
    
    // 이벤트 리스너 및 소켓 설정
    setupEventListeners();
    setupSocketListeners();
    
    // 소켓이 연결되면 서버에 랭킹 정보 요청
    if (socket && socket.connected) {
        debugLog('소켓 연결됨 - 랭킹 정보 요청');
        socket.emit('request_rankings');
    } else {
        debugLog('소켓 연결 대기 중 - 연결 후 랭킹 정보 요청 예정');
        socket.on('connect', () => {
            debugLog('소켓 연결됨 - 랭킹 정보 요청');
            socket.emit('request_rankings');
        });
    }
    
    debugLog("바카라 게임 초기화 완료");
}

// 랭킹 테이블용 스타일 추가
function addRankingStyles() {
    const styleId = 'ranking-table-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        #rankings-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9em;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            border-radius: 5px;
            overflow: hidden;
        }
        
        #rankings-table thead {
            background-color: #36304a;
            color: white;
        }
        
        #rankings-table th {
            padding: 8px 5px;
            text-align: center;
            font-weight: 500;
            font-size: 0.9em;
        }
        
        #rankings-table td {
            padding: 6px 5px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }
        
        #rankings-table tr:nth-child(even) {
            background-color: rgba(0,0,0,0.02);
        }
        
        #rankings-table tr:hover {
            background-color: rgba(0,0,0,0.05);
        }
        
        #rankings-table .positive {
            color: #2e7d32;
            font-weight: bold;
        }
        
        #rankings-table .negative {
            color: #c62828;
            font-weight: bold;
        }
        
        #rankings-table .current-user-row {
            background-color: rgba(255, 235, 59, 0.2);
            font-weight: bold;
        }
        
        #rankings-table .current-user-row:hover {
            background-color: rgba(255, 235, 59, 0.3);
        }
        
        #rankings-table .balance {
            color: #1565c0;
            font-weight: bold;
        }
    `;
    
    document.head.appendChild(style);
}

// 로컬 스토리지 체크 및 로드
function checkLocalStorage() {
    try {
        // 로컬 스토리지 지원 여부 확인
        if (typeof localStorage === 'undefined') {
            console.error('로컬 스토리지를 지원하지 않는 브라우저입니다.');
            return;
        }
        
        // 테스트 항목 저장 및 확인
        const testKey = 'baccarat_test';
        try {
            localStorage.setItem(testKey, 'test');
            if (localStorage.getItem(testKey) !== 'test') {
                throw new Error('로컬 스토리지 읽기/쓰기 테스트 실패');
            }
            localStorage.removeItem(testKey);
        } catch (e) {
            console.error('로컬 스토리지 테스트 실패:', e);
            return;
        }
        
        debugLog('로컬 스토리지 테스트 성공, 데이터 로드 시작');
        
        // 저장된 채팅 메시지 불러오기
        loadChatHistory();
        
        // 저장된 게임 기록 불러오기
        loadGameHistory();
        
        // 마지막 로드 타임스탬프 기록
        localStorage.setItem('baccarat_last_load', Date.now().toString());
        debugLog('로컬 스토리지 데이터 로드 완료');
    } catch (error) {
        console.error('로컬 스토리지 체크 중 오류:', error);
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    debugLog('DOMContentLoaded 이벤트 발생');
    
    // 페이지 로드 시점 기록
    window.pageLoadTime = Date.now();
    
    // 초기화 함수 호출
    init();
    
    // 로컬 스토리지 변경 이벤트 리스너 (다른 탭에서 변경 시 동기화)
    window.addEventListener('storage', function(e) {
        if (e.key === GAME_HISTORY_STORAGE_KEY) {
            debugLog('다른 탭에서 게임 기록이 변경됨, 새로 로드합니다.');
            loadGameHistory();
        } else if (e.key === CHAT_STORAGE_KEY) {
            debugLog('다른 탭에서 채팅 기록이 변경됨, 새로 로드합니다.');
            loadChatHistory();
        }
    });
});

// 로컬 스토리지에서 채팅 기록 불러오기
function loadChatHistory() {
    try {
        debugLog('로컬 스토리지에서 채팅 기록 불러오기 시도');
        const savedChat = localStorage.getItem(CHAT_STORAGE_KEY);
        
        if (savedChat) {
            try {
                const chatHistory = JSON.parse(savedChat);
                
                if (!Array.isArray(chatHistory)) {
                    debugLog('저장된 채팅 기록이 배열이 아닙니다. 초기화합니다.');
                    return;
                }
                
                // 기존 채팅 비우기
                chatMessages.innerHTML = '';
                
                // 저장된 채팅 표시
                chatHistory.forEach(message => {
                    addChatMessage(message, false); // 저장 안함
                });
                
                debugLog(`${chatHistory.length}개의 채팅 메시지를 불러왔습니다.`);
                
                // 스크롤을 아래로 이동
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } catch (parseError) {
                console.error('채팅 기록 파싱 오류:', parseError);
                // 손상된 데이터는 초기화
                localStorage.removeItem(CHAT_STORAGE_KEY);
            }
        } else {
            debugLog('저장된 채팅 기록이 없습니다.');
        }
    } catch (error) {
        console.error('채팅 기록을 불러오는 중 오류 발생:', error);
    }
}

// 로컬 스토리지에서 게임 기록 불러오기
function loadGameHistory() {
    try {
        debugLog('로컬 스토리지에서 게임 기록 불러오기 시도');
        const savedHistory = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        
        if (savedHistory) {
            try {
                const gameHistory = JSON.parse(savedHistory);
                
                if (!Array.isArray(gameHistory)) {
                    debugLog('저장된 게임 기록이 배열이 아닙니다. 초기화합니다.');
                    return;
                }
                
                // 기존 기록 비우기
                historyList.innerHTML = '';
                
                // 게임 기록 수와 데이터 확인
                debugLog(`${gameHistory.length}개의 게임 기록을 불러왔습니다.`, gameHistory);
                
                if (gameHistory.length > 0) {
                    // 이미 정렬된 상태로 저장되어 있지만 다시 한번 확인
                    const sortedHistory = [...gameHistory].sort((a, b) => {
                        const timeA = a.time || 0;
                        const timeB = b.time || 0;
                        return timeB - timeA;  // 내림차순 정렬 (최신순)
                    });
                    
                    // 정렬된 기록을 화면에 표시
                    for (let i = 0; i < sortedHistory.length; i++) {
                        const item = sortedHistory[i];
                        debugLog(`게임 기록 항목 표시 (${i+1}/${sortedHistory.length}):`, item);
                        
                        // 항상 최상단에 추가되도록 설정하여 최신 기록이 상단에 표시되도록 함
                        updateHistory(item, false); // 저장 안함
                    }
                    
                    debugLog(`${sortedHistory.length}개의 게임 기록을 화면에 표시했습니다.`);
                }
            } catch (parseError) {
                console.error('게임 기록 파싱 오류:', parseError);
                // 손상된 데이터는 초기화
                localStorage.removeItem(GAME_HISTORY_STORAGE_KEY);
            }
        } else {
            debugLog('저장된 게임 기록이 없습니다.');
        }
    } catch (error) {
        console.error('게임 기록을 불러오는 중 오류 발생:', error);
    }
}

// 로컬 스토리지에 게임 기록 저장
function saveGameHistory(historyItem) {
    if (!historyItem || !historyItem.gameId) {
        debugLog('유효하지 않은 게임 기록은 저장하지 않습니다', historyItem);
        return;
    }
    
    try {
        debugLog('게임 기록 저장 시도:', historyItem);
        
        // 기존 게임 기록 불러오기
        let gameHistory = [];
        const savedHistory = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        
        if (savedHistory) {
            try {
                const parsedHistory = JSON.parse(savedHistory);
                if (Array.isArray(parsedHistory)) {
                    gameHistory = parsedHistory;
                } else {
                    debugLog('저장된 게임 기록이 배열이 아닙니다. 초기화합니다.');
                }
            } catch (parseError) {
                console.error('저장된 게임 기록 파싱 오류:', parseError);
                // 자동 복구 - 새로운 배열로 초기화
            }
        }
        
        // 중복 제거 (같은 게임 ID가 있으면 업데이트)
        const index = gameHistory.findIndex(item => item.gameId === historyItem.gameId);
        if (index !== -1) {
            debugLog(`기존 게임 기록 업데이트: ${historyItem.gameId}`);
            gameHistory[index] = historyItem;
        } else {
            // 새 기록 추가
            debugLog(`새 게임 기록 추가: ${historyItem.gameId}`);
            gameHistory.push(historyItem);
        }
        
        // 시간 기준으로 정렬 (최신 순)
        gameHistory.sort((a, b) => {
            const timeA = a.time || 0;
            const timeB = b.time || 0;
            return timeB - timeA; // 내림차순 (최신 순)
        });
        
        // 최대 개수 유지
        if (gameHistory.length > STORAGE_MAX_ITEMS) {
            gameHistory = gameHistory.slice(0, STORAGE_MAX_ITEMS);
        }
        
        // 저장
        const historyString = JSON.stringify(gameHistory);
        localStorage.setItem(GAME_HISTORY_STORAGE_KEY, historyString);
        
        // 저장 확인
        const savedData = localStorage.getItem(GAME_HISTORY_STORAGE_KEY);
        if (savedData) {
            debugLog(`게임 기록 저장 성공: ${gameHistory.length}개 항목, ${historyString.length} 바이트`);
        } else {
            console.error('게임 기록 저장 실패: 데이터가 저장되지 않았습니다.');
        }
    } catch (error) {
        console.error('게임 기록 저장 중 오류 발생:', error);
    }
}

// 채팅창 클리어 함수 추가
function clearChatHistory() {
    chatMessages.innerHTML = '';
    localStorage.removeItem(CHAT_STORAGE_KEY);
    addSystemMessage('채팅 기록이 삭제되었습니다.', false);
}

// 게임 기록 클리어 함수 추가
function clearGameHistory() {
    historyList.innerHTML = '';
    localStorage.removeItem(GAME_HISTORY_STORAGE_KEY);
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