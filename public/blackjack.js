// 소켓 연결
const socket = io();

// 현재 사용자 정보
let currentUser = null;
let currentRoom = null;
let roomPlayers = [];
let currentBet = 0;
let canDouble = false;
let myCards = [];
let myDealerCards = [];

// DOM 요소 - 로비 화면
const blackjackLobby = document.getElementById('blackjack-lobby');
const lobbyUserName = document.getElementById('lobby-user-name');
const lobbyUserBalance = document.getElementById('lobby-user-balance');
const lobbyLogoutBtn = document.getElementById('lobby-logout-btn');
const backToMenuBtn = document.getElementById('back-to-menu');
const createRoomBtn = document.getElementById('create-room-btn');
const roomSearch = document.getElementById('room-search');
const searchBtn = document.getElementById('search-btn');
const filterPlayers = document.getElementById('filter-players');
const filterBet = document.getElementById('filter-bet');
const roomsBody = document.getElementById('rooms-body');

// DOM 요소 - 방 생성/참가 모달
const roomCreateModal = document.getElementById('room-create-modal');
const roomJoinModal = document.getElementById('room-join-modal');
const closeModalBtns = document.querySelectorAll('.close-modal-btn');
const roomName = document.getElementById('room-name');
const maxPlayers = document.getElementById('max-players');
const minBet = document.getElementById('min-bet');
const passwordToggle = document.getElementById('password-toggle');
const roomPassword = document.getElementById('room-password');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const confirmCreateBtn = document.getElementById('confirm-create-btn');
const joinRoomName = document.getElementById('join-room-name');
const joinRoomOwner = document.getElementById('join-room-owner');
const joinRoomPlayers = document.getElementById('join-room-players');
const joinRoomBet = document.getElementById('join-room-bet');
const joinPassword = document.getElementById('join-password');
const cancelJoinBtn = document.getElementById('cancel-join-btn');
const confirmJoinBtn = document.getElementById('confirm-join-btn');

// DOM 요소 - 게임 화면
const blackjackGame = document.getElementById('blackjack-game');
const gameUserName = document.getElementById('game-user-name');
const gameUserBalance = document.getElementById('game-user-balance');
const roomTitle = document.getElementById('room-title');
const currentPlayersEl = document.getElementById('current-players');
const maxRoomPlayers = document.getElementById('max-room-players');
const roomMinBet = document.getElementById('room-min-bet');
const leaveRoomBtn = document.getElementById('leave-room');

// DOM 요소 - 게임 인터페이스
const dealerCardsEl = document.getElementById('dealer-cards');
const dealerValue = document.getElementById('dealer-value');
const playersContainer = document.getElementById('players-container');
const roomPlayersList = document.getElementById('room-players-list');
const gameLogContainer = document.getElementById('game-log-container');
const betAmount = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const bettingControls = document.getElementById('betting-controls');
const playControls = document.getElementById('play-controls');
const hitBtn = document.getElementById('hit-btn');
const standBtn = document.getElementById('stand-btn');
const doubleBtn = document.getElementById('double-btn');
const waitingMessage = document.getElementById('waiting-message');
const blackjackChatMessages = document.getElementById('blackjack-chat-messages');
const blackjackChatInput = document.getElementById('blackjack-chat-input');
const blackjackSendChatBtn = document.getElementById('blackjack-send-chat-btn');
const chipValues = [1, 5, 25, 100, 500]; // 칩 값 추가
let selectedChip = null; // 현재 선택된 칩

// 초기화 함수
document.addEventListener('DOMContentLoaded', () => {
    // 이벤트 리스너 설정
    setupEventListeners();

    // 소켓 이벤트 리스너 설정
    setupSocketListeners();

    // 세션에서 사용자 데이터 확인
    checkSession();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 메뉴로 돌아가기
    backToMenuBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });

    // 로그아웃
    lobbyLogoutBtn.addEventListener('click', handleLogout);

    // 방 생성 모달
    createRoomBtn.addEventListener('click', () => showModal(roomCreateModal));
    cancelCreateBtn.addEventListener('click', () => hideModal(roomCreateModal));
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            hideModal(roomCreateModal);
            hideModal(roomJoinModal);
        });
    });

    // 비밀번호 토글
    passwordToggle.addEventListener('change', () => {
        const passwordField = document.querySelector('.password-field');
        if (passwordToggle.checked) {
            passwordField.classList.remove('hidden');
        } else {
            passwordField.classList.add('hidden');
            roomPassword.value = '';
        }
    });

    // 방 생성 확인
    confirmCreateBtn.addEventListener('click', createRoom);

    // 참가 모달 취소
    cancelJoinBtn.addEventListener('click', () => hideModal(roomJoinModal));

    // 참가 확인
    confirmJoinBtn.addEventListener('click', joinRoom);

    // 방 검색
    searchBtn.addEventListener('click', () => filterRooms());
    roomSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') filterRooms();
    });

    // 필터 변경
    filterPlayers.addEventListener('change', filterRooms);
    filterBet.addEventListener('change', filterRooms);

    // 게임 내 이벤트
    leaveRoomBtn.addEventListener('click', leaveRoom);
    placeBetBtn.addEventListener('click', placeBet);
    hitBtn.addEventListener('click', hitCard);
    standBtn.addEventListener('click', stand);
    doubleBtn.addEventListener('click', doubleDown);

    // 채팅
    blackjackSendChatBtn.addEventListener('click', sendChatMessage);
    blackjackChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
}

// 소켓 이벤트 설정
function setupSocketListeners() {
    // 연결 이벤트
    socket.on('connect', () => {
        console.log('Socket connected');
        
        // 이미 사용자 데이터가 있으면 서버에 전송
        if (currentUser) {
            socket.emit('set_user', currentUser);
            // 방 목록 요청
            setTimeout(() => {
                socket.emit('request_rooms');
            }, 500);
        }
    });
    
    // 로그인 응답
    socket.on('login_response', (data) => {
        if (data.success) {
            currentUser = data.user;
            updateUserInfo();
        }
    });

    // 방 목록 업데이트
    socket.on('rooms_update', (rooms) => {
        console.log('Rooms updated:', rooms);
        updateRoomsList(rooms);
    });

    // 방 생성 응답
    socket.on('room_created', (data) => {
        console.log('Room created response:', data);
        if (data.success) {
            hideModal(roomCreateModal);
            currentRoom = data.room;
            joinRoomSuccess(data.room);
        } else {
            alert('방 생성에 실패했습니다: ' + data.message);
        }
    });

    // 방 참가 응답
    socket.on('room_joined', (data) => {
        console.log('Room joined response:', data);
        if (data.success) {
            hideModal(roomJoinModal);
            currentRoom = data.room;
            joinRoomSuccess(data.room);
        } else {
            alert('방 참가에 실패했습니다: ' + data.message);
        }
    });

    // 플레이어 입장
    socket.on('player_joined', (data) => {
        roomPlayers = data.players;
        updateRoomInfo();
        updatePlayersList();
        addGameLog(`${data.username}님이 입장했습니다.`);
    });

    // 플레이어 퇴장
    socket.on('player_left', (data) => {
        roomPlayers = data.players;
        updateRoomInfo();
        updatePlayersList();
        addGameLog(`${data.username}님이 퇴장했습니다.`);
    });

    // 베팅 시작
    socket.on('betting_started', () => {
        startBettingRound();
    });

    // 플레이어 베팅
    socket.on('player_bet', (data) => {
        updatePlayerBet(data.username, data.amount);
        addGameLog(`${data.username}님이 $${data.amount}를 베팅했습니다.`);
    });

    // 게임 시작
    socket.on('game_started', (data) => {
        startGame(data);
    });

    // 카드 받기
    socket.on('card_dealt', (data) => {
        dealCard(data.to, data.card, data.handValue);
    });

    // 플레이어 턴
    socket.on('player_turn', (data) => {
        if (data.username === currentUser.username) {
            activatePlayerControls(data.canDouble);
        }
        addGameLog(`${data.username}님의 차례입니다.`);
    });

    // 플레이어 액션
    socket.on('player_action', (data) => {
        addGameLog(`${data.username}님이 ${getActionText(data.action)}했습니다.`);
    });

    // 게임 결과
    socket.on('game_result', (data) => {
        showGameResult(data);
    });

    // 채팅 메시지
    socket.on('chat_message', (data) => {
        addChatMessage(data);
    });
    
    // 에러 메시지
    socket.on('error', (data) => {
        alert(data.message || '오류가 발생했습니다.');
    });
}

// 액션 텍스트 얻기
function getActionText(action) {
    switch(action) {
        case 'hit': return '히트';
        case 'stand': return '스탠드';
        case 'double': return '더블다운';
        default: return action;
    }
}

// 세션 확인
function checkSession() {
    const userData = localStorage.getItem('user');
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
            updateUserInfo();
            showLobbyScreen();
            
            // 사용자 데이터를 소켓에 설정
            socket.emit('set_user', currentUser);
            
            // 방 목록 요청
            setTimeout(() => {
                socket.emit('request_rooms');
            }, 1000); // 소켓 연결 후 요청하기 위해 지연
        } catch (e) {
            console.error('세션 데이터 파싱 오류:', e);
            localStorage.removeItem('user');
            window.location.href = '/';
        }
    } else {
        window.location.href = '/';
    }
}

// 유저 정보 업데이트
function updateUserInfo() {
    if (currentUser) {
        lobbyUserName.textContent = currentUser.username;
        lobbyUserBalance.textContent = `$${currentUser.balance}`;
        gameUserName.textContent = currentUser.username;
        gameUserBalance.textContent = `$${currentUser.balance}`;
    }
}

// 로그아웃 처리
function handleLogout() {
    socket.emit('logout');
    localStorage.removeItem('user');
    window.location.href = '/';
}

// 모달 표시
function showModal(modal) {
    modal.style.display = 'flex';
}

// 모달 숨기기
function hideModal(modal) {
    modal.style.display = 'none';
}

// 방 생성
function createRoom() {
    const name = roomName.value.trim();
    if (!name) {
        alert('방 이름을 입력하세요.');
        return;
    }
    
    const players = parseInt(maxPlayers.value);
    const bet = parseInt(minBet.value);
    const hasPassword = passwordToggle.checked;
    const password = hasPassword ? roomPassword.value : '';

    if (hasPassword && !password) {
        alert('비밀번호를 입력하세요.');
        return;
    }

    console.log('Creating room:', { name, maxPlayers: players, minBet: bet, hasPassword, password });
    
    socket.emit('create_room', {
        name: name,
        maxPlayers: players,
        minBet: bet,
        hasPassword: hasPassword,
        password: password
    });
}

// 방 참가 모달 설정
function setupJoinModal(room) {
    joinRoomName.textContent = room.name;
    joinRoomOwner.textContent = room.owner;
    joinRoomPlayers.textContent = `${room.players.length}/${room.maxPlayers}`;
    joinRoomBet.textContent = `$${room.minBet}`;

    const passwordField = document.querySelector('#room-join-modal .password-field');
    if (room.hasPassword) {
        passwordField.classList.remove('hidden');
    } else {
        passwordField.classList.add('hidden');
        joinPassword.value = '';
    }

    confirmJoinBtn.dataset.roomId = room.id;
    showModal(roomJoinModal);
}

// 방 참가
function joinRoom() {
    const roomId = confirmJoinBtn.dataset.roomId;
    const password = joinPassword.value;

    socket.emit('join_room', {
        roomId: roomId,
        password: password
    });
}

// 방 참가 성공
function joinRoomSuccess(room) {
    currentRoom = room;
    roomPlayers = room.players;
    showGameScreen();
    updateRoomInfo();
    resetGameUI();
    
    // 방 참가 성공 로그 추가
    addGameLog(`${currentRoom.name} 방에 참가했습니다.`);
}

// 방 떠나기
function leaveRoom() {
    console.log('방 나가기 요청');
    socket.emit('leave_room');
    currentRoom = null;
    roomPlayers = [];
    showLobbyScreen();
    setTimeout(() => {
        socket.emit('request_rooms');
    }, 500);
}

// 베팅하기
function placeBet() {
    const amount = parseInt(betAmount.value);
    
    if (isNaN(amount) || amount < currentRoom.minBet) {
        // 애니메이션 효과와 함께 오류 메시지 표시
        showErrorMessage(`최소 베팅액($${currentRoom.minBet}) 이상 베팅해야 합니다.`);
        return;
    }

    if (amount > currentUser.balance) {
        showErrorMessage('보유 금액보다 많이 베팅할 수 없습니다.');
        return;
    }

    currentBet = amount;
    socket.emit('place_bet', { amount: amount });
    
    // UI 업데이트
    bettingControls.classList.add('hidden');
    waitingMessage.classList.remove('hidden');
    
    // 베팅 효과음 재생
    try {
        const betSound = new Audio('/sounds/chip_sound.mp3');
        betSound.volume = 0.5;
        betSound.play().catch(e => console.log('사운드 재생 실패:', e));
    } catch (e) {
        console.log('사운드 재생 에러:', e);
    }
    
    // 현재 플레이어의 위치 찾기
    const playerSpot = document.querySelector(`.player-spot[data-username="${currentUser.username}"]`);
    if (playerSpot) {
        // 베팅 애니메이션
        animateBet(playerSpot, amount);
    }
}

// 오류 메시지 표시
function showErrorMessage(message) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.textContent = message;
    
    // body에 추가
    document.body.appendChild(errorContainer);
    
    // 애니메이션
    setTimeout(() => {
        errorContainer.classList.add('show');
        
        // 3초 후 제거
        setTimeout(() => {
            errorContainer.classList.remove('show');
            setTimeout(() => errorContainer.remove(), 3000);
        }, 3000);
    }, 10);
}

// 베팅 라운드 시작
function startBettingRound() {
    // UI 초기화
    betAmount.value = currentRoom ? currentRoom.minBet : 10;
    
    // 칩 컨트롤 생성 및 초기화
    initChipControls();
    
    bettingControls.classList.remove('hidden');
    playControls.classList.add('hidden');
    waitingMessage.classList.add('hidden');
}

// 칩 컨트롤 초기화
function initChipControls() {
    // 기존 칩 컨트롤러가 있으면 제거
    const existingChipControls = document.querySelector('.chip-controls');
    if (existingChipControls) {
        existingChipControls.remove();
    }
    
    // 새 칩 컨트롤러 생성
    const chipControlsContainer = document.createElement('div');
    chipControlsContainer.className = 'chip-controls';
    
    // 각 값별 칩 생성
    chipValues.forEach(value => {
        const chip = document.createElement('div');
        chip.className = `betting-chip chip-${value}`;
        chip.textContent = value;
        
        // 칩을 클릭하면 베팅액 변경
        chip.addEventListener('click', () => {
            // 이전 선택 칩 스타일 제거
            const selectedChips = document.querySelectorAll('.betting-chip.selected');
            selectedChips.forEach(c => c.classList.remove('selected'));
            
            // 현재 칩 선택
            chip.classList.add('selected');
            selectedChip = value;
            
            // 현재 베팅액에 칩 값 추가
            const currentAmount = parseInt(betAmount.value) || 0;
            betAmount.value = currentAmount + value;
            
            // 칩 클릭 효과음
            try {
                const chipSound = new Audio('/sounds/chip_click.mp3');
                chipSound.volume = 0.3;
                chipSound.play().catch(e => console.log('사운드 재생 실패:', e));
            } catch (e) {
                console.log('사운드 재생 에러:', e);
            }
            
            // 버튼 활성화/비활성화
            updateBetButtonState();
        });
        
        chipControlsContainer.appendChild(chip);
    });
    
    // 베팅 제어 버튼 추가
    const betControls = document.createElement('div');
    betControls.className = 'bet-controls';
    
    // 베팅액 초기화 버튼
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-bet-btn';
    clearBtn.textContent = '초기화';
    clearBtn.addEventListener('click', () => {
        betAmount.value = currentRoom ? currentRoom.minBet : 10;
        updateBetButtonState();
    });
    
    // 최대 베팅 버튼
    const maxBetBtn = document.createElement('button');
    maxBetBtn.className = 'max-bet-btn';
    maxBetBtn.textContent = '최대 베팅';
    maxBetBtn.addEventListener('click', () => {
        betAmount.value = currentUser.balance;
        updateBetButtonState();
    });
    
    betControls.appendChild(clearBtn);
    betControls.appendChild(maxBetBtn);
    
    // 컨트롤 컨테이너에 추가
    bettingControls.prepend(chipControlsContainer);
    bettingControls.insertBefore(betControls, placeBetBtn);
    
    // 초기 버튼 상태 설정
    updateBetButtonState();
}

// 베팅 버튼 상태 업데이트
function updateBetButtonState() {
    const amount = parseInt(betAmount.value) || 0;
    
    // 최소 베팅액보다 적거나 잔액보다 많으면 비활성화
    if (amount < (currentRoom ? currentRoom.minBet : 10) || amount > currentUser.balance) {
        placeBetBtn.disabled = true;
        placeBetBtn.classList.add('disabled');
    } else {
        placeBetBtn.disabled = false;
        placeBetBtn.classList.remove('disabled');
    }
}

// 히트
function hitCard() {
    socket.emit('player_action', { action: 'hit' });
    deactivatePlayerControls();
}

// 스탠드
function stand() {
    socket.emit('player_action', { action: 'stand' });
    deactivatePlayerControls();
}

// 더블다운
function doubleDown() {
    if (currentUser.balance < currentBet * 2) {
        alert('더블다운에 필요한 금액이 부족합니다.');
        return;
    }
    
    socket.emit('player_action', { action: 'double' });
    deactivatePlayerControls();
}

// 채팅 메시지 전송
function sendChatMessage() {
    const message = blackjackChatInput.value.trim();
    if (message) {
        socket.emit('chat_message', {
            message: message,
            room: currentRoom.id
        });
        blackjackChatInput.value = '';
    }
}

// 채팅 메시지 추가
function addChatMessage(data) {
    const chatDiv = document.createElement('div');
    chatDiv.className = 'chat-message';
    
    const time = new Date(data.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    
    chatDiv.innerHTML = `
        <span class="chat-time">[${timeStr}]</span>
        <span class="chat-user">${data.username}:</span>
        <span class="chat-text">${data.message}</span>
    `;
    
    blackjackChatMessages.appendChild(chatDiv);
    blackjackChatMessages.scrollTop = blackjackChatMessages.scrollHeight;
}

// 게임 로그 추가
function addGameLog(message) {
    const logDiv = document.createElement('div');
    logDiv.className = 'log-entry';
    
    const time = new Date();
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    
    logDiv.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-text">${message}</span>
    `;
    
    gameLogContainer.appendChild(logDiv);
    gameLogContainer.scrollTop = gameLogContainer.scrollHeight;
}

// 방 목록 필터링
function filterRooms() {
    const searchTerm = roomSearch.value.toLowerCase();
    const playerFilter = filterPlayers.value;
    const betFilter = filterBet.value;
    
    const rows = roomsBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const name = row.querySelector('td:first-child').textContent.toLowerCase();
        const players = row.querySelector('td:nth-child(3)').textContent.split('/');
        const currentPlayers = parseInt(players[0]);
        const bet = parseInt(row.querySelector('td:nth-child(4)').textContent.replace('$', ''));
        
        let showRow = name.includes(searchTerm);
        
        if (playerFilter !== 'all') {
            const filterValue = parseInt(playerFilter);
            showRow = showRow && currentPlayers === filterValue;
        }
        
        if (betFilter !== 'all') {
            if (betFilter === 'low' && (bet < 10 || bet > 50)) showRow = false;
            if (betFilter === 'medium' && (bet < 51 || bet > 200)) showRow = false;
            if (betFilter === 'high' && bet < 201) showRow = false;
        }
        
        row.style.display = showRow ? '' : 'none';
    });
}

// 방 목록 업데이트
function updateRoomsList(rooms) {
    roomsBody.innerHTML = '';
    
    if (rooms.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="6" class="no-rooms">생성된 방이 없습니다. 새 방을 만들어보세요!</td>
        `;
        roomsBody.appendChild(row);
        return;
    }
    
    rooms.forEach(room => {
        const row = document.createElement('tr');
        
        let roomName = room.name;
        if (room.hasPassword) {
            roomName = `<div class="private-room"><i class="fas fa-lock"></i> ${room.name}</div>`;
        }
        
        row.innerHTML = `
            <td>${roomName}</td>
            <td>${room.owner}</td>
            <td>${room.players.length}/${room.maxPlayers}</td>
            <td>$${room.minBet}</td>
            <td><span class="room-status ${room.status === 'waiting' ? 'status-waiting' : 'status-playing'}">${room.status === 'waiting' ? '대기중' : '게임중'}</span></td>
            <td>${room.players.length < room.maxPlayers ? '<button class="join-btn">참가</button>' : '인원초과'}</td>
        `;
        
        roomsBody.appendChild(row);
        
        const joinBtn = row.querySelector('.join-btn');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => setupJoinModal(room));
        }
    });
}

// 방 정보 업데이트
function updateRoomInfo() {
    if (!currentRoom) return;
    
    roomTitle.textContent = currentRoom.name;
    currentPlayersEl.textContent = currentRoom.players ? currentRoom.players.length : 0;
    maxRoomPlayers.textContent = currentRoom.maxPlayers;
    roomMinBet.textContent = currentRoom.minBet;
    
    // 최소 베팅액 설정
    betAmount.min = currentRoom.minBet;
    if (parseInt(betAmount.value) < currentRoom.minBet) {
        betAmount.value = currentRoom.minBet;
    }
}

// 플레이어 목록 업데이트
function updatePlayersList() {
    roomPlayersList.innerHTML = '';
    
    if (!currentRoom || !currentRoom.players || currentRoom.players.length === 0) {
        return;
    }
    
    currentRoom.players.forEach(player => {
        const li = document.createElement('li');
        
        let statusClass = 'player-status-waiting';
        let statusText = '대기중';
        
        if (player.status === 'betting') {
            statusClass = 'player-status-waiting';
            statusText = '베팅중';
        } else if (player.status === 'playing') {
            statusClass = 'player-status-playing';
            statusText = '플레이중';
        } else if (player.status === 'ready') {
            statusClass = 'player-status-ready';
            statusText = '준비완료';
        }
        
        li.innerHTML = `
            <span class="player-item-name">${player.username}${player.username === currentRoom.owner ? ' (방장)' : ''}</span>
            <span class="player-item-status ${statusClass}">${statusText}</span>
        `;
        
        roomPlayersList.appendChild(li);
    });
}

// 플레이어 베팅 업데이트
function updatePlayerBet(username, amount) {
    const playerSpot = document.querySelector(`.player-spot[data-username="${username}"]`);
    if (playerSpot) {
        const betEl = playerSpot.querySelector('.player-bet');
        if (betEl) {
            betEl.textContent = `베팅: $${amount}`;
        }
    }
}

// 카드 딜링
function dealCard(target, card, handValue) {
    let container;
    let valueDisplay;
    
    if (target === 'dealer') {
        container = dealerCardsEl;
        valueDisplay = dealerValue;
        
        // 히든 카드가 아닌 경우 딜러 카드 저장
        if (!card.hidden) {
            myDealerCards.push(card);
        }
    } else {
        const playerSpot = document.querySelector(`.player-spot[data-username="${target}"]`);
        if (!playerSpot) return;
        
        container = playerSpot.querySelector('.cards-container');
        valueDisplay = playerSpot.querySelector('.hand-value');
        
        // 자신의 카드인 경우 저장
        if (target === currentUser.username) {
            myCards.push(card);
        }
    }
    
    // 카드 생성
    const cardElement = document.createElement('div');
    
    // 카드의 뒷면과 앞면을 포함하는 컨테이너 (3D 플립용)
    const cardContainer = document.createElement('div');
    cardContainer.className = 'card-container';
    
    if (card.hidden) {
        // 히든 카드 (딜러 첫 카드)
        cardElement.className = 'card card-back';
        
        // 카드 뒷면 디자인
        cardElement.innerHTML = `
            <div class="card-pattern"></div>
            <div class="card-logo">♠♥♣♦</div>
        `;
    } else {
        // 일반 카드
        const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        cardElement.className = `card ${isRed ? 'red' : 'black'}`;
        
        // 카드 디자인 개선
        cardElement.innerHTML = `
            <div class="card-corner top-left">
                <div class="card-value">${getCardDisplayValue(card.value)}</div>
                <div class="card-suit">${getSuitSymbol(card.suit)}</div>
            </div>
            <div class="card-center">${getSuitSymbol(card.suit)}</div>
            <div class="card-corner bottom-right">
                <div class="card-value">${getCardDisplayValue(card.value)}</div>
                <div class="card-suit">${getSuitSymbol(card.suit)}</div>
            </div>
        `;
    }
    
    // 카드 컨테이너에 카드 추가
    cardContainer.appendChild(cardElement);
    container.appendChild(cardContainer);
    
    // 딜 애니메이션 적용
    setTimeout(() => {
        cardContainer.classList.add('dealt');
        
        // 타깃이 현재 플레이어일 경우 하이라이트 효과
        if (target === currentUser.username && !card.hidden) {
            setTimeout(() => {
                cardContainer.classList.add('highlight');
                setTimeout(() => {
                    cardContainer.classList.remove('highlight');
                }, 500);
            }, 300);
        }
    }, 50);
    
    // 핸드 값 업데이트 (애니메이션 후)
    if (valueDisplay && !card.hidden) {
        setTimeout(() => {
            valueDisplay.textContent = handValue;
            
            // 21에 가까울수록 녹색으로, 버스트면 빨간색으로
            valueDisplay.className = 'hand-value';
            if (handValue > 21) {
                valueDisplay.classList.add('bust');
                // 버스트 효과
                const bustEffect = document.createElement('div');
                bustEffect.className = 'bust-effect';
                bustEffect.textContent = 'BUST!';
                playerSpot.appendChild(bustEffect);
                
                setTimeout(() => {
                    bustEffect.remove();
                }, 2000);
            } else if (handValue === 21) {
                valueDisplay.classList.add('blackjack');
                
                // 21 효과
                if (target === currentUser.username) {
                    const blackjackEffect = document.createElement('div');
                    blackjackEffect.className = 'blackjack-effect';
                    blackjackEffect.textContent = '21!';
                    playerSpot.appendChild(blackjackEffect);
                    
                    setTimeout(() => {
                        blackjackEffect.remove();
                    }, 2000);
                }
            } else if (handValue >= 17) {
                valueDisplay.classList.add('good');
            }
        }, 500);
    }
}

// 카드 표시 값 가져오기
function getCardDisplayValue(value) {
    switch(value) {
        case 1: return 'A';
        case 11: return 'J';
        case 12: return 'Q';
        case 13: return 'K';
        default: return value;
    }
}

// 카드 무늬 기호 가져오기
function getSuitSymbol(suit) {
    switch(suit) {
        case 'hearts': return '♥';
        case 'diamonds': return '♦';
        case 'clubs': return '♣';
        case 'spades': return '♠';
        default: return '';
    }
}

// 게임 시작
function startGame(data) {
    resetCardsUI();
    setupGameTable(data.players);
}

// 플레이어 컨트롤 활성화
function activatePlayerControls(canDoubleDown) {
    playControls.classList.remove('hidden');
    waitingMessage.classList.add('hidden');
    
    doubleBtn.disabled = !canDoubleDown;
}

// 플레이어 컨트롤 비활성화
function deactivatePlayerControls() {
    playControls.classList.add('hidden');
    waitingMessage.classList.remove('hidden');
}

// 게임 테이블 설정
function setupGameTable(players) {
    playersContainer.innerHTML = '';
    
    // 플레이어 수에 따라 레이아웃 조정
    playersContainer.className = `players-container players-${players.length}`;
    
    players.forEach((player, index) => {
        const playerSpot = document.createElement('div');
        playerSpot.className = 'player-spot';
        playerSpot.dataset.username = player.username;
        
        // 내 자리인지 표시
        if (player.username === currentUser.username) {
            playerSpot.classList.add('current-player');
        }
        
        // 플레이어 자리마다 다른 색상 부여
        playerSpot.classList.add(`player-color-${index % 4 + 1}`);
        
        // HTML 구조 개선
        playerSpot.innerHTML = `
            <div class="player-info">
                <div class="player-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="player-details">
                    <div class="player-tag">${player.username}${player.username === currentRoom.owner ? ' <i class="fas fa-crown owner-crown"></i>' : ''}</div>
                    <div class="player-bet-container">
                        <div class="chip-icon"></div>
                        <div class="player-bet">$${player.bet}</div>
                    </div>
                </div>
            </div>
            <div class="cards-container"></div>
            <div class="hand-value">0</div>
        `;
        
        playersContainer.appendChild(playerSpot);
        
        // 베팅 애니메이션 (이미 베팅한 경우)
        if (player.bet > 0) {
            animateBet(playerSpot, player.bet);
        }
    });
    
    // 딜러 영역 스타일 개선
    const dealerArea = document.querySelector('.dealer-area');
    if (dealerArea) {
        dealerArea.innerHTML = `
            <div class="dealer-title">
                <i class="fas fa-user-tie"></i> 딜러
            </div>
            <div id="dealer-cards" class="cards-container"></div>
            <div id="dealer-value" class="hand-value">?</div>
        `;
    }
}

// 베팅 애니메이션
function animateBet(playerSpot, amount) {
    const chipContainer = document.createElement('div');
    chipContainer.className = 'betting-chips';
    
    // 베팅 금액에 따라 칩 스택 생성
    const chipValues = [500, 100, 25, 5, 1];
    let remaining = amount;
    
    chipValues.forEach(value => {
        const count = Math.floor(remaining / value);
        remaining %= value;
        
        for (let i = 0; i < count; i++) {
            const chip = document.createElement('div');
            chip.className = `chip chip-${value}`;
            chip.textContent = value;
            chip.style.zIndex = 10 - i;
            chip.style.top = `${-5 * i}px`;
            chipContainer.appendChild(chip);
        }
    });
    
    playerSpot.querySelector('.player-bet-container').appendChild(chipContainer);
}

// 게임 결과 표시
function showGameResult(data) {
    console.log('게임 결과:', data);
    
    // 딜러 카드 모두 공개
    dealerValue.textContent = data.dealerValue;
    
    // 결과 처리
    data.results.forEach(result => {
        const playerSpot = document.querySelector(`.player-spot[data-username="${result.username}"]`);
        
        if (playerSpot) {
            // 결과 상태 표시
            const statusDiv = document.createElement('div');
            
            // 결과에 따라 다른 스타일과 애니메이션 적용
            if (result.result === 'win' || result.result === 'blackjack') {
                statusDiv.className = 'player-status win-status';
                
                // 이펙트 생성
                const winEffectContainer = document.createElement('div');
                winEffectContainer.className = 'win-effect-container';
                
                // 승리 메시지
                const winMessage = document.createElement('div');
                winMessage.className = 'win-message';
                winMessage.textContent = result.result === 'blackjack' ? '블랙잭!' : '승리!';
                
                // 금액 표시
                const winAmount = document.createElement('div');
                winAmount.className = 'win-amount';
                winAmount.textContent = `+$${result.winAmount}`;
                
                // 효과 추가
                winEffectContainer.appendChild(winMessage);
                winEffectContainer.appendChild(winAmount);
                
                // 동전 튀는 효과
                if (result.username === currentUser.username) {
                    for (let i = 0; i < 12; i++) {
                        const coin = document.createElement('div');
                        coin.className = 'coin';
                        // 랜덤 위치 및 딜레이
                        coin.style.left = `${Math.random() * 80}%`;
                        coin.style.animationDelay = `${Math.random() * 0.5}s`;
                        winEffectContainer.appendChild(coin);
                    }
                    
                    // 승리 사운드 효과 (소리가 있다면)
                    const winSound = result.result === 'blackjack' ? 
                        new Audio('/sounds/blackjack_win.mp3') : 
                        new Audio('/sounds/win.mp3');
                    winSound.volume = 0.6;
                    setTimeout(() => {
                        try {
                            winSound.play().catch(e => console.log('사운드 재생 실패:', e));
                        } catch (e) {
                            console.log('사운드 재생 에러:', e);
                        }
                    }, 300);
                }
                
                playerSpot.appendChild(winEffectContainer);
                
                // 3초 후 이펙트 제거
                setTimeout(() => {
                    winEffectContainer.classList.add('fade-out');
                    setTimeout(() => {
                        winEffectContainer.remove();
                    }, 500);
                }, 3000);
            } else if (result.result === 'lose') {
                statusDiv.className = 'player-status lose-status';
                // 패배 효과
                if (result.username === currentUser.username) {
                    const loseEffect = document.createElement('div');
                    loseEffect.className = 'lose-effect';
                    loseEffect.textContent = '패배';
                    playerSpot.appendChild(loseEffect);
                    
                    // 2초 후 효과 제거
                    setTimeout(() => {
                        loseEffect.classList.add('fade-out');
                        setTimeout(() => {
                            loseEffect.remove();
                        }, 500);
                    }, 2000);
                }
            } else {
                // 무승부
                statusDiv.className = 'player-status push-status';
            }
            
            statusDiv.textContent = getResultText(result.result);
            playerSpot.appendChild(statusDiv);
            
            // 로그 추가
            let resultMessage = `${result.username}님이 `;
            
            if (result.result === 'win') {
                resultMessage += `$${result.winAmount}를 얻었습니다!`;
            } else if (result.result === 'lose') {
                resultMessage += `$${result.bet}를 잃었습니다.`;
            } else if (result.result === 'push') {
                resultMessage += `무승부로 베팅액을 돌려받았습니다.`;
            } else if (result.result === 'blackjack') {
                resultMessage += `블랙잭으로 $${result.winAmount}를 얻었습니다!`;
            }
            
            addGameLog(resultMessage);
            
            // 내 결과인 경우 잔액 업데이트
            if (result.username === currentUser.username) {
                let balanceChange = 0;
                
                if (result.result === 'win' || result.result === 'blackjack') {
                    balanceChange = result.winAmount;
                    currentUser.balance += result.winAmount;
                } else if (result.result === 'lose') {
                    balanceChange = -result.bet;
                    currentUser.balance -= result.bet;
                }
                
                // 잔액 변경 애니메이션
                if (balanceChange !== 0) {
                    const balanceEffect = document.createElement('div');
                    balanceEffect.className = `balance-effect ${balanceChange > 0 ? 'positive' : 'negative'}`;
                    balanceEffect.textContent = `${balanceChange > 0 ? '+' : ''}$${balanceChange}`;
                    
                    // 게임 유저 밸런스 옆에 표시
                    const balanceContainer = document.querySelector('.game-user-info');
                    if (balanceContainer) {
                        balanceContainer.appendChild(balanceEffect);
                        
                        // 2초 후 효과 제거
                        setTimeout(() => {
                            balanceEffect.classList.add('fade-out');
                            setTimeout(() => {
                                balanceEffect.remove();
                            }, 500);
                        }, 2000);
                    }
                }
                
                updateUserInfo();
                localStorage.setItem('user', JSON.stringify(currentUser));
            }
        }
    });
    
    // 5초 후 다음 라운드 시작
    setTimeout(() => {
        const resultElements = document.querySelectorAll('.player-status, .win-effect-container, .lose-effect');
        resultElements.forEach(el => {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 500);
        });
        
        resetCardsUI();
        myCards = [];
        myDealerCards = [];
        
        if (currentRoom && currentRoom.status === 'waiting') {
            startBettingRound();
        }
    }, 5000);
}

// 결과 텍스트 가져오기
function getResultText(result) {
    switch(result) {
        case 'win': return '승리!';
        case 'lose': return '패배';
        case 'push': return '무승부';
        case 'blackjack': return '블랙잭!';
        default: return result;
    }
}

// 카드 UI 초기화
function resetCardsUI() {
    dealerCardsEl.innerHTML = '';
    dealerValue.textContent = '?';
}

// 게임 UI 초기화
function resetGameUI() {
    resetCardsUI();
    playersContainer.innerHTML = '';
    roomPlayersList.innerHTML = '';
    gameLogContainer.innerHTML = '';
    blackjackChatMessages.innerHTML = '';
    
    bettingControls.classList.add('hidden');
    playControls.classList.add('hidden');
    waitingMessage.classList.remove('hidden');
}

// 로비 화면 표시
function showLobbyScreen() {
    blackjackLobby.classList.remove('hidden');
    blackjackGame.classList.add('hidden');
}

// 게임 화면 표시
function showGameScreen() {
    blackjackLobby.classList.add('hidden');
    blackjackGame.classList.remove('hidden');
}

// URL에서 메뉴 버튼 링크 수정
document.addEventListener('DOMContentLoaded', function() {
    // 메인 메뉴 화면에서 블랙잭 버튼 활성화
    if (window.opener) {
        const blackjackBtn = window.opener.document.querySelector('.play-btn[data-game="blackjack"]');
        if (blackjackBtn) {
            blackjackBtn.classList.remove('coming-soon');
            blackjackBtn.disabled = false;
            blackjackBtn.textContent = '플레이하기';
        }
    }
}); 