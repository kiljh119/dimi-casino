const User = require('../models/User');
const { 
    createDeck, 
    calculateHandValue, 
    shouldDealerDraw, 
    determineResult, 
    calculateWinAmount 
} = require('../utils/blackjackUtils');

// 블랙잭 방 관리
const blackjackRooms = {};
let roomIdCounter = 1;

// 블랙잭 소켓 핸들러 설정
function setupBlackjackSocket(io) {
    const blackjackNamespace = io;
    
    blackjackNamespace.on('connection', (socket) => {
        console.log('블랙잭 소켓 연결:', socket.id);
        
        // 사용자 정보 설정 (기존 인증 시스템 연동)
        socket.on('set_user', (userData) => {
            if (!userData) {
                console.log('사용자 정보가 없습니다.');
                return;
            }
            console.log('사용자 설정:', userData.username);
            socket.user = userData;
        });
        
        // 방 목록 요청
        socket.on('request_rooms', () => {
            console.log('방 목록 요청:', socket.id);
            const rooms = Object.values(blackjackRooms).map(room => ({
                id: room.id,
                name: room.name,
                owner: room.owner,
                players: room.players.map(p => ({ username: p.username })),
                maxPlayers: room.maxPlayers,
                minBet: room.minBet,
                hasPassword: !!room.password,
                status: room.status
            }));
            
            socket.emit('rooms_update', rooms);
        });
        
        // 방 생성
        socket.on('create_room', async (data) => {
            try {
                if (!socket.user) {
                    console.log('방 생성 실패: 로그인 필요', socket.id);
                    socket.emit('room_created', { success: false, message: '로그인이 필요합니다.' });
                    return;
                }
                
                console.log('방 생성 요청:', data);
                const { name, maxPlayers, minBet, hasPassword, password } = data;
                
                // 방 ID 생성
                const roomId = `blackjack_${roomIdCounter++}`;
                
                // 방 생성
                blackjackRooms[roomId] = {
                    id: roomId,
                    name,
                    owner: socket.user.username,
                    players: [{ 
                        id: socket.id, 
                        username: socket.user.username, 
                        balance: socket.user.balance,
                        status: 'waiting',
                        cards: [],
                        bet: 0
                    }],
                    maxPlayers: parseInt(maxPlayers) || 4,
                    minBet: parseInt(minBet) || 10,
                    password: hasPassword ? password : null,
                    status: 'waiting',
                    deck: [],
                    dealerCards: [],
                    currentPlayerIndex: 0,
                    stage: 'waiting'
                };
                
                // 룸 조인
                socket.join(roomId);
                socket.currentRoom = roomId;
                
                // 확인 응답
                socket.emit('room_created', { 
                    success: true, 
                    room: {
                        id: roomId,
                        name,
                        owner: socket.user.username,
                        players: blackjackRooms[roomId].players,
                        maxPlayers: blackjackRooms[roomId].maxPlayers,
                        minBet: blackjackRooms[roomId].minBet,
                        status: 'waiting'
                    }
                });
                
                console.log('방 생성 성공:', roomId);
                
                // 방 목록 업데이트
                broadcastRoomsUpdate(blackjackNamespace);
                
                // 첫 베팅 라운드 시작
                startBettingRound(blackjackRooms[roomId], blackjackNamespace);
            } catch (error) {
                console.error('방 생성 오류:', error);
                socket.emit('room_created', { success: false, message: '방 생성 중 오류가 발생했습니다.' });
            }
        });
        
        // 방 참가
        socket.on('join_room', async (data) => {
            try {
                if (!socket.user) {
                    console.log('방 참가 실패: 로그인 필요', socket.id);
                    socket.emit('room_joined', { success: false, message: '로그인이 필요합니다.' });
                    return;
                }
                
                console.log('방 참가 요청:', data);
                const { roomId, password } = data;
                const room = blackjackRooms[roomId];
                
                if (!room) {
                    socket.emit('room_joined', { success: false, message: '존재하지 않는 방입니다.' });
                    return;
                }
                
                if (room.players.length >= room.maxPlayers) {
                    socket.emit('room_joined', { success: false, message: '방이 꽉 찼습니다.' });
                    return;
                }
                
                if (room.status === 'playing') {
                    socket.emit('room_joined', { success: false, message: '게임이 이미 진행 중입니다.' });
                    return;
                }
                
                if (room.password && room.password !== password) {
                    socket.emit('room_joined', { success: false, message: '비밀번호가 일치하지 않습니다.' });
                    return;
                }
                
                // 이미 참가한 경우
                const existingPlayer = room.players.find(p => p.username === socket.user.username);
                if (existingPlayer) {
                    socket.emit('room_joined', { success: false, message: '이미 참가한 방입니다.' });
                    return;
                }
                
                // 플레이어 추가
                room.players.push({
                    id: socket.id,
                    username: socket.user.username,
                    balance: socket.user.balance,
                    status: 'waiting',
                    cards: [],
                    bet: 0
                });
                
                // 룸 조인
                socket.join(roomId);
                socket.currentRoom = roomId;
                
                // 확인 응답
                socket.emit('room_joined', { 
                    success: true, 
                    room: {
                        id: roomId,
                        name: room.name,
                        owner: room.owner,
                        players: room.players,
                        maxPlayers: room.maxPlayers,
                        minBet: room.minBet,
                        status: room.status
                    }
                });
                
                console.log('방 참가 성공:', roomId, socket.user.username);
                
                // 다른 플레이어에게 알림
                socket.to(roomId).emit('player_joined', {
                    username: socket.user.username,
                    players: room.players
                });
                
                // 방 목록 업데이트
                broadcastRoomsUpdate(blackjackNamespace);
                
                // 첫 플레이어면 베팅 라운드 시작
                if (room.players.length === 1) {
                    startBettingRound(room, blackjackNamespace);
                }
            } catch (error) {
                console.error('방 참가 오류:', error);
                socket.emit('room_joined', { success: false, message: '방 참가 중 오류가 발생했습니다.' });
            }
        });
        
        // 방 나가기
        socket.on('leave_room', () => {
            if (!socket.currentRoom) return;
            
            const roomId = socket.currentRoom;
            const room = blackjackRooms[roomId];
            
            if (!room) return;
            
            console.log('방 나가기 요청:', socket.id, socket.user?.username, roomId);
            
            // 플레이어 제거
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const username = room.players[playerIndex].username;
                room.players.splice(playerIndex, 1);
                
                // 룸에서 나가기
                socket.leave(roomId);
                socket.currentRoom = null;
                
                console.log('플레이어 퇴장:', username, roomId);
                
                // 다른 플레이어에게 알림
                socket.to(roomId).emit('player_left', {
                    username: username,
                    players: room.players
                });
                
                // 방이 비었으면 삭제
                if (room.players.length === 0) {
                    console.log('빈 방 삭제:', roomId);
                    delete blackjackRooms[roomId];
                } else {
                    // 방장이 나갔으면 다음 플레이어가 방장
                    if (username === room.owner) {
                        room.owner = room.players[0].username;
                        blackjackNamespace.to(roomId).emit('room_owner_changed', {
                            newOwner: room.owner
                        });
                        console.log('방장 변경:', roomId, room.owner);
                    }
                    
                    // 게임 진행 중이면 게임 초기화
                    if (room.status === 'playing') {
                        console.log('게임 중 퇴장으로 게임 초기화:', roomId);
                        room.status = 'waiting';
                        room.stage = 'waiting';
                        room.players.forEach(p => {
                            p.status = 'waiting';
                            p.cards = [];
                            p.bet = 0;
                        });
                        room.dealerCards = [];
                        
                        // 게임 재시작
                        setTimeout(() => {
                            startBettingRound(room, blackjackNamespace);
                        }, 2000);
                    }
                }
                
                // 방 목록 업데이트
                broadcastRoomsUpdate(blackjackNamespace);
            }
        });
        
        // 베팅
        socket.on('place_bet', async (data) => {
            const { amount } = data;
            
            if (!socket.currentRoom) return;
            
            const roomId = socket.currentRoom;
            const room = blackjackRooms[roomId];
            
            if (!room || room.stage !== 'betting') return;
            
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;
            
            // 최소 베팅액 확인
            if (amount < room.minBet) {
                socket.emit('error', { message: `최소 베팅액은 $${room.minBet}입니다.` });
                return;
            }
            
            // 잔액 확인
            if (amount > player.balance) {
                socket.emit('error', { message: '보유 금액이 부족합니다.' });
                return;
            }
            
            // 베팅 정보 업데이트
            player.bet = amount;
            player.status = 'ready';
            
            // 다른 플레이어에게 알림
            blackjackNamespace.to(roomId).emit('player_bet', {
                username: player.username,
                amount: amount
            });
            
            // 모든 플레이어가 베팅했는지 확인
            const allBet = room.players.every(p => p.status === 'ready');
            if (allBet) {
                // 게임 시작
                startGame(room, blackjackNamespace);
            }
        });
        
        // 플레이어 액션
        socket.on('player_action', (data) => {
            const { action } = data;
            
            if (!socket.currentRoom) return;
            
            const roomId = socket.currentRoom;
            const room = blackjackRooms[roomId];
            
            if (!room || room.stage !== 'playing') return;
            
            const currentPlayer = room.players[room.currentPlayerIndex];
            if (!currentPlayer || currentPlayer.id !== socket.id) return;
            
            // 액션 처리
            handlePlayerAction(action, room, socket, blackjackNamespace);
        });
        
        // 채팅 메시지
        socket.on('chat_message', (data) => {
            if (!socket.user || !socket.currentRoom) return;
            
            const roomId = socket.currentRoom;
            
            // 채팅 메시지 전송
            blackjackNamespace.to(roomId).emit('chat_message', {
                username: socket.user.username,
                message: data.message,
                timestamp: Date.now()
            });
        });
        
        // 연결 종료
        socket.on('disconnect', () => {
            console.log('블랙잭 소켓 연결 종료:', socket.id);
            
            // 방에서 나가기
            if (socket.currentRoom) {
                const roomId = socket.currentRoom;
                const room = blackjackRooms[roomId];
                
                if (room) {
                    // 플레이어 제거
                    const playerIndex = room.players.findIndex(p => p.id === socket.id);
                    if (playerIndex !== -1) {
                        const username = room.players[playerIndex].username;
                        room.players.splice(playerIndex, 1);
                        
                        // 다른 플레이어에게 알림
                        socket.to(roomId).emit('player_left', {
                            username: username,
                            players: room.players
                        });
                        
                        // 방이 비었으면 삭제
                        if (room.players.length === 0) {
                            delete blackjackRooms[roomId];
                        } else {
                            // 방장이 나갔으면 다음 플레이어가 방장
                            if (username === room.owner) {
                                room.owner = room.players[0].username;
                                blackjackNamespace.to(roomId).emit('room_owner_changed', {
                                    newOwner: room.owner
                                });
                            }
                            
                            // 게임 진행 중이면 게임 초기화
                            if (room.status === 'playing') {
                                room.status = 'waiting';
                                room.stage = 'waiting';
                                room.players.forEach(p => {
                                    p.status = 'waiting';
                                    p.cards = [];
                                    p.bet = 0;
                                });
                                room.dealerCards = [];
                                
                                // 게임 재시작
                                startBettingRound(room, blackjackNamespace);
                            }
                        }
                        
                        // 방 목록 업데이트
                        broadcastRoomsUpdate(blackjackNamespace);
                    }
                }
            }
        });
    });
}

// 베팅 라운드 시작
function startBettingRound(room, io) {
    room.stage = 'betting';
    
    // 모든 플레이어 상태 초기화
    room.players.forEach(p => {
        p.status = 'betting';
        p.cards = [];
        p.bet = 0;
    });
    
    // 딜러 카드 초기화
    room.dealerCards = [];
    
    // 덱 새로 생성
    room.deck = createDeck();
    
    // 베팅 시작 알림
    io.to(room.id).emit('betting_started');
}

// 게임 시작
function startGame(room, io) {
    room.status = 'playing';
    room.stage = 'playing';
    
    // 게임 시작 알림
    io.to(room.id).emit('game_started', {
        players: room.players.map(p => ({
            username: p.username,
            bet: p.bet
        }))
    });
    
    // 초기 카드 배분
    dealInitialCards(room, io);
    
    // 현재 플레이어 설정
    room.currentPlayerIndex = 0;
    
    // 첫 플레이어 턴 시작
    startPlayerTurn(room, io);
}

// 초기 카드 배분
function dealInitialCards(room, io) {
    // 각 플레이어에게 2장씩 배분
    for (let i = 0; i < 2; i++) {
        for (const player of room.players) {
            const card = room.deck.pop();
            player.cards.push(card);
            
            const handValue = calculateHandValue(player.cards);
            
            // 카드 배분 알림
            io.to(room.id).emit('card_dealt', {
                to: player.username,
                card: card,
                handValue: handValue
            });
        }
    }
    
    // 딜러 카드 2장 (1장은 히든)
    for (let i = 0; i < 2; i++) {
        const card = room.deck.pop();
        room.dealerCards.push(card);
        
        // 첫 번째 카드는 히든
        const isHidden = i === 0;
        
        // 카드 배분 알림
        io.to(room.id).emit('card_dealt', {
            to: 'dealer',
            card: isHidden ? { hidden: true } : card,
            handValue: isHidden ? '?' : calculateHandValue([room.dealerCards[1]])
        });
    }
}

// 플레이어 턴 시작
function startPlayerTurn(room, io) {
    if (room.currentPlayerIndex >= room.players.length) {
        // 모든 플레이어의 턴이 끝나면 딜러 턴
        startDealerTurn(room, io);
        return;
    }
    
    const currentPlayer = room.players[room.currentPlayerIndex];
    currentPlayer.status = 'playing';
    
    // 블랙잭 체크
    const handValue = calculateHandValue(currentPlayer.cards);
    if (handValue === 21 && currentPlayer.cards.length === 2) {
        // 블랙잭일 경우 자동으로 스탠드
        handleStand(room, io);
        return;
    }
    
    // 더블다운 가능 여부 체크
    const canDouble = currentPlayer.cards.length === 2 && currentPlayer.balance >= currentPlayer.bet;
    
    // 턴 시작 알림
    io.to(room.id).emit('player_turn', {
        username: currentPlayer.username,
        canDouble: canDouble
    });
}

// 플레이어 액션 처리
function handlePlayerAction(action, room, socket, io) {
    const currentPlayer = room.players[room.currentPlayerIndex];
    
    // 액션 알림
    io.to(room.id).emit('player_action', {
        username: currentPlayer.username,
        action: action
    });
    
    // 액션별 처리
    switch (action) {
        case 'hit':
            handleHit(room, io);
            break;
        case 'stand':
            handleStand(room, io);
            break;
        case 'double':
            handleDouble(room, io);
            break;
    }
}

// 히트 처리
function handleHit(room, io) {
    const currentPlayer = room.players[room.currentPlayerIndex];
    
    // 카드 한 장 추가
    const card = room.deck.pop();
    currentPlayer.cards.push(card);
    
    const handValue = calculateHandValue(currentPlayer.cards);
    
    // 카드 배분 알림
    io.to(room.id).emit('card_dealt', {
        to: currentPlayer.username,
        card: card,
        handValue: handValue
    });
    
    // 버스트 체크
    if (handValue > 21) {
        // 다음 플레이어로
        room.currentPlayerIndex++;
        setTimeout(() => startPlayerTurn(room, io), 1000);
    } else {
        // 계속 진행 (더블 불가)
        io.to(room.id).emit('player_turn', {
            username: currentPlayer.username,
            canDouble: false
        });
    }
}

// 스탠드 처리
function handleStand(room, io) {
    // 다음 플레이어로
    room.currentPlayerIndex++;
    setTimeout(() => startPlayerTurn(room, io), 1000);
}

// 더블다운 처리
function handleDouble(room, io) {
    const currentPlayer = room.players[room.currentPlayerIndex];
    
    // 베팅액 2배로
    currentPlayer.bet *= 2;
    
    // 카드 한 장 추가
    const card = room.deck.pop();
    currentPlayer.cards.push(card);
    
    const handValue = calculateHandValue(currentPlayer.cards);
    
    // 카드 배분 알림
    io.to(room.id).emit('card_dealt', {
        to: currentPlayer.username,
        card: card,
        handValue: handValue
    });
    
    // 베팅액 업데이트 알림
    io.to(room.id).emit('player_bet', {
        username: currentPlayer.username,
        amount: currentPlayer.bet
    });
    
    // 다음 플레이어로
    room.currentPlayerIndex++;
    setTimeout(() => startPlayerTurn(room, io), 1000);
}

// 딜러 턴
function startDealerTurn(room, io) {
    // 첫 번째 카드 공개
    io.to(room.id).emit('card_dealt', {
        to: 'dealer',
        card: room.dealerCards[0],
        handValue: calculateHandValue(room.dealerCards)
    });
    
    // 모든 플레이어가 버스트면 딜러는 추가 카드 안 받음
    const allBust = room.players.every(p => calculateHandValue(p.cards) > 21);
    
    if (allBust) {
        // 게임 결과 계산
        setTimeout(() => calculateResults(room, io), 1000);
        return;
    }
    
    // 딜러 규칙에 따라 카드 뽑기
    dealerDrawCards(room, io);
}

// 딜러 카드 뽑기
function dealerDrawCards(room, io) {
    // 딜러는 17 이상일 때까지 히트
    if (shouldDealerDraw(room.dealerCards)) {
        // 카드 한 장 추가
        const card = room.deck.pop();
        room.dealerCards.push(card);
        
        const handValue = calculateHandValue(room.dealerCards);
        
        // 카드 배분 알림
        io.to(room.id).emit('card_dealt', {
            to: 'dealer',
            card: card,
            handValue: handValue
        });
        
        // 계속 뽑기
        setTimeout(() => dealerDrawCards(room, io), 1000);
    } else {
        // 게임 결과 계산
        setTimeout(() => calculateResults(room, io), 1000);
    }
}

// 게임 결과 계산
async function calculateResults(room, io) {
    const dealerValue = calculateHandValue(room.dealerCards);
    const results = [];
    
    // 각 플레이어의 결과 계산
    for (const player of room.players) {
        const handValue = calculateHandValue(player.cards);
        const result = determineResult(player.cards, room.dealerCards);
        
        const winAmount = calculateWinAmount(player.bet, result);
        
        // 결과 객체
        results.push({
            username: player.username,
            bet: player.bet,
            result: result,
            winAmount: result === 'win' || result === 'blackjack' ? winAmount - player.bet : 0
        });
        
        // 데이터베이스 업데이트 (승리 시에만 금액 변경)
        try {
            if (result === 'win' || result === 'blackjack') {
                await User.updateBalance(player.userId, winAmount - player.bet, true);
                player.balance += (winAmount - player.bet);
            } else if (result === 'lose') {
                await User.updateBalance(player.userId, player.bet, false);
                player.balance -= player.bet;
            }
        } catch (error) {
            console.error('게임 결과 처리 오류:', error);
        }
    }
    
    // 결과 알림
    io.to(room.id).emit('game_result', {
        dealerValue: dealerValue,
        results: results
    });
    
    // 방 상태 업데이트
    room.status = 'waiting';
    room.stage = 'waiting';
    
    // 5초 후 다음 게임 시작
    setTimeout(() => {
        startBettingRound(room, io);
    }, 5000);
}

// 방 목록 브로드캐스트
function broadcastRoomsUpdate(io) {
    const rooms = Object.values(blackjackRooms).map(room => ({
        id: room.id,
        name: room.name,
        owner: room.owner,
        players: room.players.map(p => ({ username: p.username })),
        maxPlayers: room.maxPlayers,
        minBet: room.minBet,
        hasPassword: !!room.password,
        status: room.status
    }));
    
    io.emit('rooms_update', rooms);
}

module.exports = { setupBlackjackSocket }; 