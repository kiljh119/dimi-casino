const User = require('../models/User');

// 서버 시간 기준 게임 주기 관리
const BETTING_TIME = 120; // 2분 베팅 시간
const RACE_TIME = 60; // 1분 경주 시간
const TOTAL_CYCLE = BETTING_TIME + RACE_TIME; // 총 주기 (3분)

// 말 정보
const horseNames = ['이승만', '박정희', '전두환', '김대중', '노무현', '이명박', '윤석열', '이재명'];

// 현재 게임 상태 저장
let currentRaceId = null;
let currentHorses = [];
let currentResults = [];
let currentBets = {};
let lastRaceTime = 0; // 마지막 경주 시작 시간

// 호스 레이싱 소켓 핸들러
function setupHorseRacingSocket(io) {
    console.log('경마 게임 소켓 핸들러 설정 완료');
    
    // 서버 시작 시 첫 번째 경마 게임 초기화
    generateNewRace();
    startRaceCycle(io);
    
    // 소켓 연결 처리
    io.on('connection', (socket) => {
        console.log('새로운 클라이언트 연결:', socket.id);
        
        // 사용자 인증 정보 처리
        socket.on('authenticate', (data) => {
            try {
                if (data && data.username) {
                    socket.username = data.username;
                    socket.userId = data.userId;
                    console.log(`사용자 인증 완료: ${socket.username}`);
                }
            } catch (e) {
                console.error('사용자 인증 오류:', e);
            }
        });
        
        // 서버 시간 요청 처리
        socket.on('get_server_time', (data) => {
            socket.emit('server_time', {
                serverTime: Date.now(),
                clientTime: data.clientTime
            });
            
            console.log(`클라이언트에 서버 시간 전송: ${socket.id}`);
        });
        
        // 경마 게임 상태 요청 처리
        socket.on('get_race_state', () => {
            // 현재 게임 상태 계산
            const currentTime = Date.now();
            const millisInCycle = TOTAL_CYCLE * 1000;
            const timeInCycle = currentTime % millisInCycle;
            const isRacing = timeInCycle >= BETTING_TIME * 1000;
            
            // 남은 시간 계산
            const remainingTime = isRacing 
                ? TOTAL_CYCLE - Math.floor(timeInCycle / 1000)
                : BETTING_TIME - Math.floor(timeInCycle / 1000);
            
            // 현재 게임 상태 전송
            socket.emit('race_state', {
                raceId: currentRaceId,
                horses: currentHorses,
                phase: isRacing ? 'racing' : 'betting',
                remainingTime: remainingTime,
                results: isRacing ? currentResults : []
            });
            
            console.log(`클라이언트에 경마 게임 상태 전송: ${socket.id}, 페이즈: ${isRacing ? 'racing' : 'betting'}, 남은 시간: ${remainingTime}초`);
        });
        
        // 경마 베팅 처리
        socket.on('horse_racing_bet', async (data) => {
            if (!socket.username) {
                socket.emit('bet_response', { 
                    success: false, 
                    message: '로그인이 필요합니다.' 
                });
                return;
            }
            
            try {
                // 게임 상태 확인 (베팅 단계인지)
                const currentTime = Date.now();
                const timeInCycle = currentTime % (TOTAL_CYCLE * 1000);
                
                if (timeInCycle >= BETTING_TIME * 1000) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '현재 베팅 시간이 아닙니다.' 
                    });
                    return;
                }
                
                // 사용자 정보 확인
                let user = null;
                
                try {
                    user = await User.findById(socket.userId);
                } catch (e) {
                    console.error('사용자 정보 조회 오류:', e);
                }
                
                if (!user) {
                    // 임시 유저 모드 - 로컬 스토리지에 저장된 잔액으로 처리
                    console.log(`임시 유저 모드로 베팅 처리: ${socket.username}`);
                    
                    socket.emit('bet_response', { 
                        success: true, 
                        message: '베팅이 완료되었습니다.',
                        betId: `bet_${socket.username}_${Date.now()}`,
                        newBalance: data.currentBalance - data.amount
                    });
                    return;
                }
                
                // 베팅 금액 유효성 검사
                const { amount, betType, horseIds } = data;
                
                if (!amount || amount <= 0 || amount > user.balance) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '유효하지 않은 베팅 금액입니다.' 
                    });
                    return;
                }
                
                // 베팅 종류와 말 선택 유효성 검사
                if (!betType || !horseIds || !Array.isArray(horseIds) || horseIds.length === 0) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '유효하지 않은 베팅 정보입니다.' 
                    });
                    return;
                }
                
                // 유효한 말 ID인지 확인
                const validHorseIds = horseIds.every(id => 
                    currentHorses.some(horse => horse.id === id)
                );
                
                if (!validHorseIds) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '유효하지 않은 말 정보입니다.' 
                    });
                    return;
                }
                
                // 베팅 정보 저장
                const betId = `bet_${socket.userId}_${Date.now()}`;
                const betInfo = {
                    id: betId,
                    userId: socket.userId,
                    username: socket.username,
                    betType,
                    horseIds,
                    amount,
                    raceId: currentRaceId,
                    timestamp: Date.now()
                };
                
                // 베팅 저장
                if (!currentBets[socket.userId]) {
                    currentBets[socket.userId] = [];
                }
                currentBets[socket.userId].push(betInfo);
                
                // 사용자 잔액 차감
                const newBalance = user.balance - amount;
                await User.updateBalance(socket.userId, newBalance);
                
                // 성공 응답
                socket.emit('bet_response', {
                    success: true,
                    message: '베팅이 완료되었습니다.',
                    betId,
                    newBalance
                });
                
                // 잔액 업데이트 브로드캐스트
                io.emit('balance_update', {
                    username: socket.username,
                    balance: newBalance
                });
                
                console.log(`경마 베팅 성공: ${socket.username}, 금액: ${amount}, 말: ${horseIds.join(',')}, 타입: ${betType}`);
                
            } catch (error) {
                console.error('경마 베팅 처리 오류:', error);
                socket.emit('bet_response', { 
                    success: false, 
                    message: '서버 오류가 발생했습니다.' 
                });
            }
        });
    });
}

// 새로운 경마 게임 생성
function generateNewRace() {
    // 새 경기 ID 생성
    currentRaceId = `race_${Date.now()}`;
    
    console.log(`새로운 경마 게임 생성: ${currentRaceId}`);
    
    // 말 생성 (배당률 랜덤 부여)
    currentHorses = horseNames.map((name, index) => {
        const odds = (Math.random() * 8.5 + 1.5).toFixed(1);
        return {
            id: index + 1,
            name,
            odds: parseFloat(odds)
        };
    });
    
    // 베팅 초기화
    currentBets = {};
    
    // 결과 초기화
    currentResults = [];
}

// 경마 게임 주기 실행
function startRaceCycle(io) {
    // 현재 시간 기준으로 주기 계산
    const currentTime = Date.now();
    const millisInCycle = TOTAL_CYCLE * 1000;
    const timeInCycle = currentTime % millisInCycle;
    
    console.log(`경마 게임 주기 시작, 현재 주기 내 위치: ${Math.floor(timeInCycle / 1000)}초`);
    
    // 경마 게임 페이즈에 맞는 이벤트 발송
    if (timeInCycle < BETTING_TIME * 1000) {
        // 베팅 단계
        const timeToRace = BETTING_TIME * 1000 - timeInCycle;
        
        // 경주 시작 시간에 맞춰 타이머 설정
        setTimeout(() => {
            runRace(io);
        }, timeToRace);
        
        // 남은 시간 로그
        console.log(`다음 경주까지 ${Math.floor(timeToRace / 1000)}초 남음`);
        
    } else {
        // 경주 단계
        const timeToNextCycle = millisInCycle - timeInCycle;
        
        // 경주 결과 처리 (결과가 없는 경우에만)
        if (currentResults.length === 0) {
            generateRaceResults();
            
            // 결과 전송
            io.emit('race_result', {
                raceId: currentRaceId,
                results: currentResults
            });
            
            // 베팅 결과 정산
            settleBets(io);
        }
        
        // 다음 주기 시작 시간에 맞춰 타이머 설정
        setTimeout(() => {
            generateNewRace();
            
            // 새 게임 정보 브로드캐스트
            io.emit('new_race', {
                raceId: currentRaceId,
                horses: currentHorses
            });
            
            // 다음 경주 시작
            setTimeout(() => {
                runRace(io);
            }, BETTING_TIME * 1000);
            
        }, timeToNextCycle);
        
        // 남은 시간 로그
        console.log(`다음 게임 주기까지 ${Math.floor(timeToNextCycle / 1000)}초 남음`);
    }
    
    // 매 분마다 현재 게임 상태 로그 출력
    const statusInterval = setInterval(() => {
        const now = Date.now();
        const cycle = now % millisInCycle;
        const phase = cycle < BETTING_TIME * 1000 ? 'betting' : 'racing';
        const remaining = phase === 'betting' 
            ? BETTING_TIME * 1000 - cycle 
            : millisInCycle - cycle;
        
        console.log(`현재 게임 상태: ${phase}, 남은 시간: ${Math.floor(remaining / 1000)}초, 접속 인원: ${io.engine.clientsCount}명`);
    }, 60000);
}

// 경주 실행
function runRace(io) {
    console.log(`경마 레이스 시작: ${currentRaceId}`);
    lastRaceTime = Date.now();
    
    // 경주 결과 생성
    generateRaceResults();
    
    // 클라이언트에 경주 시작 알림
    io.emit('race_start', {
        raceId: currentRaceId
    });
    
    // 경주 종료 후 결과 브로드캐스트
    setTimeout(() => {
        io.emit('race_result', {
            raceId: currentRaceId,
            results: currentResults
        });
        
        // 베팅 결과 정산
        settleBets(io);
        
    }, 1000); // 시각적 효과를 위해 1초 후 결과 발송
    
    // 경주 완료 후 다음 게임 준비
    setTimeout(() => {
        generateNewRace();
        
        // 새 게임 정보 브로드캐스트
        io.emit('new_race', {
            raceId: currentRaceId,
            horses: currentHorses
        });
    }, RACE_TIME * 1000);
}

// 경주 결과 생성
function generateRaceResults() {
    // 결과가 이미 있으면 재생성하지 않음
    if (currentResults.length > 0) return;
    
    console.log('경마 경주 결과 생성 중...');
    
    // 각 말의 결승 시간 랜덤 생성
    const horseResults = currentHorses.map(horse => {
        // 배당률이 낮은 말이 이길 확률이 약간 높게 설정
        // 배당률 역수를 기준으로 가중치 부여 (낮은 배당률 = 강한 말)
        const weight = 1 / horse.odds;
        const baseTime = 30 + (Math.random() * 15); // 30~45초 기본 시간
        const adjustedTime = baseTime - (weight * 3); // 가중치에 따른 보정
        
        return {
            ...horse,
            finishTime: Math.max(25, adjustedTime + (Math.random() * 10 - 5)) // 최소 25초, 랜덤 변동 ±5초
        };
    });
    
    // 완주 시간순으로 정렬
    currentResults = horseResults.sort((a, b) => a.finishTime - b.finishTime);
    
    console.log(`경마 결과 생성 완료, 1등: ${currentResults[0].name} (${currentResults[0].finishTime.toFixed(2)}초)`);
}

// 베팅 결과 정산
async function settleBets(io) {
    if (Object.keys(currentBets).length === 0) {
        console.log('정산할 베팅이 없습니다.');
        return;
    }
    
    console.log('경마 베팅 정산 시작');
    
    // 각 사용자별 베팅 확인 및 정산
    for (const userId in currentBets) {
        const userBets = currentBets[userId];
        let totalWinnings = 0;
        const winningBets = [];
        
        // 각 베팅에 대해 결과 확인
        for (const bet of userBets) {
            let isWin = false;
            let winAmount = 0;
            
            // 베팅 유형에 따라 승리 조건 확인
            switch (bet.betType) {
                case 'single': // 단승 (1등 맞히기)
                    isWin = bet.horseIds[0] === currentResults[0].id;
                    break;
                    
                case 'place': // 복승 (1등, 2등 순서 상관없이)
                    isWin = bet.horseIds.some(id => 
                        id === currentResults[0].id || id === currentResults[1].id
                    );
                    break;
                    
                case 'quinella': // 쌍승 (1등, 2등 정확히)
                    if (bet.horseIds.length >= 2) {
                        isWin = bet.horseIds[0] === currentResults[0].id && 
                                bet.horseIds[1] === currentResults[1].id;
                    }
                    break;
                    
                case 'trifecta-place': // 삼복승 (1~3등 순서 상관없이)
                    if (bet.horseIds.length >= 3) {
                        const top3Ids = currentResults.slice(0, 3).map(h => h.id);
                        isWin = bet.horseIds.every(id => top3Ids.includes(id));
                    }
                    break;
                    
                case 'trifecta': // 삼쌍승 (1~3등 정확한 순서)
                    if (bet.horseIds.length >= 3) {
                        isWin = bet.horseIds[0] === currentResults[0].id && 
                                bet.horseIds[1] === currentResults[1].id && 
                                bet.horseIds[2] === currentResults[2].id;
                    }
                    break;
            }
            
            // 승리 시 상금 계산
            if (isWin) {
                // 말들의 배당률 정보 가져오기
                const betHorses = bet.horseIds.map(id => 
                    currentHorses.find(h => h.id === id)
                );
                
                // 베팅 유형에 따른 배당률 계산
                let odds = 0;
                if (bet.betType === 'single' || bet.betType === 'place') {
                    odds = betHorses[0].odds;
                } else if (bet.betType === 'quinella' && betHorses.length >= 2) {
                    odds = (betHorses[0].odds + betHorses[1].odds) * 0.8;
                } else if (bet.betType === 'trifecta-place' && betHorses.length >= 3) {
                    odds = (betHorses[0].odds + betHorses[1].odds + betHorses[2].odds) * 0.6;
                } else if (bet.betType === 'trifecta' && betHorses.length >= 3) {
                    odds = (betHorses[0].odds * betHorses[1].odds * betHorses[2].odds) * 0.3;
                }
                
                winAmount = Math.floor(bet.amount * odds);
                totalWinnings += winAmount;
                
                winningBets.push({
                    ...bet,
                    odds,
                    winAmount
                });
            }
        }
        
        // 상금이 있으면 사용자 잔액 업데이트
        if (totalWinnings > 0) {
            try {
                let user = null;
                let newBalance = 0;
                
                try {
                    // 현재 사용자 정보 조회
                    user = await User.findById(userId);
                } catch (e) {
                    console.error('사용자 정보 조회 오류:', e);
                }
                
                if (user) {
                    // 잔액 업데이트
                    newBalance = user.balance + totalWinnings;
                    await User.updateBalance(userId, newBalance);
                    
                    console.log(`경마 상금 지급: ${userBets[0].username}, 금액: ${totalWinnings}, 새 잔액: ${newBalance}`);
                }
                
                // 클라이언트에 상금 지급 알림
                io.to(userBets[0].username).emit('horse_race_winnings', {
                    winningBets,
                    totalWinnings,
                    newBalance
                });
                
                // 잔액 업데이트 브로드캐스트
                io.emit('balance_update', {
                    username: userBets[0].username,
                    balance: newBalance
                });
            } catch (error) {
                console.error('경마 상금 지급 오류:', error);
            }
        }
    }
    
    // 베팅 내역 초기화
    currentBets = {};
    console.log('경마 베팅 정산 완료');
}

module.exports = {
    setupHorseRacingSocket
}; 