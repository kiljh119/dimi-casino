const User = require('../models/User');

// 서버 시간 기준 게임 주기 관리
const BETTING_TIME = 120; // 2분 베팅 시간
const RACE_TIME = 60; // 1분 경주 시간
const TOTAL_CYCLE = BETTING_TIME + RACE_TIME; // 총 주기 (3분)
const TRACK_WIDTH = 1000; // 가정된 트랙 폭
const PREPARE_TIME = 3; // 경주 시작 전 준비 시간 (초)
const CYCLE_MINUTES = 3; // 3분마다 한 경기 진행

// 말 정보
const horseNames = ['이승만', '박정희', '전두환', '김대중', '노무현', '이명박', '윤석열', '이재명'];

// 베팅 유형별 배당률 보정
const BET_TYPE_MULTIPLIERS = {
    'single': 1.0,       // 단승식 - 기본 배당률
    'place': 0.5,        // 복승식 - 배당률의 1/2 (2위 안에 들면 당첨)
    'quinella': 2.5,     // 쌍승식 - 두 말의 배당률 평균 * 2.5
    'trifecta-place': 4, // 삼복승식 - 세 말의 배당률 평균 * 4
    'trifecta': 8        // 삼쌍승식 - 세 말의 배당률 평균 * 8
};

/**
 * 베팅 유형과 선택한 말에 따른 잠재적 당첨금 계산
 * @param {string} betType 베팅 유형
 * @param {Array} selectedHorses 선택한 말 목록 (배당률 포함)
 * @param {number} amount 베팅 금액
 * @returns {number} 잠재적 당첨금
 */
function calculatePotentialWin(betType, selectedHorses, amount) {
    if (!selectedHorses || selectedHorses.length === 0) {
        return 0;
    }
    
    // 베팅 유형에 따른 승수 가져오기
    const multiplier = BET_TYPE_MULTIPLIERS[betType] || 1.0;
    
    // 선택한 말들의 평균 배당률 계산
    const avgOdds = selectedHorses.reduce((sum, horse) => sum + horse.odds, 0) / selectedHorses.length;
    
    // 당첨금 계산 (소수점 아래 버림)
    const potentialWin = Math.floor(amount * avgOdds * multiplier);
    
    return potentialWin;
}

// 현재 게임 상태 저장
let currentRaceId = null;
let currentHorses = [];
let currentResults = [];
let currentBets = {};
let lastRaceTime = 0; // 마지막 경주 시작 시간
let currentPhase = 'betting'; // 현재 게임 단계 ('betting', 'preparing', 또는 'racing')
let currentEndTime = 0; // 현재 단계의 종료 시간
let horsesPositions = {}; // 말들의 현재 위치 정보 저장
let horsesFinishTimes = {}; // 말들의 완주 시간 저장
let horsesFrameData = {}; // 각 말의 프레임별 위치 데이터
let cycleStartTime = 0; // 현재 주기의 시작 시간
let raceStartTime = 0; // 현재 레이스의 시작 시간
let raceEndTime = 0; // 현재 레이스의 종료 시간
let preparingStartTime = 0; // 준비 단계 시작 시간
let phaseTimers = []; // 단계 전환 타이머 저장
let racingElapsedTime = 0; // 레이싱 단계 경과 시간
let gameState = {}; // 최근 게임 상태 저장 (새로고침 후 복원용)

// globalIo 변수 추가
let globalIo = null;

// 호스 레이싱 소켓 핸들러
function setupHorseRacingSocket(io) {
    console.log('경마 게임 소켓 핸들러 설정 완료');
    
    // 전역 IO 객체 설정 (위치 업데이트에서 사용)
    globalIo = io;
    
    // 타이머 초기화 함수
    function clearAllTimers() {
        phaseTimers.forEach(timer => clearTimeout(timer));
        phaseTimers = [];
        
        // 위치 업데이트 타이머도 정리
        if (positionUpdateTimer) {
            clearInterval(positionUpdateTimer);
            positionUpdateTimer = null;
        }
    }
    
    // 서버 시작 시 첫 번째 경마 게임 초기화
    generateNewRace();
    
    // 현재 시간으로 주기 시작 시간 설정 (3분 주기에 맞춰 정각, 3분, 6분, 9분 단위로 시작)
    cycleStartTime = calculateCycleStartTime();
    console.log(`경마 게임 주기 시작 시간 설정: ${new Date(cycleStartTime).toLocaleTimeString()}`);
    startRaceCycle(io);
    
    // 말 위치 정보 초기화
    horsesPositions = {};
    currentHorses.forEach(horse => {
        horsesPositions[horse.id] = 0;
    });
    
    // 연결된 사용자 정보를 저장하는 Map 객체
    const connectedUsers = new Map();
    
    // 소켓 연결 처리
    io.on('connection', (socket) => {
        console.log('새로운 클라이언트 연결:', socket.id);
        
        // 사용자 인증 정보 처리
        socket.on('authenticate', async (data) => {
            try {
                // 기본 입력 검증
                if (!data || typeof data !== 'object') {
                    console.error('인증 오류: 유효하지 않은 입력 데이터');
                    socket.emit('auth_response', {
                        success: false,
                        message: '유효하지 않은 인증 데이터입니다.'
                    });
                    return;
                }
                
                const { userId, username, token } = data;
                
                // 기본 필드 검증
                if (!username) {
                    console.error('인증 오류: 사용자 이름 누락');
                    socket.emit('auth_response', {
                        success: false,
                        message: '사용자 이름이 필요합니다.'
                    });
                    return;
                }
                
                // userId가 있으면 데이터베이스에서 사용자 확인
                if (userId) {
                    try {
                        const user = await User.findById(userId);
                        
                        if (user) {
                            // 사용자 이름 일치 여부 확인
                            if (user.username !== username) {
                                console.warn(`사용자 ID/이름 불일치: DB=${user.username}, 요청=${username}`);
                                // 불일치하는 경우에도 DB의 이름으로 덮어쓰고 계속 진행
                                username = user.username;
                            }
                            
                            // 소켓에 사용자 정보 설정 및 맵에 저장
                            socket.userId = userId;
                            socket.username = username;
                            socket.userBalance = user.balance || 0;
                            socket.isAdmin = user.is_admin === true || user.is_admin === 1;
                            
                            // 연결된 사용자 맵에 추가
                            connectedUsers.set(socket.id, {
                                id: userId,
                                username: username,
                                balance: user.balance || 0,
                                isAdmin: socket.isAdmin,
                                lastUpdated: Date.now()
                            });
                            
                            console.log(`사용자 인증 성공: ${username} (ID: ${userId}), 잔액: ${user.balance}, 관리자: ${socket.isAdmin ? 'Y' : 'N'}`);
                            
                            // 성공 응답
                            socket.emit('auth_response', {
                                success: true,
                                message: '인증 성공',
                                user: {
                                    id: userId,
                                    username: username,
                                    balance: user.balance,
                                    isAdmin: socket.isAdmin
                                }
                            });
                            
                            // 기존 베팅 정보가 있다면 전송
                            if (currentBets[userId] && currentBets[userId].length > 0) {
                                socket.emit('current_bets', {
                                    bets: currentBets[userId]
                                });
                                console.log(`${username}에게 ${currentBets[userId].length}개의 기존 베팅 정보 전송됨`);
                            }
                            
                            return;
                        } else {
                            console.warn(`사용자 ID ${userId}가 데이터베이스에 존재하지 않음`);
                        }
                    } catch (dbError) {
                        console.error('사용자 정보 조회 오류:', dbError);
                    }
                }
                
                // 게스트 모드 (userId가 없거나 DB에서 찾을 수 없는 경우)
                // 게스트는 베팅을 할 수 없고 관전만 가능하지만 소켓 연결은 유지
                socket.username = username;
                socket.isGuest = true;
                socket.userBalance = 0;
                socket.isAdmin = false;
                
                // 연결된 사용자 맵에 게스트로 추가
                connectedUsers.set(socket.id, {
                    id: null,
                    username: username,
                    balance: 0,
                    isGuest: true,
                    lastUpdated: Date.now()
                });
                
                console.log(`게스트 사용자 연결됨: ${username}`);
                
                // 게스트 응답
                socket.emit('auth_response', {
                    success: true,
                    message: '게스트 모드로 연결되었습니다.',
                    isGuest: true,
                    user: {
                        username: username,
                        balance: 0,
                        isGuest: true
                    }
                });
                
            } catch (e) {
                console.error('사용자 인증 처리 오류:', e);
                socket.emit('auth_response', {
                    success: false,
                    message: '인증 처리 중 오류가 발생했습니다.'
                });
            }
        });
        
        // 사용자 정보 갱신 요청 처리
        socket.on('refresh_user_info', async () => {
            if (!socket.userId) {
                socket.emit('user_info_update', {
                    success: false,
                    message: '로그인이 필요합니다.'
                });
                return;
            }
            
            try {
                const user = await User.findById(socket.userId);
                
                if (user) {
                    // 소켓 정보 업데이트
                    socket.userBalance = user.balance || 0;
                    
                    // 연결된 사용자 맵 업데이트
                    if (connectedUsers.has(socket.id)) {
                        const userData = connectedUsers.get(socket.id);
                        userData.balance = user.balance;
                        userData.lastUpdated = Date.now();
                        connectedUsers.set(socket.id, userData);
                    }
                    
                    // 정보 전송
                    socket.emit('user_info_update', {
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            balance: user.balance,
                            isAdmin: user.is_admin === true || user.is_admin === 1
                        }
                    });
                    
                    console.log(`사용자 ${user.username}의 정보가 갱신됨, 잔액: ${user.balance}`);
                } else {
                    socket.emit('user_info_update', {
                        success: false,
                        message: '사용자 정보를 찾을 수 없습니다.'
                    });
                }
            } catch (error) {
                console.error('사용자 정보 갱신 오류:', error);
                socket.emit('user_info_update', {
                    success: false,
                    message: '서버 오류가 발생했습니다.'
                });
            }
        });
        
        // 서버 시간 요청 처리
        socket.on('get_server_time', (data) => {
            socket.emit('server_time', {
                serverTime: Date.now(),
                clientTime: data.clientTime,
                cycleStartTime: cycleStartTime,
                currentPhase: currentPhase,
                bettingTime: BETTING_TIME,
                raceTime: RACE_TIME,
                prepareTime: PREPARE_TIME,
                totalCycle: TOTAL_CYCLE
            });
            
            console.log(`클라이언트에 서버 시간 전송: ${socket.id}`);
        });
        
        // 경마 게임 상태 요청 처리
        socket.on('get_race_state', () => {
            // 현재 게임 상태 계산
            const currentTime = Date.now();
            
            // 현재 시간이 주기 내 어디에 위치하는지 계산
            let phase = '';
            let remainingTime = 0;
            let racingElapsed = 0;
            
            // cycleStartTime이 유효한지 확인
            if (!cycleStartTime || cycleStartTime <= 0) {
                console.error('주기 시작 시간이 유효하지 않습니다:', cycleStartTime);
                cycleStartTime = calculateCycleStartTime();
                console.log('새로운 주기 시작 시간으로 재설정:', new Date(cycleStartTime).toLocaleTimeString());
            }
            
            // 주기 내에서 현재 위치 계산 (현재 시간 - 주기 시작 시간)
            const elapsedInCycle = currentTime - cycleStartTime;
            
            // 절대 시간 기준으로 단계 결정
            if (elapsedInCycle < (BETTING_TIME - PREPARE_TIME) * 1000) {
                // 베팅 단계
                phase = 'betting';
                // 베팅 종료까지 남은 시간 (초)
                remainingTime = Math.max(0, Math.floor(((cycleStartTime + BETTING_TIME * 1000) - currentTime) / 1000));
                racingElapsedTime = 0;
            } else if (elapsedInCycle < BETTING_TIME * 1000) {
                // 준비 단계
                phase = 'preparing';
                // 레이싱 시작까지 남은 시간 (초)
                remainingTime = Math.max(0, Math.floor(((cycleStartTime + BETTING_TIME * 1000) - currentTime) / 1000));
                racingElapsedTime = 0;
            } else if (elapsedInCycle < (BETTING_TIME + RACE_TIME) * 1000) {
                // 레이싱 단계
                phase = 'racing';
                // 레이싱 시작 후 경과 시간 (밀리초)
                racingElapsed = Math.floor(elapsedInCycle - (BETTING_TIME * 1000));
                racingElapsedTime = racingElapsed;
                // 레이싱 종료까지 남은 시간 (초)
                remainingTime = Math.max(0, Math.floor((RACE_TIME * 1000 - racingElapsed) / 1000));
            } else {
                // 다음 주기 대기 중
                phase = 'betting';
                // 다음 주기까지의 남은 시간 (초) - 이 값은 매우 작아야 함
                remainingTime = Math.max(0, Math.floor(((cycleStartTime + TOTAL_CYCLE * 1000) - currentTime) / 1000));
                racingElapsedTime = 0;
            }
            
            // 디버그 로깅 (문제 추적용)
            console.log(`게임 상태 계산: 현재 시간=${new Date(currentTime).toLocaleTimeString()}, 주기 시작=${new Date(cycleStartTime).toLocaleTimeString()}, 경과=${Math.floor(elapsedInCycle/1000)}초, 단계=${phase}, 남은 시간=${remainingTime}초`);
            
            // 현재 게임 단계 업데이트
            currentPhase = phase;
            
            // 위치 정보가 있는 말 데이터 생성
            const horsesWithPositions = currentHorses.map(horse => {
                return {
                    ...horse,
                    position: horsesPositions[horse.id] || 0,
                    finishTime: horsesFinishTimes[horse.id] || null
                };
            });
            
            // 레이싱 시작/종료 시간 계산 (절대 시간)
            const calculatedRaceStartTime = cycleStartTime + BETTING_TIME * 1000;
            const calculatedRaceEndTime = calculatedRaceStartTime + RACE_TIME * 1000;
            
            // 현재 레이싱 시작/종료 시간 업데이트 (이전에 설정되지 않았거나 불일치하는 경우)
            if (phase === 'racing') {
                if (!raceStartTime || Math.abs(raceStartTime - calculatedRaceStartTime) > 1000) {
                    console.log(`레이싱 시작 시간 보정: ${raceStartTime ? new Date(raceStartTime).toLocaleTimeString() : 'undefined'} -> ${new Date(calculatedRaceStartTime).toLocaleTimeString()}`);
                    raceStartTime = calculatedRaceStartTime;
                }
                
                if (!raceEndTime || Math.abs(raceEndTime - calculatedRaceEndTime) > 1000) {
                    console.log(`레이싱 종료 시간 보정: ${raceEndTime ? new Date(raceEndTime).toLocaleTimeString() : 'undefined'} -> ${new Date(calculatedRaceEndTime).toLocaleTimeString()}`);
                    raceEndTime = calculatedRaceEndTime;
                }
            }
            
            // 응답 데이터
            const responseData = {
                raceId: currentRaceId,
                horses: horsesWithPositions, // 위치 정보가 포함된 말 데이터 전송
                phase: currentPhase,
                remainingTime: remainingTime,
                racingElapsedTime: racingElapsedTime, // 레이싱 경과 시간 추가
                results: phase === 'racing' ? currentResults : [],
                cycleStartTime: cycleStartTime,
                raceStartTime: phase === 'racing' ? raceStartTime : calculatedRaceStartTime, // 레이스 시작 시간
                raceEndTime: phase === 'racing' ? raceEndTime : calculatedRaceEndTime, // 레이스 종료 시간
                horsesPositions: horsesPositions, // 위치 정보도 따로 전송
                bettingTime: BETTING_TIME,
                prepareTime: PREPARE_TIME,
                raceTime: RACE_TIME,
                totalCycle: TOTAL_CYCLE,
                trackWidth: TRACK_WIDTH
            };
            
            // 준비 단계나 레이싱 단계면 프레임 데이터도 전송
            if (phase === 'preparing' || phase === 'racing') {
                responseData.horsesFrameData = horsesFrameData;
            }
            
            // 새로고침 이후에도 게임 상태를 복원할 수 있도록 gameState 저장
            gameState = {
                ...responseData,
                lastUpdated: currentTime
            };
            
            // 현재 게임 상태 전송
            socket.emit('race_state', responseData);
            
            console.log(`클라이언트에 경마 게임 상태 전송: ${socket.id}, 페이즈: ${currentPhase}, 남은 시간: ${remainingTime}초`);
        });
        
        // 말 위치 업데이트 처리 (클라이언트에서는 더 이상 사용하지 않음, 서버가 모든 위치 정보 관리)
        socket.on('update_horse_position', (data) => {
            // 필요시 서버에서 말 위치 기록용으로만 유지
            try {
                if (data && data.horseId && data.position !== undefined) {
                    // 말 위치 정보 업데이트
                    horsesPositions[data.horseId] = data.position;
                    
                    // 필요에 따라 완주 시간 기록
                    if (currentPhase === 'racing' && data.finishTime !== undefined) {
                        horsesFinishTimes[data.horseId] = data.finishTime;
                    }
                }
            } catch (e) {
                console.error('말 위치 업데이트 오류:', e);
            }
        });
        
        // 경마 베팅 처리
        socket.on('horse_racing_bet', async (data) => {
            // 로그인 상태 확인 (게스트 여부)
            if (!socket.userId || socket.isGuest) {
                socket.emit('bet_response', { 
                    success: false, 
                    message: '베팅하려면 로그인이 필요합니다.' 
                });
                return;
            }
            
            try {
                // 게임 상태 확인 (베팅 단계인지)
                const currentTime = Date.now();
                
                if (currentPhase !== 'betting') {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '현재 베팅 시간이 아닙니다.' 
                    });
                    return;
                }
                
                // 사용자 정보 확인 (DB에서 실시간 조회)
                let user = null;
                
                try {
                    user = await User.findById(socket.userId);
                } catch (e) {
                    console.error('사용자 정보 조회 오류:', e);
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.' 
                    });
                    return;
                }
                
                if (!user) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '사용자를 찾을 수 없습니다. 다시 로그인해주세요.' 
                    });
                    return;
                }
                
                // 베팅 금액 유효성 검사
                const { amount, betType, horseIds } = data;
                
                if (!amount || amount <= 0) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '베팅 금액은 0보다 커야 합니다.' 
                    });
                    return;
                }
                
                // 최소 베팅 금액 체크 (100원)
                if (amount < 100) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '최소 베팅 금액은 100원입니다.' 
                    });
                    return;
                }
                
                // 최대 베팅 금액 체크 (100만원)
                if (amount > 1000000) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '최대 베팅 금액은 1,000,000원입니다.' 
                    });
                    return;
                }
                
                // 보유 금액 체크
                if (amount > user.balance) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '보유 금액이 부족합니다.' 
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
                
                // 베팅 타입에 따른 말 선택 수 확인
                const isValidHorseCount = (() => {
                    switch (betType) {
                        case 'single': return horseIds.length === 1;  // 단승식 - 1마리
                        case 'place': return horseIds.length === 1;   // 복승식 - 1마리(2위 안)
                        case 'quinella': return horseIds.length === 2; // 쌍승식 - 2마리(순서 무관)
                        case 'trifecta-place': return horseIds.length === 3; // 삼복승식 - 3마리(순서 무관)
                        case 'trifecta': return horseIds.length === 3; // 삼쌍승식 - 3마리(순서 중요)
                        default: return false;
                    }
                })();
                
                if (!isValidHorseCount) {
                    socket.emit('bet_response', { 
                        success: false, 
                        message: '선택한 말의 수가 베팅 유형에 맞지 않습니다.' 
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
                        message: '유효하지 않은 말을 선택했습니다.' 
                    });
                    return;
                }
                
                // 중복 베팅 확인 (동일한 베팅 유형과 말에 대해 이미 베팅했는지)
                if (currentBets[socket.userId]) {
                    const existingBet = currentBets[socket.userId].find(bet => 
                        bet.betType === betType && 
                        JSON.stringify(bet.horseIds.sort()) === JSON.stringify(horseIds.sort())
                    );
                    
                    if (existingBet) {
                        socket.emit('bet_response', { 
                            success: false, 
                            message: '이미 동일한 유형으로 해당 말에 베팅했습니다.' 
                        });
                        return;
                    }
                }
                
                // 선택한 말의 배당률 정보 수집
                const selectedHorses = horseIds.map(id => {
                    const horse = currentHorses.find(h => h.id === id);
                    return {
                        id: horse.id,
                        name: horse.name,
                        odds: horse.odds
                    };
                });
                
                // 베팅 ID 생성 (고유 ID 보장)
                const betId = `bet_${socket.userId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                
                // 베팅 정보 생성
                const betInfo = {
                    id: betId,
                    userId: socket.userId,
                    username: socket.username,
                    betType,
                    horseIds,
                    horses: selectedHorses,
                    amount,
                    potential_win: calculatePotentialWin(betType, selectedHorses, amount),
                    raceId: currentRaceId,
                    timestamp: Date.now(),
                    status: 'active' // 베팅 상태 (active, win, lose)
                };
                
                // 베팅 저장
                if (!currentBets[socket.userId]) {
                    currentBets[socket.userId] = [];
                }
                currentBets[socket.userId].push(betInfo);
                
                // 사용자 잔액 차감
                const newBalance = user.balance - amount;
                await User.updateBalance(socket.userId, -amount, false, true);
                
                // 실시간 socket 사용자 정보 업데이트
                socket.userBalance = newBalance;
                
                // 연결된 사용자 맵 업데이트
                if (connectedUsers.has(socket.id)) {
                    const userData = connectedUsers.get(socket.id);
                    userData.balance = newBalance;
                    userData.lastUpdated = Date.now();
                    connectedUsers.set(socket.id, userData);
                }
                
                // 베팅 내역 저장 (추후 DB 저장 로직 추가)
                // TODO: 베팅 내역을 데이터베이스에 저장하는 로직 추가
                
                // 성공 응답
                socket.emit('bet_response', {
                    success: true,
                    message: '베팅이 완료되었습니다.',
                    betId,
                    bet: betInfo,
                    newBalance
                });
                
                // 잔액 업데이트 이벤트 발생 (해당 사용자에게만)
                socket.emit('user_balance_update', {
                    balance: newBalance,
                    username: socket.username
                });
                
                console.log(`경마 베팅 성공: ${socket.username}, 금액: ${amount}, 말: ${horseIds.join(',')}, 타입: ${betType}, 새 잔액: ${newBalance}`);
                
            } catch (error) {
                console.error('경마 베팅 처리 오류:', error);
                socket.emit('bet_response', { 
                    success: false, 
                    message: '베팅 처리 중 오류가 발생했습니다. 다시 시도해주세요.' 
                });
            }
        });
        
        // 베팅 취소 처리 (베팅 단계에서만 가능)
        socket.on('cancel_bet', async (data) => {
            // 로그인 여부 확인
            if (!socket.userId || socket.isGuest) {
                socket.emit('cancel_bet_response', { 
                    success: false, 
                    message: '로그인이 필요합니다.' 
                });
                return;
            }
            
            // 베팅 단계인지 확인
            if (currentPhase !== 'betting') {
                socket.emit('cancel_bet_response', { 
                    success: false, 
                    message: '베팅 단계에서만 취소가 가능합니다.' 
                });
                return;
            }
            
            try {
                const { betId } = data;
                
                if (!betId) {
                    socket.emit('cancel_bet_response', { 
                        success: false, 
                        message: '취소할 베팅 ID를 지정해주세요.' 
                    });
                    return;
                }
                
                // 베팅 정보 확인
                if (!currentBets[socket.userId]) {
                    socket.emit('cancel_bet_response', { 
                        success: false, 
                        message: '해당 베팅을 찾을 수 없습니다.' 
                    });
                    return;
                }
                
                // 해당 베팅 찾기
                const betIndex = currentBets[socket.userId].findIndex(bet => bet.id === betId);
                
                if (betIndex === -1) {
                    socket.emit('cancel_bet_response', { 
                        success: false, 
                        message: '해당 베팅을 찾을 수 없습니다.' 
                    });
                    return;
                }
                
                const bet = currentBets[socket.userId][betIndex];
                
                // 베팅 금액 환불
                const refundAmount = bet.amount;
                await User.updateBalance(socket.userId, refundAmount, false, true);
                
                // 사용자 정보 조회
                const user = await User.findById(socket.userId);
                const newBalance = user ? user.balance : 0;
                
                // 실시간 socket 사용자 정보 업데이트
                socket.userBalance = newBalance;
                
                // 연결된 사용자 맵 업데이트
                if (connectedUsers.has(socket.id)) {
                    const userData = connectedUsers.get(socket.id);
                    userData.balance = newBalance;
                    userData.lastUpdated = Date.now();
                    connectedUsers.set(socket.id, userData);
                }
                
                // 베팅 목록에서 제거
                currentBets[socket.userId].splice(betIndex, 1);
                
                // 성공 응답
                socket.emit('cancel_bet_response', {
                    success: true,
                    message: '베팅이 취소되었습니다.',
                    betId,
                    refundAmount,
                    newBalance
                });
                
                // 잔액 업데이트 이벤트 발생 (해당 사용자에게만)
                socket.emit('user_balance_update', {
                    balance: newBalance,
                    username: socket.username
                });
                
                console.log(`베팅 취소 완료: ${socket.username}, 베팅 ID: ${betId}, 환불 금액: ${refundAmount}`);
                
            } catch (error) {
                console.error('베팅 취소 처리 오류:', error);
                socket.emit('cancel_bet_response', { 
                    success: false, 
                    message: '베팅 취소 중 오류가 발생했습니다.' 
                });
            }
        });
        
        // 말 완주 정보 처리
        socket.on('horse_finish', async (data) => {
            try {
                // 현재 레이싱 단계가 아니면 무시
                if (currentPhase !== 'racing') {
                    console.log('레이싱 단계가 아닌데 말 완주 정보 수신:', data);
                    return;
                }
                
                const { horseId, finishTime, rank } = data;
                
                // 기본 데이터 검증
                if (!horseId || !finishTime) {
                    console.error('말 완주 정보 오류: 필수 필드 누락', data);
                    return;
                }
                
                console.log(`말 완주 정보 수신: ID ${horseId}, 시간 ${finishTime.toFixed(2)}초, 순위 ${rank || '없음'}`);
                
                // 해당 말이 존재하는지 확인
                const horse = currentHorses.find(h => h.id === horseId);
                if (!horse) {
                    console.error(`완주 처리 실패: ID ${horseId} 말을 찾을 수 없음`);
                    return;
                }
                
                // 이미 완주 처리되었는지 확인
                if (horsesFinishTimes[horseId] !== null && horsesFinishTimes[horseId] !== undefined) {
                    console.log(`말 ID ${horseId} 이미 완주 처리됨, 기존 시간: ${horsesFinishTimes[horseId].toFixed(2)}초, 새 시간: ${finishTime.toFixed(2)}초`);
                    return;
                }
                
                // 완주 시간 기록
                horsesFinishTimes[horseId] = finishTime;
                
                // 위치를 트랙 끝으로 설정
                horsesPositions[horseId] = TRACK_WIDTH;
                
                // 다른 클라이언트들에게 업데이트 전송
                io.emit('race_positions_update', {
                    horsesPositions: { [horseId]: TRACK_WIDTH },
                    horsesFinishTimes: { [horseId]: finishTime },
                    racingElapsedTime: Date.now() - raceStartTime
                });
                
                // 모든 말이 완주했는지 확인
                const allFinished = currentHorses.every(h => 
                    horsesFinishTimes[h.id] !== null && horsesFinishTimes[h.id] !== undefined
                );
                
                if (allFinished) {
                    console.log('모든 말이 완주, 레이스 종료 처리 시작');
                    
                    // 완주 시간 기준으로 순위 결과 생성
                    currentResults = currentHorses
                        .map(horse => ({
                            ...horse,
                            finishTime: horsesFinishTimes[horse.id]
                        }))
                        .sort((a, b) => a.finishTime - b.finishTime)
                        .map((horse, idx) => ({
                            ...horse,
                            rank: idx + 1
                        }));
                    
                    console.log('최종 순위 결정:', currentResults.map(h => `${h.name}: ${h.finishTime.toFixed(2)}초 (${h.rank}위)`).join(', '));
                    
                    // 레이스 결과 전송
                    io.emit('race_result', {
                        results: currentResults,
                        totalRaceTime: (Date.now() - raceStartTime) / 1000
                    });
                    
                    // 베팅 정산 처리
                    setTimeout(async () => {
                        try {
                            await settleBets(io);
                        } catch (error) {
                            console.error('베팅 정산 처리 중 오류:', error);
                        }
                    }, 1000);
                }
                
            } catch (error) {
                console.error('말 완주 정보 처리 중 오류:', error);
            }
        });
        
        // 소켓 연결 종료 처리
        socket.on('disconnect', () => {
            console.log(`클라이언트 연결 종료: ${socket.id}, 사용자: ${socket.username || '익명'}`);
            
            // 연결된 사용자 맵에서 제거
            if (connectedUsers.has(socket.id)) {
                connectedUsers.delete(socket.id);
            }
        });
    });
}

// 경마 게임 주기 실행
function startRaceCycle(io) {
    // 현재 시간 기준으로 주기 계산
    const currentTime = Date.now();
    
    // 타이머 초기화
    phaseTimers.forEach(timer => clearTimeout(timer));
    phaseTimers = [];
    
    // 이미 계산된 주기 시작 시간 사용 (calculateCycleStartTime에서 설정됨)
    // cycleStartTime은 이미 설정되어 있음
    
    // 주기 시작 시간과 현재 시간의 차이 계산
    const timeDiff = cycleStartTime - currentTime;
    
    // 현재 페이즈를 베팅 단계로 시작
    currentPhase = 'betting';
    console.log(`새로운 경마 게임 주기 시작, 주기 시작 시간: ${new Date(cycleStartTime).toLocaleTimeString()}, 현재 시간: ${new Date(currentTime).toLocaleTimeString()}, 단계: ${currentPhase}`);
    
    // 베팅 단계 종료 시간 설정
    const bettingEndTime = cycleStartTime + BETTING_TIME * 1000;
    
    // 게임 상태 초기화 및 저장
    gameState = {
        raceId: currentRaceId,
        horses: currentHorses.map(horse => ({
            ...horse,
            position: horsesPositions[horse.id] || 0
        })),
        phase: currentPhase,
        cycleStartTime: cycleStartTime,
        bettingTime: BETTING_TIME,
        prepareTime: PREPARE_TIME,
        raceTime: RACE_TIME,
        totalCycle: TOTAL_CYCLE,
        lastUpdated: currentTime
    };
    
    // 준비 단계 시작 타이머 설정 (베팅 시간 - 준비 시간)
    const timeToPreparingPhase = (cycleStartTime + (BETTING_TIME - PREPARE_TIME) * 1000) - currentTime;
    const preparingTimer = setTimeout(() => {
        currentPhase = 'preparing';
        preparingStartTime = Date.now();
        
        // 경주 시작 시간과 종료 시간 미리 계산 (절대 시간으로)
        raceStartTime = cycleStartTime + BETTING_TIME * 1000;
        raceEndTime = raceStartTime + RACE_TIME * 1000;
        
        // 레이스 시뮬레이션 데이터 미리 계산
        preCalculateRaceData();
        
        // 게임 상태 업데이트
        gameState = {
            raceId: currentRaceId,
            horses: currentHorses.map(horse => ({
                ...horse,
                position: horsesPositions[horse.id] || 0
            })),
            phase: currentPhase,
            cycleStartTime: cycleStartTime,
            preparingStartTime: preparingStartTime,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData,
            trackWidth: TRACK_WIDTH,
            bettingTime: BETTING_TIME,
            prepareTime: PREPARE_TIME,
            raceTime: RACE_TIME,
            totalCycle: TOTAL_CYCLE,
            lastUpdated: Date.now()
        };
        
        // 준비 단계 시작 알림 브로드캐스트
        io.emit('race_preparing', {
            raceId: currentRaceId,
            preparingStartTime: preparingStartTime,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData,
            trackWidth: TRACK_WIDTH
        });
        
        console.log(`준비 단계 시작, 현재 시간: ${new Date().toLocaleTimeString()}, 경주 시작 시간: ${new Date(raceStartTime).toLocaleTimeString()}`);
    }, Math.max(0, timeToPreparingPhase));
    
    phaseTimers.push(preparingTimer);
    
    // 레이싱 단계 타이머 설정 (베팅 시간 후)
    const timeToRacingPhase = (cycleStartTime + BETTING_TIME * 1000) - currentTime;
    const racingTimer = setTimeout(() => {
        currentPhase = 'racing';
        
        // 게임 상태 업데이트
        gameState = {
            raceId: currentRaceId,
            horses: currentHorses.map(horse => ({
                ...horse,
                position: horsesPositions[horse.id] || 0,
                finishTime: horsesFinishTimes[horse.id] || null
            })),
            phase: currentPhase,
            cycleStartTime: cycleStartTime,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData,
            horsesPositions: horsesPositions,
            trackWidth: TRACK_WIDTH,
            bettingTime: BETTING_TIME,
            prepareTime: PREPARE_TIME,
            raceTime: RACE_TIME,
            totalCycle: TOTAL_CYCLE,
            lastUpdated: Date.now()
        };
        
        // 클라이언트에 레이스 시작 알림
        io.emit('race_start', {
            raceId: currentRaceId,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData
        });
        
        console.log(`레이싱 단계 시작, 현재 시간: ${new Date().toLocaleTimeString()}`);
    }, Math.max(0, timeToRacingPhase));
    
    phaseTimers.push(racingTimer);
    
    // 레이스 결과 타이머 설정 (베팅 시간 + 레이스 시간 후)
    const timeToResultPhase = (cycleStartTime + (BETTING_TIME + RACE_TIME) * 1000) - currentTime;
    const resultTimer = setTimeout(() => {
        // 결과 생성
        generateRaceResults();
        
        // 게임 상태 업데이트
        gameState = {
            raceId: currentRaceId,
            horses: currentHorses.map(horse => ({
                ...horse,
                position: TRACK_WIDTH,
                finishTime: horsesFinishTimes[horse.id] || null
            })),
            phase: 'finished',
            results: currentResults,
            cycleStartTime: cycleStartTime,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData,
            horsesPositions: horsesPositions,
            horsesFinishTimes: horsesFinishTimes,
            trackWidth: TRACK_WIDTH,
            bettingTime: BETTING_TIME,
            prepareTime: PREPARE_TIME,
            raceTime: RACE_TIME,
            totalCycle: TOTAL_CYCLE,
            lastUpdated: Date.now()
        };
        
        // 레이스 결과 브로드캐스트
        io.emit('race_result', {
            raceId: currentRaceId,
            results: currentResults,
            horsesPositions: horsesPositions,
            horsesFinishTimes: horsesFinishTimes
        });
        
        // 베팅 결과 정산
        settleBets(io);
        
        console.log(`레이스 결과 브로드캐스트, 현재 시간: ${new Date().toLocaleTimeString()}`);
    }, Math.max(0, timeToResultPhase));
    
    phaseTimers.push(resultTimer);
    
    // 다음 주기 타이머 설정 (전체 주기 시간 후)
    const timeToNextCycle = (cycleStartTime + TOTAL_CYCLE * 1000) - currentTime;
    const nextCycleTimer = setTimeout(() => {
        // 새 게임 시작
        currentPhase = 'betting';
        generateNewRace();
        
        // 다음 주기의 시작 시간 계산 (다음 3분 단위)
        cycleStartTime = cycleStartTime + TOTAL_CYCLE * 1000;
        
        // 새 게임 정보 브로드캐스트
        io.emit('new_race', {
            raceId: currentRaceId,
            horses: currentHorses.map(horse => ({
                ...horse,
                position: horsesPositions[horse.id] || 0
            })),
            cycleStartTime: cycleStartTime
        });
        
        console.log(`새 주기 시작, 다음 주기 시작 시간: ${new Date(cycleStartTime).toLocaleTimeString()}`);
        
        // 다음 주기 재시작
        startRaceCycle(io);
        
    }, Math.max(0, timeToNextCycle));
    
    phaseTimers.push(nextCycleTimer);
    
    // 남은 시간 로그
    console.log(`다음 단계까지: ${Math.floor(timeToPreparingPhase / 1000)}초, 다음 주기까지: ${Math.floor(timeToNextCycle / 1000)}초`);
    
    // 매 분마다 현재 게임 상태 로그 출력
    const statusInterval = setInterval(() => {
        const now = Date.now();
        
        // 현재 단계 결정
        let phase = currentPhase;
        
        // 현재 단계에 따라 남은 시간 계산
        let remaining;
        if (phase === 'racing') {
            remaining = (cycleStartTime + TOTAL_CYCLE * 1000) - now;
        } else if (phase === 'preparing') {
            remaining = (cycleStartTime + BETTING_TIME * 1000) - now;
        } else {
            remaining = (cycleStartTime + BETTING_TIME * 1000) - now;
        }
        
        console.log(`현재 게임 상태: ${phase}, 남은 시간: ${Math.floor(remaining / 1000)}초, 접속 인원: ${io.engine.clientsCount}명`);
    }, 60000);
    
    phaseTimers.push(statusInterval);
}

// 서버 시작 시 첫 번째 경마 게임 초기화
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
    
    // 게임 상태 초기화
    currentPhase = 'betting';
    
    // 말 위치 정보 초기화
    horsesPositions = {};
    horsesFinishTimes = {};
    horsesFrameData = {};
    
    currentHorses.forEach(horse => {
        horsesPositions[horse.id] = 0;
        horsesFinishTimes[horse.id] = null;
    });
    
    // 레이싱 경과 시간 초기화
    racingElapsedTime = 0;
}

// 경주 결과 생성
function generateRaceResults() {
    // 레이스가 종료된 시점에 결과 생성
    console.log('경마 경주 결과 생성 중...');
    
    // 현재 기록된 말들의 위치와 완주 시간을 기반으로 결과 생성
    const horseResults = currentHorses.map(horse => {
        const horseId = horse.id;
        const position = horsesPositions[horseId] || 0;
        let finishTime = horsesFinishTimes[horseId];
        
        // 완주 시간이 기록되지 않은 말은 레이스 시간에 맞춰 적절한 시간 배정
        if (!finishTime) {
            // 현재 위치에 비례하여 완주 시간 추정
            const trackWidth = 1000; // 가정된 트랙 폭
            const progressRatio = Math.min(1, position / trackWidth);
            
        // 배당률이 낮은 말이 이길 확률이 약간 높게 설정
        const weight = 1 / horse.odds;
            
            // 반드시 레이스 시간 내에 모든 말이 완주하도록 시간 조정
            const minTime = RACE_TIME * 0.5; // 최소 시간은 30초 (레이스 시간의 50%)
            const maxTime = RACE_TIME * 0.92; // 최대 시간은 55초 (레이스 시간의 92%)
            
            // 가중치와 현재 진행 상황을 적용한 완주 시간 계산
            if (progressRatio >= 1) {
                // 이미 결승선을 통과한 경우 (서버에는 기록이 없지만 클라이언트에서는 통과)
                const baseTime = minTime + (maxTime - minTime) * (1 - weight * 0.5);
                finishTime = Math.min(maxTime, Math.max(minTime, baseTime + (Math.random() * 4 - 2)));
            } else {
                // 아직 결승선을 통과하지 못한 경우
                finishTime = maxTime; // 기본값으로 최대 시간 설정
            }
        }
        
        return {
            ...horse,
            finishTime: finishTime
        };
    });
    
    // 완주 시간순으로 정렬
    currentResults = horseResults.sort((a, b) => a.finishTime - b.finishTime);
    
    console.log(`경마 결과 생성 완료, 1등: ${currentResults[0].name} (${currentResults[0].finishTime.toFixed(2)}초), 꼴등: ${currentResults[currentResults.length-1].name} (${currentResults[currentResults.length-1].finishTime.toFixed(2)}초)`);
}

// 베팅 결과 정산
async function settleBets(io) {
    if (Object.keys(currentBets).length === 0) {
        console.log('정산할 베팅이 없습니다.');
        return;
    }
    
    console.log('경마 베팅 정산 시작');
    
    // 결과 유효성 확인
    if (!currentResults || currentResults.length < 3) {
        console.error('유효한 경주 결과가 없어 베팅 정산을 건너뜁니다.');
        return;
    }
    
    // 각 사용자별 베팅 확인 및 정산
    for (const userId in currentBets) {
        const userBets = currentBets[userId];
        let totalWinnings = 0;
        const winningBets = [];
        const losingBets = [];
        
        // 각 베팅에 대해 결과 확인
        for (const bet of userBets) {
            let isWin = false;
            let winAmount = 0;
            
            // 베팅 유형에 따라 승리 조건 확인
            switch (bet.betType) {
                case 'single': // 단승 (1등 맞히기)
                    isWin = bet.horseIds[0] === currentResults[0].id;
                    break;
                    
                case 'place': // 복승 (2위 안에 들기)
                    isWin = bet.horseIds.some(id => 
                        id === currentResults[0].id || id === currentResults[1].id
                    );
                    break;
                    
                case 'quinella': // 쌍승 (1등, 2등 순서 상관없이)
                    if (bet.horseIds.length === 2) {
                        const top2Ids = [currentResults[0].id, currentResults[1].id];
                        isWin = bet.horseIds.every(id => top2Ids.includes(id));
                    }
                    break;
                    
                case 'trifecta-place': // 삼복승 (1~3등 순서 상관없이)
                    if (bet.horseIds.length === 3) {
                        const top3Ids = currentResults.slice(0, 3).map(h => h.id);
                        isWin = bet.horseIds.every(id => top3Ids.includes(id));
                    }
                    break;
                    
                case 'trifecta': // 삼쌍승 (1~3등 정확한 순서)
                    if (bet.horseIds.length === 3) {
                        isWin = bet.horseIds[0] === currentResults[0].id && 
                                bet.horseIds[1] === currentResults[1].id && 
                                bet.horseIds[2] === currentResults[2].id;
                    }
                    break;
            }
            
            // 업데이트된 베팅 정보
            const updatedBet = {
                ...bet,
                status: isWin ? 'win' : 'lose',
                result: isWin ? 'win' : 'lose'
            };
            
            // 승리 시 상금 계산
            if (isWin) {
                // 이미 잠재적 당첨금이 계산되어 있으면 그대로 사용
                if (bet.potential_win) {
                    winAmount = bet.potential_win;
                } else {
                    // 말들의 배당률 정보 가져오기
                    const selectedHorses = bet.horses || bet.horseIds.map(id => {
                        const horse = currentHorses.find(h => h.id === id);
                        return {
                            id: horse.id,
                            name: horse.name,
                            odds: horse.odds
                        };
                    });
                    
                    // 베팅 정산 함수 사용
                    winAmount = calculatePotentialWin(bet.betType, selectedHorses, bet.amount);
                }
                
                totalWinnings += winAmount;
                updatedBet.winAmount = winAmount;
                
                winningBets.push(updatedBet);
            } else {
                losingBets.push(updatedBet);
            }
        }
        
        // 상금이 있으면 사용자 잔액 업데이트
        if (totalWinnings > 0) {
            try {
                // 현재 사용자 정보 조회
                const user = await User.findById(userId);
                
                if (!user) {
                    console.error(`사용자 ID ${userId}를 찾을 수 없어 상금 지급을 건너뜁니다.`);
                    continue;
                }
                
                // 잔액 업데이트 (베팅은 이미 차감됨)
                await User.updateBalance(userId, totalWinnings, true, true);
                
                // 업데이트된 사용자 정보 가져오기
                const updatedUser = await User.findById(userId);
                const newBalance = updatedUser ? updatedUser.balance : 0;
                
                // 로그 기록
                console.log(`경마 상금 지급: ${user.username}(ID: ${userId}), 금액: ${totalWinnings}, 새 잔액: ${newBalance}`);
                
                // 결과 데이터 준비
                const resultData = {
                    raceId: currentRaceId,
                    userId: userId,
                    username: user.username,
                    winningBets,
                    losingBets,
                    totalWinnings,
                    newBalance
                };
                
                // 클라이언트에 상금 지급 알림 (대상 찾기)
                const targetClient = Array.from(io.sockets.sockets.values())
                    .find(client => client.userId === userId);
                
                if (targetClient) {
                    // 특정 사용자에게만 전체 결과 전송
                    targetClient.emit('horse_race_winnings', resultData);
                    
                    // 연결된 사용자에게 잔액 업데이트 알림
                    targetClient.emit('user_balance_update', {
                        balance: newBalance,
                        username: user.username
                    });
                } else {
                    // 특정 사용자 소켓을 찾지 못하면 전체 브로드캐스트 (사용자 필터링)
                    io.emit('horse_race_winnings', resultData);
                }
                
            } catch (error) {
                console.error('경마 상금 지급 오류:', error);
            }
        } else if (userBets.length > 0) {
            // 패배만 있는 경우도 결과 전송
            try {
                // 사용자 정보 조회
                const user = await User.findById(userId);
                
                if (!user) {
                    console.error(`사용자 ID ${userId}를 찾을 수 없어 패배 알림을 건너뜁니다.`);
                    continue;
                }
                
                // 결과 데이터 준비
                const resultData = {
                    raceId: currentRaceId,
                    userId: userId,
                    username: user.username,
                    winningBets: [],
                    losingBets,
                    totalWinnings: 0,
                    newBalance: user.balance
                };
                
                // 클라이언트에 패배 알림 (대상 찾기)
                const targetClient = Array.from(io.sockets.sockets.values())
                    .find(client => client.userId === userId);
                
                if (targetClient) {
                    // 특정 사용자에게만 결과 전송
                    targetClient.emit('horse_race_winnings', resultData);
                }
                
                console.log(`경마 패배 알림: ${user.username}(ID: ${userId}), 베팅: ${losingBets.length}건`);
                
            } catch (error) {
                console.error('패배 알림 처리 오류:', error);
            }
        }
    }
    
    // 베팅 내역 초기화 (다음 경기를 위해)
    currentBets = {};
    console.log('경마 베팅 정산 완료');
}

// 레이스 시뮬레이션 데이터 미리 계산
function preCalculateRaceData() {
    console.log('경주 데이터 사전 계산 중...');
    
    // 트랙 폭 설정
    const trackWidth = TRACK_WIDTH;
    console.log(`트랙 폭: ${trackWidth}px`);
    
    // 경주 결과 계산
    // 배당률이 낮은 말(빠른 말)이 먼저 도착하고, 배당률이 높은 말(느린 말)이 나중에 도착하도록 설정
    
    // 말을 배당률 기준으로 정렬 (낮은 배당률 = 빠른 말)
    const sortedHorses = [...currentHorses].sort((a, b) => a.odds - b.odds);
    
    // 목표 완주 시간 설정 (전체 레이스 시간의 비율로 설정)
    const minTimeToFinish = RACE_TIME * 0.45; // 가장 빠른 말의 완주 시간 (레이스 시간의 45%)
    const maxTimeToFinish = RACE_TIME * 0.85; // 가장 느린 말의 완주 시간 (레이스 시간의 85%)
    
    // 말 간 시간 간격 계산 (말의 수에 따라 균등하게 분배)
    const timeRange = maxTimeToFinish - minTimeToFinish;
    const timeInterval = timeRange / (sortedHorses.length - 1 || 1); // 0으로 나누기 방지
    
    // 각 말에 목표 완주 시간 할당
    sortedHorses.forEach((horse, index) => {
        // 기본 목표 시간 = 최소 시간 + (인덱스 * 시간 간격)
        let targetFinishTime = minTimeToFinish + (index * timeInterval);
        
        // 약간의 무작위성 추가 (±5% 범위 내에서만 변동)
        const maxRandom = timeInterval * 0.1; // 최대 변동폭 = 간격의 10%
        const randomFactor = (Math.random() - 0.5) * 2 * maxRandom;
        targetFinishTime += randomFactor;
        
        // 최종 목표 시간 (최소, 최대 범위 내에서 제한)
        targetFinishTime = Math.max(minTimeToFinish, Math.min(maxTimeToFinish, targetFinishTime));
        
        // 이전 말보다 무조건 늦게 도착하도록 보장 (순위 중복 방지)
        if (index > 0) {
            const prevHorse = sortedHorses[index - 1];
            if (targetFinishTime <= prevHorse.targetFinishTime) {
                targetFinishTime = prevHorse.targetFinishTime + 0.2; // 최소 0.2초 차이
            }
        }
        
        // 말 객체에 목표 완주 시간 저장
        horse.targetFinishTime = targetFinishTime;
        console.log(`말 '${horse.name}' (배당률: ${horse.odds}배), 목표 완주 시간: ${targetFinishTime.toFixed(2)}초`);
    });
    
    // 프레임 데이터 생성 (각 초마다 60프레임)
    const totalFrameCount = RACE_TIME * 60; // 60fps 기준
    console.log(`총 프레임 수: ${totalFrameCount}`);
    
    // 각 말의 프레임별 위치 데이터 계산
    horsesFrameData = {};
    
    // 각 말마다 프레임 데이터 생성
    currentHorses.forEach(horse => {
        // 말의 프레임별 위치 배열 초기화
        const frames = [];
        
        // 모든 프레임에 대해 위치 계산
        for (let frame = 0; frame <= totalFrameCount; frame++) {
            // 현재 프레임의 시간 (초)
            const time = frame / 60;
            
            // 목표 완주 시간을 기준으로 진행률 계산 (0~1)
            const progress = Math.min(1.0, time / horse.targetFinishTime);
            
            // 베지어 곡선으로 부드러운 움직임 생성
            const position = calculateBezierCurve(progress) * trackWidth;
            
            // 프레임 위치 저장
            frames.push(position);
        }
        
        // 프레임 데이터 유효성 검사 및 보정
        for (let i = 1; i < frames.length; i++) {
            // 이전 프레임보다 뒤로 가지 않도록 보정
            if (frames[i] < frames[i-1]) {
                frames[i] = frames[i-1];
            }
            
            // 최대 트랙 폭을 넘지 않도록 보정
            if (frames[i] > trackWidth) {
                frames[i] = trackWidth;
            }
        }
        
        // 최종 프레임 데이터 저장
        horsesFrameData[horse.id] = frames;
        
        // 초기 위치 설정
        horsesPositions[horse.id] = 0;
        
        // 완주 시간 초기화
        horsesFinishTimes[horse.id] = null;
    });
    
    console.log('경주 데이터 사전 계산 완료');
    return horsesFrameData;
}

// 베지어 곡선 계산 함수 (부드러운 가속/감속 효과 생성)
function calculateBezierCurve(t) {
    // S자 형태의 3차 베지어 곡선 사용 (자연스러운 가속/감속)
    // 제어점: P0(0,0), P1(0.25,0.1), P2(0.75,0.9), P3(1,1)
    const p1y = 0.1;  // 첫 번째 제어점 - 천천히 가속
    const p2y = 0.9;  // 두 번째 제어점 - 중간에 빠르게 진행하다가 서서히 감속
    
    // 3차 베지어 곡선 공식 구현: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    const mt = 1 - t;           // (1-t)
    const mt2 = mt * mt;        // (1-t)²
    const mt3 = mt2 * mt;       // (1-t)³
    const t2 = t * t;           // t²
    const t3 = t2 * t;          // t³
    
    // P₀ = (0,0)이므로 첫 항은 0
    // P₃ = (1,1)이므로 마지막 항은 t³
    return (3 * mt2 * t * p1y) + (3 * mt * t2 * p2y) + t3;
}

// 경주 진행 중 실시간 위치 업데이트 타이머 설정
let positionUpdateTimer = null;

function setupRacePositionUpdates() {
    let positionUpdateTimer = null;
    
    // 레이싱 단계에서만 위치 업데이트 타이머 시작
    if (currentPhase === 'racing') {
        if (positionUpdateTimer) {
            clearInterval(positionUpdateTimer);
        }
        
        // 위치 업데이트 시작 시간 기록
        const updateStartTime = Date.now();
        console.log('말 위치 업데이트 타이머 시작:', new Date(updateStartTime).toLocaleTimeString());
        
        // 위치 업데이트 타이머 설정 (50ms 간격)
        positionUpdateTimer = setInterval(() => {
            // 경과 시간 계산 (밀리초)
            const elapsedMs = Date.now() - raceStartTime;
            
            // 프레임 인덱스 계산 (60fps 기준)
            const frameIndex = Math.floor(elapsedMs / (1000 / 60));
            
            // 최대 프레임 인덱스
            const maxFrameIndex = RACE_TIME * 60;
            
            // 레이스가 끝났는지 확인
            if (frameIndex >= maxFrameIndex) {
                // 타이머 정리
                clearInterval(positionUpdateTimer);
                positionUpdateTimer = null;
                console.log('레이스 종료, 위치 업데이트 타이머 중지');
                
                // 아직 완주하지 않은 말들을 처리
                currentHorses.forEach(horse => {
                    if (!horsesFinishTimes[horse.id]) {
                        // 완주 시간은 말의 목표 완주 시간으로 설정
                        horsesFinishTimes[horse.id] = horse.targetFinishTime || RACE_TIME;
                        // 위치는 트랙 끝으로 설정
                        horsesPositions[horse.id] = TRACK_WIDTH;
                    }
                });
                
                // 모든 플레이어에게 최종 위치 전송
                if (globalIo) {
                    globalIo.emit('race_positions_update', {
                        horsesPositions: horsesPositions,
                        horsesFinishTimes: horsesFinishTimes,
                        racingElapsedTime: elapsedMs
                    });
                }
                
                return;
            }
            
            // 각 말의 위치 업데이트
            let allHorsesFinished = true;
            currentHorses.forEach(horse => {
                // 이미 완주한 말은 건너뛰기
                if (horsesFinishTimes[horse.id]) return;
                
                // 이 말은 아직 완주하지 않았음
                allHorsesFinished = false;
                
                // 프레임 데이터에서 위치 가져오기
                if (horsesFrameData[horse.id] && frameIndex < horsesFrameData[horse.id].length) {
                    horsesPositions[horse.id] = horsesFrameData[horse.id][frameIndex];
                    
                    // 완주 체크 (트랙 폭의 98% 이상 진행 시)
                    if (horsesPositions[horse.id] >= TRACK_WIDTH * 0.98) {
                        // 현재 시간을 기준으로 완주 시간 계산
                        horsesFinishTimes[horse.id] = elapsedMs / 1000;
                        console.log(`말 '${horse.name}' 완주, 시간: ${horsesFinishTimes[horse.id].toFixed(2)}초`);
                        
                        // 최종 위치는 트랙 끝으로 설정
                        horsesPositions[horse.id] = TRACK_WIDTH;
                    }
                }
            });
            
            // 모든 말이 완주했으면 타이머 중지
            if (allHorsesFinished) {
                clearInterval(positionUpdateTimer);
                positionUpdateTimer = null;
                console.log('모든 말 완주, 위치 업데이트 타이머 중지');
                
                // 단계 완료 후 다음 주기로 이동하는 함수 호출 추가
                // (필요에 따라 여기에 추가 로직 구현)
            }
            
            // 중간 위치 업데이트 (200ms마다 또는 클라이언트 수가 많을 경우 500ms마다)
            const connectedClientsCount = globalIo ? Object.keys(globalIo.sockets.sockets).length : 0;
            const updateInterval = connectedClientsCount > 100 ? 500 : 200;
            
            if (elapsedMs % updateInterval < 50) {
                if (globalIo) {
                    globalIo.emit('race_positions_update', {
                        horsesPositions: horsesPositions,
                        horsesFinishTimes: horsesFinishTimes,
                        racingElapsedTime: elapsedMs
                    });
                }
            }
        }, 50); // 50ms 간격으로 업데이트 (약 20fps)
    }
}

// 현재 시간으로 주기 시작 시간 설정 (3분 주기에 맞춰 정각, 3분, 6분, 9분 단위로 시작)
function calculateCycleStartTime() {
    const now = Date.now();
    const date = new Date(now);
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();
    
    // 현재 시간이 속한 3분 주기의 시작 시간 계산
    const currentCycleMinute = Math.floor(minutes / CYCLE_MINUTES) * CYCLE_MINUTES;
    
    // 해당 주기의 시작 시간으로 설정
    date.setMinutes(currentCycleMinute);
    date.setSeconds(0);
    date.setMilliseconds(0);
    
    const cycleStartMs = date.getTime();
    
    // 현재 시간과 주기 시작 시간의 차이 계산
    const timeDiff = now - cycleStartMs;
    const cycleTimeMs = CYCLE_MINUTES * 60 * 1000;
    
    // 시작 시간이 현재보다 미래인 경우 (주기가 아직 시작되지 않음) 그대로 사용
    if (timeDiff < 0) {
        console.log(`다음 주기 시작 시간: ${new Date(cycleStartMs).toLocaleTimeString()}, 차이: ${Math.floor(-timeDiff/1000)}초 후`);
        return cycleStartMs;
    } 
    // 시작 시간이 현재보다 과거이지만 아직 현재 주기 내에 있는 경우
    else if (timeDiff < cycleTimeMs) {
        console.log(`현재 주기 시작 시간: ${new Date(cycleStartMs).toLocaleTimeString()}, 경과: ${Math.floor(timeDiff/1000)}초`);
        return cycleStartMs;
    } 
    // 현재 주기를 이미 지난 경우 다음 주기 계산
    else {
        // 다음 주기 시작 시간 계산
        const nextCycleMinute = (Math.floor(minutes / CYCLE_MINUTES) + 1) * CYCLE_MINUTES;
        date.setMinutes(nextCycleMinute);
        const nextCycleMs = date.getTime();
        console.log(`다음 주기 시작 시간: ${new Date(nextCycleMs).toLocaleTimeString()}, 차이: ${Math.floor((nextCycleMs - now)/1000)}초 후`);
        return nextCycleMs;
    }
}

module.exports = {
    setupHorseRacingSocket
}; 