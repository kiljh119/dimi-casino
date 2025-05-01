const User = require('../models/User');

// 서버 시간 기준 게임 주기 관리
const BETTING_TIME = 120; // 2분 베팅 시간
const RACE_TIME = 60; // 1분 경주 시간
const TOTAL_CYCLE = BETTING_TIME + RACE_TIME; // 총 주기 (3분)
const TRACK_WIDTH = 1000; // 가정된 트랙 폭
const PREPARE_TIME = 3; // 경주 시작 전 준비 시간 (초)

// 말 정보
const horseNames = ['이승만', '박정희', '전두환', '김대중', '노무현', '이명박', '윤석열', '이재명'];

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

// 호스 레이싱 소켓 핸들러
function setupHorseRacingSocket(io) {
    console.log('경마 게임 소켓 핸들러 설정 완료');
    
    // 타이머 초기화 함수
    function clearAllTimers() {
        phaseTimers.forEach(timer => clearTimeout(timer));
        phaseTimers = [];
    }
    
    // 서버 시작 시 첫 번째 경마 게임 초기화
    generateNewRace();
    
    // 현재 시간으로 주기 시작 시간 설정
    cycleStartTime = Date.now();
    startRaceCycle(io);
    
    // 말 위치 정보 초기화
    horsesPositions = {};
    currentHorses.forEach(horse => {
        horsesPositions[horse.id] = 0;
    });
    
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
            const elapsedTime = currentTime - cycleStartTime;
            const timeInCycle = elapsedTime % (TOTAL_CYCLE * 1000);
            
            // 현재 단계 결정
            let isRacing = false;
            let isPreparing = false;
            
            // 베팅 시간이 끝나고 레이싱 시간이 시작되기 전이면 준비 단계
            if (timeInCycle >= (BETTING_TIME - PREPARE_TIME) * 1000 && timeInCycle < BETTING_TIME * 1000) {
                isPreparing = true;
                isRacing = false;
            } 
            // 베팅 시간이 끝나면 레이싱 단계
            else if (timeInCycle >= BETTING_TIME * 1000) {
                isPreparing = false;
                isRacing = true;
            }
            
            // 현재 게임 단계 업데이트
            if (isPreparing) {
                currentPhase = 'preparing';
            } else if (isRacing) {
                currentPhase = 'racing';
            } else {
                currentPhase = 'betting';
            }
            
            // 남은 시간 계산
            let remainingTime;
            let racingElapsed = 0;
            
            if (isRacing) {
                // 레이싱 단계면 RACE_TIME에서 경과된 레이싱 시간을 뺌
                racingElapsed = Math.floor((timeInCycle - BETTING_TIME * 1000) / 1000);
                racingElapsedTime = racingElapsed * 1000; // 밀리초 단위로 저장
                remainingTime = RACE_TIME - racingElapsed;
            } else if (isPreparing) {
                // 준비 단계면 베팅 종료까지 남은 시간
                remainingTime = BETTING_TIME - Math.floor(timeInCycle / 1000);
            } else {
                // 베팅 단계면 BETTING_TIME에서 경과된 베팅 시간을 뺌
                remainingTime = BETTING_TIME - Math.floor(timeInCycle / 1000);
                racingElapsedTime = 0;
            }
            
            // 남은 시간이 음수면 0으로 처리
            remainingTime = Math.max(0, remainingTime);
            
            // 위치 정보가 있는 말 데이터 생성
            const horsesWithPositions = currentHorses.map(horse => {
                return {
                    ...horse,
                    position: horsesPositions[horse.id] || 0,
                    finishTime: horsesFinishTimes[horse.id] || null
                };
            });
            
            // 응답 데이터
            const responseData = {
                raceId: currentRaceId,
                horses: horsesWithPositions, // 위치 정보가 포함된 말 데이터 전송
                phase: currentPhase,
                remainingTime: remainingTime,
                racingElapsedTime: racingElapsedTime, // 레이싱 경과 시간 추가
                results: isRacing ? currentResults : [],
                cycleStartTime: cycleStartTime,
                raceStartTime: isRacing ? (currentTime - racingElapsedTime) : 0, // 레이스 시작 시간 계산해서 전송
                raceEndTime: raceEndTime, // 레이스 종료 시간 추가
                horsesPositions: horsesPositions, // 위치 정보도 따로 전송
                bettingTime: BETTING_TIME,
                prepareTime: PREPARE_TIME,
                raceTime: RACE_TIME,
                totalCycle: TOTAL_CYCLE,
                trackWidth: TRACK_WIDTH
            };
            
            // 준비 단계나 레이싱 단계면 프레임 데이터도 전송
            if (isPreparing || isRacing) {
                responseData.horsesFrameData = horsesFrameData;
            }
            
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
                const elapsedTime = currentTime - cycleStartTime;
                const timeInCycle = elapsedTime % (TOTAL_CYCLE * 1000);
                
                if (timeInCycle >= BETTING_TIME * 1000 || currentPhase !== 'betting') {
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

// 경마 게임 주기 실행
function startRaceCycle(io) {
    // 현재 시간 기준으로 주기 계산
    const currentTime = Date.now();
    
    // 타이머 초기화
    phaseTimers.forEach(timer => clearTimeout(timer));
    phaseTimers = [];
    
    // 주기 시작 시간 설정 (현재 시간)
    cycleStartTime = currentTime;
    
    // 현재 페이즈를 베팅 단계로 시작
    currentPhase = 'betting';
    console.log(`새로운 경마 게임 주기 시작, 현재 시간: ${new Date(currentTime).toLocaleTimeString()}, 단계: ${currentPhase}`);
    
    // 베팅 단계 종료 시간 설정
    const bettingEndTime = cycleStartTime + BETTING_TIME * 1000;
    
    // 준비 단계 시작 타이머 설정 (베팅 시간 - 준비 시간)
    const preparingTimer = setTimeout(() => {
        currentPhase = 'preparing';
        preparingStartTime = Date.now();
        
        // 경주 시작 시간과 종료 시간 미리 계산
        raceStartTime = preparingStartTime + PREPARE_TIME * 1000;
        raceEndTime = raceStartTime + RACE_TIME * 1000;
        
        // 레이스 시뮬레이션 데이터 미리 계산 (말들의 전체 경로)
        preCalculateRaceData();
        
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
    }, (BETTING_TIME - PREPARE_TIME) * 1000);
    
    phaseTimers.push(preparingTimer);
    
    // 레이싱 단계 타이머 설정 (베팅 시간 후)
    const racingTimer = setTimeout(() => {
        currentPhase = 'racing';
        
        // 클라이언트에 레이스 시작 알림
        io.emit('race_start', {
            raceId: currentRaceId,
            raceStartTime: raceStartTime,
            raceEndTime: raceEndTime,
            horsesFrameData: horsesFrameData
        });
        
        console.log(`레이싱 단계 시작, 현재 시간: ${new Date().toLocaleTimeString()}`);
    }, BETTING_TIME * 1000);
    
    phaseTimers.push(racingTimer);
    
    // 레이스 결과 타이머 설정 (베팅 시간 + 레이스 시간 후)
    const resultTimer = setTimeout(() => {
        // 결과 생성
        generateRaceResults();
        
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
    }, (BETTING_TIME + RACE_TIME) * 1000);
    
    phaseTimers.push(resultTimer);
    
    // 다음 주기 타이머 설정 (전체 주기 시간 후)
    const nextCycleTimer = setTimeout(() => {
        // 새 게임 시작
        currentPhase = 'betting';
        generateNewRace();
        cycleStartTime = Date.now();
        
        // 새 게임 정보 브로드캐스트
        io.emit('new_race', {
            raceId: currentRaceId,
            horses: currentHorses.map(horse => ({
                ...horse,
                position: horsesPositions[horse.id] || 0
            })),
            cycleStartTime: cycleStartTime
        });
        
        console.log(`새 주기 시작, 현재 시간: ${new Date().toLocaleTimeString()}`);
        
        // 다음 주기 재시작
        startRaceCycle(io);
        
    }, TOTAL_CYCLE * 1000);
    
    phaseTimers.push(nextCycleTimer);
    
    // 남은 시간 로그
    console.log(`베팅 종료까지: ${BETTING_TIME}초, 다음 주기까지: ${TOTAL_CYCLE}초`);
    
    // 매 분마다 현재 게임 상태 로그 출력
    const statusInterval = setInterval(() => {
        const now = Date.now();
        const elapsedTime = now - cycleStartTime;
        const timeInCycle = elapsedTime % (TOTAL_CYCLE * 1000);
        
        // 현재 단계 결정
        let phase;
        if (timeInCycle >= BETTING_TIME * 1000) {
            phase = 'racing';
        } else if (timeInCycle >= (BETTING_TIME - PREPARE_TIME) * 1000) {
            phase = 'preparing';
        } else {
            phase = 'betting';
        }
        
        // 현재 단계에 따라 남은 시간 계산
        let remaining;
        if (phase === 'racing') {
            remaining = TOTAL_CYCLE * 1000 - timeInCycle;
        } else if (phase === 'preparing') {
            remaining = BETTING_TIME * 1000 - timeInCycle;
        } else {
            remaining = BETTING_TIME * 1000 - timeInCycle;
        }
        
        console.log(`현재 게임 상태: ${phase}, 남은 시간: ${Math.floor(remaining / 1000)}초, 접속 인원: ${io.engine.clientsCount}명`);
    }, 60000);
    
    phaseTimers.push(statusInterval);
}

// 레이스 시뮬레이션 데이터 미리 계산
function preCalculateRaceData() {
    console.log('경주 시뮬레이션 데이터 계산 중...');
    
    const totalTime = RACE_TIME; // 총 경주 시간 (초)
    const FPS = 60; // 초당 프레임 수
    const totalFrames = totalTime * FPS; // 총 프레임 수
    horsesFrameData = {}; // 프레임 데이터 초기화
    
    // 목표 완주 시간 결정 (균등 분포로 모든 말이 레이스 내에 도착하도록)
    const minTimeToFinish = RACE_TIME * 0.4; // 최소 완주 시간은 24초 (레이스 시간의 40%)
    const maxTimeToFinish = RACE_TIME * 0.85; // 최대 완주 시간은 51초 (레이스 시간의 85%)
    
    // 배당률에 따라 말의 순위 결정 (낮은 배당률 = 빠른 말)
    const horsesWithOdds = [...currentHorses].sort((a, b) => a.odds - b.odds);
    
    // 말들의 목표 완주 시간을 균등하게 분포시킴
    const targetFinishTimes = [];
    horsesWithOdds.forEach((horse, index) => {
        // 시간 간격 계산 - 전체 가용 시간을 말 수로 나눔
        const timeRange = maxTimeToFinish - minTimeToFinish;
        const timePerHorse = timeRange / horsesWithOdds.length;
        
        // 기본 목표 시간 = 최소 시간 + (인덱스 * 말당 시간) + 약간의 랜덤성
        const baseFinishTime = minTimeToFinish + (index * timePerHorse);
        const randomFactor = Math.random() * (timePerHorse * 0.5); // 0 ~ 시간 간격의 절반까지 랜덤성 추가
        
        // 최종 목표 시간 (최대 시간을 넘지 않도록)
        const targetFinishTime = Math.min(maxTimeToFinish, baseFinishTime + randomFactor);
        targetFinishTimes.push({
            horseId: horse.id,
            targetTime: targetFinishTime
        });
    });
    
    // 각 말마다 전체 경로 계산
    targetFinishTimes.forEach((data) => {
        const horseId = data.horseId;
        const targetTime = data.targetTime;
        const horse = currentHorses.find(h => h.id === horseId);
        
        if (!horse) return;
        
        // 각 프레임에 대한 위치값 계산
        const frames = [];
        
        // 목표 완주 시간에 맞게 전체 경로 계산
        const avgSpeed = TRACK_WIDTH / (targetTime * FPS); // 일정 속도 가정
        
        // 가속도와 속도 패턴을 적용하여 자연스러운 움직임 생성
        let pos = 0;
        let speed = avgSpeed * 0.7; // 시작 속도는 평균의 70%
        const acceleration = avgSpeed * 0.6 / totalFrames; // 가속도
        let previousSpeeds = [speed, speed, speed]; // 속도 평활화를 위한 이전 속도 기록
        
        for (let i = 0; i < totalFrames; i++) {
            // 시간에 따른 속도 패턴 - 시작은 느리게, 중간은 빠르게, 마지막은 조금 느리게
            const timeProgress = i / totalFrames;
            
            // 완주 시간 기반 보정 - 진도가 늦으면 속도 증가, 빠르면 감속
            const expectedPosition = (i / targetTime / FPS) * TRACK_WIDTH;
            const speedBoost = expectedPosition > pos ? 1.3 : 0.7; // 뒤처지면 가속, 앞서면 감속
            
            // 기본 가속도에 시간에 따른 변화 추가
            let currentAcceleration = acceleration * speedBoost;
            
            if (timeProgress < 0.2) {
                // 처음 20%는 가속 단계
                currentAcceleration = acceleration * 1.8 * speedBoost;
            } else if (timeProgress > 0.7) {
                // 마지막 30%는 약간 감속
                currentAcceleration = acceleration * 0.5 * speedBoost;
            }
            
            // 속도 업데이트 (자연스러운 변화를 위해 약간의 랜덤성 추가)
            speed += currentAcceleration + (Math.random() * avgSpeed * 0.1 - avgSpeed * 0.05);
            
            // 속도 평활화 (갑작스러운 변화 방지)
            previousSpeeds.push(speed);
            if (previousSpeeds.length > 3) previousSpeeds.shift();
            const smoothedSpeed = previousSpeeds.reduce((a, b) => a + b, 0) / previousSpeeds.length;
            
            // 최소/최대 속도 제한
            const limitedSpeed = Math.max(avgSpeed * 0.6, Math.min(avgSpeed * 2.0, smoothedSpeed));
            
            // 위치 업데이트
            pos += limitedSpeed;
            
            // 목표 완주 시간에 결승선에 도달하도록 보정
            const targetFrame = Math.floor(targetTime * FPS);
            if (i === targetFrame - 1) {
                pos = TRACK_WIDTH;
            }
            
            // 트랙 폭을 넘지 않도록 보정
            pos = Math.min(pos, TRACK_WIDTH);
            
            // 프레임 위치 저장
            frames.push(pos);
            
            // 결승선 통과 시 다음 프레임들은 모두 결승선 위치로 설정
            if (pos >= TRACK_WIDTH) {
                while (frames.length < totalFrames) {
                    frames.push(TRACK_WIDTH);
                }
                break;
            }
        }
        
        // 말 아이디를 키로 프레임 데이터 저장
        horsesFrameData[horseId] = frames;
        
        // 말 초기 위치 및 완주 시간 초기화
        horsesPositions[horseId] = 0;
        horsesFinishTimes[horseId] = targetTime;
    });
    
    // 미리 결승 결과 계산
    currentResults = targetFinishTimes.sort((a, b) => a.targetTime - b.targetTime).map((data, index) => {
        const horse = currentHorses.find(h => h.id === data.horseId);
        return {
            ...horse,
            finishTime: data.targetTime,
            rank: index + 1
        };
    });
    
    console.log(`경주 시뮬레이션 데이터 계산 완료, ${Object.keys(horsesFrameData).length}마리의 말 경로 생성`);
    console.log(`1등: ${currentResults[0].name} (${currentResults[0].finishTime.toFixed(2)}초), 꼴등: ${currentResults[currentResults.length-1].name} (${currentResults[currentResults.length-1].finishTime.toFixed(2)}초)`);
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