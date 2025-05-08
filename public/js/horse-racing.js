// 경마 게임 스크립트
document.addEventListener('DOMContentLoaded', function() {
    // 소켓 연결 (연결 실패시 가상 소켓 사용)
    let socket;
    try {
        socket = io();
        console.log('소켓 연결 시도...');
    } catch (e) {
        console.error('소켓 연결 오류:', e);
        // 가상 소켓 생성
        socket = createVirtualSocket();
    }
    
    // 가상 소켓 생성 함수
    function createVirtualSocket() {
        console.log('가상 소켓 생성');
        return {
            connected: false,
            on: function(event, callback) {
                console.log('가상 소켓 이벤트 등록:', event);
                return this;
            },
            emit: function(event, data) {
                console.log('가상 소켓 이벤트 발생:', event, data);
                
                // get_server_time 이벤트에 가상 응답
                if (event === 'get_server_time' && data && data.clientTime) {
                    setTimeout(() => {
                        const responseData = {
                            serverTime: Date.now(),
                            clientTime: data.clientTime
                        };
                        console.log('가상 서버 시간 응답:', responseData);
                    }, 100);
                }
                
                return this;
            }
        };
    }
    
    // 필요한 DOM 요소들
    const userNameElement = document.getElementById('user-name');
    const userBalanceElement = document.getElementById('user-balance');
    const backToMenuButton = document.getElementById('back-to-menu');
    const timeRemainingElement = document.getElementById('time-remaining');
    const raceStatusText = document.getElementById('race-status-text');
    const raceTrack = document.querySelector('.race-track');
    const resultPanel = document.getElementById('race-result-panel');
    const resultList = document.getElementById('result-list');
    const horseList = document.getElementById('horse-list');
    const betTypeOptions = document.querySelectorAll('.bet-type');
    const betAmountInput = document.getElementById('bet-amount');
    const amountButtons = document.querySelectorAll('.amount-btn');
    const placeBetButton = document.getElementById('place-bet-btn');
    const selectedHorseText = document.getElementById('selected-horse-text');
    const selectedBetTypeText = document.getElementById('selected-bet-type-text');
    const selectedOddsText = document.getElementById('selected-odds-text');
    const potentialWinText = document.getElementById('potential-win-text');
    const multiSelections = document.getElementById('multi-selections');
    const betsList = document.getElementById('bets-list');
    
    // 추가 DOM 요소들
    const raceProgressContainer = document.getElementById('race-progress-container');
    const raceProgressBar = document.getElementById('race-progress-bar');
    const raceProgressText = document.getElementById('race-progress-text');
    const raceProgressPercentage = document.getElementById('race-progress-percentage');
    
    // 게임 상수
    const BETTING_TIME = 120; // 2분
    const RACE_TIME = 60; // 1분
    const TOTAL_CYCLE = BETTING_TIME + RACE_TIME; // 3분
    const FINISH_LINE_OFFSET = 30; // 결승선까지의 여백
    let GLOBAL_TRACK_WIDTH = 0; // 모든 말이 공통으로 사용할 트랙 폭
    
    // 게임 상태 변수
    let horses = []; // 말 목록
    let gamePhase = 'betting'; // 현재 게임 단계
    let raceResults = []; // 경주 결과
    let serverConnected = false; // 서버 연결 상태
    let serverTimeOffset = 0; // 서버 시간과의 차이
    let cycleStartTime = 0; // 주기 시작 시간
    let raceStartTime = 0; // 레이스 시작 시간
    let raceEndTime = 0; // 레이스 종료 시간
    let preparingStartTime = 0; // 준비 단계 시작 시간
    let horsesFrameData = {}; // 각 말의 프레임별 위치 데이터
    let currentUser = null; // 현재 사용자
    let selectedBetType = null; // 선택된 베팅 유형
    let currentBets = []; // 현재 베팅 목록
    let multiSelectedHorses = []; // 복식 베팅용 선택된 말들
    let gameInitialized = false; // 게임 초기화 여부
    let isBettingInProgress = false; // 베팅 처리 중 상태 플래그

    let localTimerMode = false; // 로컬 타이머 모드 (서버 시간 대신 로컬 시간 사용)
    let localTimerStart = 0; // 로컬 타이머 시작 시간
    let localRaceStartTime = 0; // 로컬 레이스 시작 시간
    
    // 타이머 및 애니메이션 식별자
    let countdownInterval = null; // 카운트다운 타이머
    let progressInterval = null; // 진행 상태 업데이트 타이머
    let raceAnimationId = null; // 레이스 애니메이션 프레임 요청 ID
    let phaseTimers = []; // 게임 단계 전환 타이머들
    
    // 말 정보 초기화 (8마리)
    const horseNames = ['이승만', '박정희', '전두환', '김대중', '노무현', '이명박', '윤석열', '이재명'];
    
    // 서버 시간과 로컬 시간 동기화 함수
    function syncServerTime() {
        console.log('서버 시간 동기화 시작...');
        const clientTime = Date.now();
        socket.emit('get_server_time', { clientTime });
    }
    
    // 서버 시간 가져오기
    function getServerTime() {
        return Date.now() + serverTimeOffset;
    }
    
    // 타이머 초기화 함수
    function clearAllTimers() {
        if (countdownInterval) clearInterval(countdownInterval);
        if (progressInterval) clearInterval(progressInterval);
        if (raceAnimationId) cancelAnimationFrame(raceAnimationId);
        
        phaseTimers.forEach(timer => clearTimeout(timer));
        phaseTimers = [];
        
        countdownInterval = null;
        progressInterval = null;
        raceAnimationId = null;
    }
    
    // 게임 주기 초기화 (3분마다 한 번씩 경기)
    function initGameCycle() {
        console.log('게임 주기 초기화 중...');
        
        // 이전 타이머 제거
        clearAllTimers();
        
        // 현재 서버 시간 확인
        const serverTime = getServerTime();
        
        // 주기 시작 시간이 설정되었는지 확인
        if (!cycleStartTime) {
            console.error('주기 시작 시간이 설정되지 않았습니다.');
            return;
        }
        
        // 현재 시간과 주기 시작 시간의 차이 계산
        const elapsedTime = serverTime - cycleStartTime;
        
        // 현재 시간이 주기 내 어디에 위치하는지 계산
        let phase = '';
        
        // 베팅 단계: 0 ~ BETTING_TIME - PREPARE_TIME 초
        if (elapsedTime < (BETTING_TIME - 3) * 1000) {
            phase = 'betting';
        } 
        // 준비 단계: BETTING_TIME - PREPARE_TIME ~ BETTING_TIME 초
        else if (elapsedTime < BETTING_TIME * 1000) {
            phase = 'preparing';
        }
        // 레이싱 단계: BETTING_TIME ~ BETTING_TIME + RACE_TIME 초
        else if (elapsedTime < (BETTING_TIME + RACE_TIME) * 1000) {
            phase = 'racing';
        }
        // 다음 주기 대기 중 (이 구간은 매우 짧은 시간이어야 함)
        else {
            phase = 'betting';
        }
        
        // 현재 게임 단계 설정
        gamePhase = phase;
        
        console.log(`현재 주기 시작 시간: ${new Date(cycleStartTime).toLocaleTimeString()}`);
        console.log(`경과 시간: ${Math.floor(elapsedTime / 1000)}초, 현재 단계: ${gamePhase}`);
            
            // 말 데이터 요청
            requestHorseData();
        
        // 기본 동기화 모드: 서버 시간 기준
        localTimerMode = false;
        
        // 현재 단계에 따른 처리
        if (gamePhase === 'betting') {
            // 베팅 단계
            // 이 단계에서는 베팅 종료 시간(BETTING_TIME)까지 남은 시간 계산
            const timeToRace = cycleStartTime + BETTING_TIME * 1000 - serverTime;
            console.log('베팅 단계. 경주 시작까지:', Math.floor(timeToRace / 1000), '초');
            
            // 베팅 UI 표시
            showBettingUI();
            hideRaceProgressBar();
            
            // 경주 시작 시간에 맞춰 타이머 설정
            const racingTimer = setTimeout(() => {
                gamePhase = 'racing';
                // 로컬 타이머 모드로 전환
                localTimerMode = true;
                localTimerStart = Date.now();
                localRaceStartTime = Date.now();
                startRace();
            }, timeToRace);
            
            phaseTimers.push(racingTimer);
            
            // 매 초마다 남은 시간 업데이트
            updateRemainingTime(Math.floor(timeToRace / 1000));
        } else if (gamePhase === 'preparing') {
            // 준비 단계
            const timeToRace = cycleStartTime + BETTING_TIME * 1000 - serverTime;
            console.log('준비 단계. 경주 시작까지:', Math.floor(timeToRace / 1000), '초');
            
            // 준비 UI 표시
            showPreparingUI();
            startPreparingProgressBar(BETTING_TIME * 1000 - elapsedTime);
            
            // 경주 시작 시간에 맞춰 타이머 설정
            const racingTimer = setTimeout(() => {
                gamePhase = 'racing';
                // 로컬 타이머 모드로 전환
                localTimerMode = true;
                localTimerStart = Date.now();
                localRaceStartTime = Date.now();
                startRace();
            }, timeToRace);
            
            phaseTimers.push(racingTimer);
            
            // 매 초마다 남은 시간 업데이트
            updateRemainingTime(Math.floor(timeToRace / 1000));
        } else {
            // 경주 단계
            const racingElapsedTime = elapsedTime - BETTING_TIME * 1000; // 레이싱 단계에서 경과된 시간
            const remainingRaceTime = Math.max(0, RACE_TIME * 1000 - racingElapsedTime); // 남은 레이싱 시간
            const timeToNextCycle = cycleStartTime + TOTAL_CYCLE * 1000 - serverTime;
            
            console.log('경주 단계. 레이싱 단계 경과 시간:', Math.floor(racingElapsedTime / 1000), '초, 남은 레이싱 시간:', Math.floor(remainingRaceTime / 1000), '초');
            
            // 경주 UI 표시
            showRacingUI();
            
            // 로컬 타이머 모드로 전환
            localTimerMode = true;
            localTimerStart = Date.now() - racingElapsedTime; // 이미 경과된 시간 반영
            localRaceStartTime = Date.now() - racingElapsedTime; // 이미 경과된 시간 반영
            
            // 경주 진행 표시기 표시 (경과된 시간 반영)
            startRaceProgressBar(racingElapsedTime);
            
            // 경주 시뮬레이션 시작 (이미 진행 중인 경주에 합류)
            animateRace(Math.floor(racingElapsedTime / (1000 / 60))); // FPS(60)을 고려한 프레임 계산
            
            // 다음 주기 시작 시간에 맞춰 타이머 설정
            const nextCycleTimer = setTimeout(() => {
                gamePhase = 'betting';
                // 로컬 타이머 모드 유지, 다음 주기 시작 시간으로 서버에서 새로운 정보 받아옴
                requestHorseData();
                showBettingUI();
                hideRaceProgressBar();
                
                // 다음 주기의 베팅 시간 설정
                updateRemainingTime(BETTING_TIME);
            }, timeToNextCycle);
            
            phaseTimers.push(nextCycleTimer);
            
            // 매 초마다 남은 시간 업데이트 - 남은 레이싱 시간 기준
            if (remainingRaceTime > 0) {
                updateRemainingTime(Math.floor(remainingRaceTime / 1000), true);
            } else {
                // 이미 레이싱이 끝난 상태지만 다음 베팅까지 대기 중인 경우
            updateRemainingTime(Math.floor(timeToNextCycle / 1000), true);
            }
        }
    }
    
    // 말 데이터 요청
    function requestHorseData() {
        console.log('말 데이터 요청 중...');
        
        // 서버 연결 확인
        if (!socket.connected) {
            console.log('서버 연결이 없습니다. 로컬에서 말 생성');
            generateHorses();
            return;
        }
        
        // 서버에 요청 전송
        socket.emit('get_race_state');
        
        // 5초 내에 응답이 없으면 로컬에서 말 생성
        const dataTimer = setTimeout(() => {
            if (horses.length === 0) {
                console.log('서버 응답 없음, 로컬에서 말 생성');
                generateHorses();
            }
        }, 5000);
        
        phaseTimers.push(dataTimer);
    }
    
    // 남은 시간 업데이트 함수
    function updateRemainingTime(secondsLeft, isRacingPhase = false) {
        // 이전 타이머 중단
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        // 유효하지 않은 시간인 경우 보정
        if (secondsLeft === undefined || secondsLeft === null || secondsLeft < 0) {
            console.warn('유효하지 않은 남은 시간:', secondsLeft, '기본값으로 대체');
            secondsLeft = isRacingPhase ? RACE_TIME : BETTING_TIME;
        }
            
            // 시간 형식 변환 (MM:SS)
        const updateTimerDisplay = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            timeRemainingElement.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        };
        
        // 초기 표시
        updateTimerDisplay(secondsLeft);
        console.log(`타이머 초기화: ${isRacingPhase ? '레이싱' : '베팅'} 단계, 남은 시간: ${secondsLeft}초`);
        
        // 단계에 따른 타이머 종료 시간 설정
        let timerEndTime;
        
        if (isRacingPhase) {
            // 레이싱 단계: 레이스 시작 시간 + 레이싱 시간
            if (!raceStartTime || raceStartTime <= 0) {
                console.warn('유효하지 않은 레이스 시작 시간:', raceStartTime);
                // 없으면 현재 서버 시간 + 남은 시간으로 대체
                timerEndTime = getServerTime() + secondsLeft * 1000;
            } else {
                timerEndTime = raceStartTime + RACE_TIME * 1000;
            }
        } else {
            // 베팅 단계: 주기 시작 시간 + 베팅 시간
            if (!cycleStartTime || cycleStartTime <= 0) {
                console.warn('유효하지 않은 주기 시작 시간:', cycleStartTime);
                // 없으면 현재 서버 시간 + 남은 시간으로 대체
                timerEndTime = getServerTime() + secondsLeft * 1000;
            } else {
                timerEndTime = cycleStartTime + BETTING_TIME * 1000;
            }
        }
        
        console.log(`타이머 설정: 종료 시간 ${new Date(timerEndTime).toLocaleTimeString()}, 남은 시간: ${secondsLeft}초`);
        
        // 타이머 시작 (100ms 간격으로 업데이트하여 부드럽게 표시)
        countdownInterval = setInterval(() => {
            // 현재 서버 시간 기준으로 남은 시간 계산
            const currentServerTime = getServerTime();
            const remainingMs = Math.max(0, timerEndTime - currentServerTime);
            const remainingSeconds = Math.ceil(remainingMs / 1000); // 초 단위로 변환하고 올림
            
            // 시간 표시 업데이트
            updateTimerDisplay(remainingSeconds);
            
            // 로그 출력 (1초마다)
            if (remainingSeconds % 10 === 0 || remainingSeconds <= 5) {
                console.log(`타이머 업데이트: ${gamePhase} 단계, 남은 시간: ${remainingSeconds}초`);
            }
            
            // 시간이 다 되면 다음 단계로 전환
            if (remainingMs <= 0) {
                clearInterval(countdownInterval);
                console.log(`타이머 완료: ${gamePhase} 단계 종료`);
                
                // 서버에 현재 상태를 요청하여 싱크 맞추기
                if (socket.connected) {
                    console.log('서버에 현재 상태 요청');
                    socket.emit('get_race_state');
                    return;
                }
                
                // 서버 연결이 없을 경우 로컬에서 다음 단계로 전환 (백업)
                if (isRacingPhase) {
                gamePhase = 'betting';
                    hideRaceProgressBar();
                showBettingUI();
                    updateRemainingTime(BETTING_TIME, false);
                } else {
                gamePhase = 'racing';
                    startRaceProgressBar();
                startRace();
                updateRemainingTime(RACE_TIME, true);
            }
            }
        }, 100); // 더 부드러운 업데이트를 위해 100ms 간격으로 설정
        
        // 타이머 저장 (나중에 정리할 수 있도록)
        phaseTimers.push(countdownInterval);
    }
    
    // 말 생성 함수
    function generateHorses(serverHorses = null) {
        console.log('말 생성 중...', serverHorses ? '서버 데이터 사용' : '로컬 데이터 생성');
        
        // 기존 말 데이터 초기화
        horses = [];
        
        // 서버에서 말 데이터를 받았으면 사용
        if (serverHorses && Array.isArray(serverHorses) && serverHorses.length > 0) {
            console.log('서버에서 받은 말 데이터 사용:', serverHorses.length, '마리');
            
            horses = serverHorses.map((horse, index) => ({
                id: horse.id || (index + 1),
                name: horse.name || horseNames[index % horseNames.length],
                odds: horse.odds || parseFloat((Math.random() * 8.5 + 1.5).toFixed(1)),
                position: horse.position || 0, // 서버에서 받은 위치 정보 사용
                lane: index,
                finishTime: horse.finishTime || null
            }));
        }
        // 서버에서 말 데이터가 없으면 로컬에서 생성
        else {
            console.log('로컬에서 말 데이터 생성');
            for (let i = 0; i < horseNames.length; i++) {
                // 배당률 랜덤 생성 (1.5~10.0 사이)
                const odds = parseFloat((Math.random() * 8.5 + 1.5).toFixed(1));
                
                horses.push({
                    id: i + 1,
                    name: horseNames[i],
                    odds: odds,
                    position: 0, // 초기 위치
                    lane: i, // 레인 번호
                    finishTime: null // 완주 시간
                });
            }
        }
        
        console.log('생성된 말 데이터:', horses.length, '마리');
        
        // 만약 말이 생성되지 않았다면 기본 데이터로 생성
        if (horses.length === 0) {
            console.warn('말이 생성되지 않아 기본 데이터로 생성합니다.');
            for (let i = 0; i < horseNames.length; i++) {
                const odds = parseFloat((Math.random() * 8.5 + 1.5).toFixed(1));
                horses.push({
                    id: i + 1,
                    name: horseNames[i],
                    odds: odds,
                    position: 0,
                    lane: i,
                    finishTime: null
                });
            }
        }
        
        // 트랙 폭 계산 (말 위치 계산에 필요)
        calculateTrackWidth();
        
        // 말 렌더링
        renderHorses();
        
        // 베팅 패널에 말 옵션 렌더링
        renderHorseOptions();
    }
    
    // 트랙에 말 렌더링
    function renderHorses() {
        console.log('말 렌더링 중...', horses.length, '마리');
        
        // 트랙 요소 확인
        const raceTrack = document.querySelector('.race-track');
        if (!raceTrack) {
            console.error('트랙 요소를 찾을 수 없습니다.');
            return;
        }
        
        // 기존 레인 제거 (결승선 제외)
        const childNodes = Array.from(raceTrack.childNodes);
        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];
            if (node.className !== 'finish-line') {
                raceTrack.removeChild(node);
            }
        }
        
        // 말 배열 유효성 검사
        if (!horses || !Array.isArray(horses) || horses.length === 0) {
            console.error('렌더링할 말 데이터가 없습니다.', horses);
            // 문제가 있다면 기본 말 생성
            generateHorses();
            return;
        }
        
        // 트랙 폭 계산
        calculateTrackWidth();
        
        // 각 말에 대해 레인 생성
        horses.forEach((horse, index) => {
            if (!horse) {
                console.error('유효하지 않은 말 데이터:', horse, 'index:', index);
                return;
            }
            
            console.log(`말 렌더링: ${horse.name}, ID: ${horse.id}, 레인: ${index}, 위치: ${horse.position}`);
            
            // 레인이 정의되지 않은 경우 인덱스로 대체
            if (horse.lane === undefined) {
                horse.lane = index;
            }
            
            const lane = document.createElement('div');
            lane.className = 'race-lane';
            
            // 이미 완주한 말인 경우 레인에 순위 표시
            if (horse.finishTime && gamePhase !== 'betting' && (gamePhase === 'finished' || horse.finishedDisplayed)) {
                // 완주 상태 설정
                horse.finishedDisplayed = true;
                lane.classList.add('finished-lane');
                
                // 순위 정보가 없는 경우 완주 시간으로 계산된 순위 부여
                if (!horse.actualRank) {
                    // 완주 시간 기준으로 임시 순위 계산
                    const finishedHorses = horses.filter(h => h.finishTime && h.finishTime <= horse.finishTime);
                    horse.actualRank = finishedHorses.length;
                }
                
                // 순위에 따른 색상 적용
                if (horse.actualRank === 1) {
                    lane.classList.add('first-rank');
                } else if (horse.actualRank === 2) {
                    lane.classList.add('second-rank');
                } else if (horse.actualRank === 3) {
                    lane.classList.add('third-rank');
                }
                
                // 레인에 결과 표시 (말 이름, 순위, 시간)
                const laneResultElement = document.createElement('div');
                laneResultElement.className = 'lane-result';
                laneResultElement.innerHTML = `
                    <span class="lane-horse-name">${horse.name}</span>
                    <span class="lane-finish-rank">${horse.actualRank}위</span>
                    <span class="lane-finish-time">${horse.finishTime.toFixed(2)}초</span>
                    <span class="lane-horse-odds">${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}배</span>
                `;
                lane.appendChild(laneResultElement);
            }
            
            const laneNumber = document.createElement('span');
            laneNumber.className = 'lane-number';
            laneNumber.textContent = horse.lane + 1;
            
            const horseElement = document.createElement('div');
            horseElement.className = 'horse';
            horseElement.id = `horse-${horse.id}`;
            
            // 베팅 단계에서는 항상 말이 보이도록 설정 (위치 0으로 초기화)
            if (gamePhase === 'betting') {
                horse.position = 0;
                horseElement.style.left = '40px';
                horseElement.style.zIndex = '10';
                // 베팅 단계에서는 완주 상태 초기화하여 시간 및 등수 표시 제거
                horse.finishedDisplayed = false;
            }
            // 준비 단계에서는 초기 위치로 설정
            else if (gamePhase === 'preparing') {
                horse.position = 0;
                horseElement.style.left = '40px';
                horseElement.style.zIndex = '10';
                horse.finishedDisplayed = false;
            }
            // 경기 중인 경우 현재 위치 사용
            else if (gamePhase === 'racing' || gamePhase === 'finished') {
                // 말 위치가 없으면 0으로 초기화
                if (horse.position === undefined || horse.position === null) {
                    horse.position = 0;
                }
                
                // 이미 완주한 말인 경우 완주 스타일 추가 (실제로 결승선을 통과한 말만)
                if (horse.finishedDisplayed) {
                    // 결승선과 겹칠 때는 초록색 효과는 베팅 단계에만 비활성화
                    if (gamePhase !== 'betting') {
                        horseElement.classList.add('finished');
                    }
                    // 말의 앞부분이 결승선에 닿도록 위치 계산
                    const horseIconOffset = 45; // 말 아이콘 위치 (약 45px 정도 떨어진 위치)
                    // 결승선 위치에 고정
                    horseElement.style.left = `${GLOBAL_TRACK_WIDTH - horseIconOffset + 40}px`;
                    // 이름표 위치 조정
                    horseElement.style.transform = 'translateX(0)';
                    // z-index 설정
                    horseElement.style.zIndex = '10';
                    
                    // 이미 완주한 말은 이름과 배당률 숨기기
                    const horseName = horseElement.querySelector('.horse-name');
                    const horseOdds = horseElement.querySelector('.horse-odds');
                    if (horseName) horseName.style.display = 'none';
                    if (horseOdds) horseOdds.style.display = 'none';
                } else {
                    // 초기 위치 설정 (40px는 레인의 왼쪽 여백)
                    horseElement.style.left = `${horse.position + 40}px`;
                    horseElement.style.zIndex = '10';
                }
            }
            
            const icon = document.createElement('span');
            icon.className = 'horse-icon';
            icon.innerHTML = '<i class="fas fa-horse"></i>';
            
            const name = document.createElement('span');
            name.className = 'horse-name';
            name.textContent = horse.name;
            
            const odds = document.createElement('span');
            odds.className = 'horse-odds';
            odds.textContent = `${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}배`;
            
            // 완주 시간 표시 요소 생성
            const finishTime = document.createElement('span');
            finishTime.className = 'horse-finish-time';
            finishTime.id = `finish-time-${horse.id}`;
            finishTime.style.display = 'none'; // 초기에는 숨김 처리
            
            horseElement.appendChild(icon);
            horseElement.appendChild(name);
            horseElement.appendChild(odds);
            horseElement.appendChild(finishTime);
            
            lane.appendChild(laneNumber);
            lane.appendChild(horseElement);
            raceTrack.appendChild(lane);
        });
        
        // 경주 진행 중인 경우 말의 상태 업데이트
        if (gamePhase === 'racing' && !raceAnimationId) {
            // 서버에 현재 상태 요청
            if (socket.connected) {
                socket.emit('get_race_state');
            }
        }
    }
    
    // 베팅 패널에 말 옵션 렌더링
    function renderHorseOptions() {
        console.log('말 옵션 렌더링 중...', horses.length, '마리');
        
        // 호스 리스트 요소 확인
        const horseList = document.getElementById('horse-list');
        if (!horseList) {
            console.error('베팅 패널의 말 목록 요소를 찾을 수 없습니다.');
            return;
        }
        
        // 기존 옵션 제거
        horseList.innerHTML = '';
        
        // 말 배열 유효성 검사
        if (!horses || !Array.isArray(horses) || horses.length === 0) {
            console.error('렌더링할 말 옵션 데이터가 없습니다.', horses);
            return;
        }
        
        // 각 말에 대한 옵션 생성
        horses.forEach(horse => {
            if (!horse) {
                console.error('유효하지 않은 말 데이터:', horse);
                return;
            }
            
            const option = document.createElement('div');
            option.className = 'horse-option';
            option.dataset.id = horse.id;
            
            const name = document.createElement('div');
            name.className = 'horse-option-name';
            name.textContent = horse.name;
            
            const odds = document.createElement('div');
            odds.className = 'horse-option-odds';
            odds.textContent = `${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}x`;
            
            option.appendChild(name);
            option.appendChild(odds);
            
            // 말 선택 이벤트
            option.addEventListener('click', function() {
                console.log('말 선택:', horse.name, 'ID:', horse.id);
                selectHorse(horse);
            });
            
            horseList.appendChild(option);
        });
        
        console.log('말 옵션 렌더링 완료');
    }
    
    // 말 선택 함수
    function selectHorse(horse) {
        console.log('말 선택 함수 실행:', horse.name, 'ID:', horse.id);
        
        if (!horse) {
            console.error('유효하지 않은 말 데이터:', horse);
            return;
        }
        
        // 베팅 유형에 따라 단일 또는 다중 선택
        if (!selectedBetType || selectedBetType === 'single') {
            // 단일 선택 (단승)
            selectedHorse = horse;
            console.log('단일 선택 (단승):', selectedHorse.name);
            
            // UI 업데이트
            const options = document.querySelectorAll('.horse-option');
            options.forEach(opt => {
                if (parseInt(opt.dataset.id) === horse.id) {
                    opt.classList.add('selected');
                } else {
                    opt.classList.remove('selected');
                }
            });
        } else {
            // 다중 선택 (복승, 쌍승, 삼복승, 삼쌍승)
            const maxSelections = selectedBetType === 'trifecta' || selectedBetType === 'trifecta-place' ? 3 : 2;
            
            // 이미 선택된 말인지 확인
            const existingIndex = multiSelectedHorses.findIndex(h => h.id === horse.id);
            
            if (existingIndex !== -1) {
                // 이미 선택된 말이면 선택 해제
                multiSelectedHorses.splice(existingIndex, 1);
                console.log('다중 선택 해제:', horse.name, '남은 선택:', multiSelectedHorses.map(h => h.name).join(', '));
                
                // UI에서 선택 해제
                const opt = document.querySelector(`.horse-option[data-id="${horse.id}"]`);
                if (opt) opt.classList.remove('selected');
            } else if (multiSelectedHorses.length < maxSelections) {
                // 최대 선택 가능 수보다 적게 선택되어 있으면 추가
                multiSelectedHorses.push(horse);
                console.log('다중 선택 추가:', horse.name, '선택된 말들:', multiSelectedHorses.map(h => h.name).join(', '));
                
                // UI에서 선택 표시
                const opt = document.querySelector(`.horse-option[data-id="${horse.id}"]`);
                if (opt) opt.classList.add('selected');
            } else {
                console.log('최대 선택 가능 수에 도달했습니다:', maxSelections);
                showNotification(`최대 ${maxSelections}마리까지 선택 가능합니다.`, 'warning');
            }
            
            // 복합 베팅을 위한 첫 번째 말을 selectedHorse로 설정
            selectedHorse = multiSelectedHorses.length > 0 ? multiSelectedHorses[0] : null;
        }
        
        updateBetInfo();
    }
    
    // 베팅 유형 선택 함수
    function selectBetType(type) {
        selectedBetType = type;
        
        // UI 업데이트
        const options = document.querySelectorAll('.bet-type');
        options.forEach(opt => {
            if (opt.dataset.type === type) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
        
        // 말 선택 초기화
        selectedHorse = null;
        multiSelectedHorses = [];
        
        // 베팅 옵션 UI 초기화
        const horseOptions = document.querySelectorAll('.horse-option');
        horseOptions.forEach(opt => opt.classList.remove('selected'));
        
        // 멀티 선택이 필요한 베팅 유형이면 안내 표시
        if (type === 'quinella' || type === 'trifecta' || type === 'trifecta-place') {
            const maxSelections = type === 'trifecta' || type === 'trifecta-place' ? 3 : 2;
            showNotification(`${maxSelections}마리의 말을 선택해주세요.`, 'info');
        }
    }
    
    // 베팅 정보 업데이트
    function updateBetInfo() {
        const amount = parseInt(betAmountInput.value) || 0;
        
        // 선택된 말 정보 표시
        if (selectedBetType === 'place' || selectedBetType === 'quinella' || selectedBetType === 'trifecta' || selectedBetType === 'trifecta-place') {
            // 다중 선택 베팅
            const selectedNames = multiSelectedHorses.map(h => h.name).join(', ');
            selectedHorseText.textContent = selectedNames || '선택 없음';
        } else {
            // 단일 선택 베팅 (단승)
            selectedHorseText.textContent = selectedHorse ? selectedHorse.name : '선택 없음';
        }
        
        // 베팅 유형 표시
        const betTypeName = getBetTypeName(selectedBetType);
        selectedBetTypeText.textContent = betTypeName || '선택 없음';
        
        // 배당률 계산 및 표시
        let odds = 0;
        if (selectedHorse) {
            odds = selectedHorse.odds;
            
            // 복합 베팅은 배당률 증가
            if (selectedBetType === 'place' && multiSelectedHorses.length === 2) {
                odds = (multiSelectedHorses[0].odds + multiSelectedHorses[1].odds) * 0.7;
            } else if (selectedBetType === 'quinella' && multiSelectedHorses.length === 2) {
                odds = (multiSelectedHorses[0].odds + multiSelectedHorses[1].odds) * 0.8;
            } else if (selectedBetType === 'trifecta-place' && multiSelectedHorses.length === 3) {
                odds = (multiSelectedHorses[0].odds + multiSelectedHorses[1].odds + multiSelectedHorses[2].odds) * 0.6;
            } else if (selectedBetType === 'trifecta' && multiSelectedHorses.length === 3) {
                odds = (multiSelectedHorses[0].odds * multiSelectedHorses[1].odds * multiSelectedHorses[2].odds) * 0.3;
            }
        }
        
        selectedOddsText.textContent = odds ? `${odds.toFixed(1)}x` : '-';
        
        // 예상 수익금 계산
        const potentialWin = odds ? Math.floor(amount * odds) : 0;
        potentialWinText.textContent = potentialWin.toLocaleString() + '원';
        
        // 베팅 버튼 활성화 여부
        const isValidBet = amount > 0 && 
                          selectedBetType && 
                          ((selectedBetType === 'single' && selectedHorse) || 
                           (selectedBetType === 'place' && multiSelectedHorses.length === 2) || 
                           (selectedBetType === 'quinella' && multiSelectedHorses.length === 2) || 
                           (selectedBetType === 'trifecta-place' && multiSelectedHorses.length === 3) || 
                           (selectedBetType === 'trifecta' && multiSelectedHorses.length === 3));
        
        placeBetButton.disabled = !isValidBet || gamePhase !== 'betting';
    }
    
    // 베팅 유형 이름 가져오기
    function getBetTypeName(type) {
        const typeNames = {
            'single': '단승',
            'place': '복승',
            'quinella': '쌍승',
            'trifecta-place': '삼복승',
            'trifecta': '삼쌍승'
        };
        
        return typeNames[type] || '';
    }
    
    // 경주 시작 함수
    function startRace() {
        console.log('경주 시작...');
        
        // 경주 시작 UI로 변경
        showRacingUI();
        
        // 경주 진행 상태 표시기 시작
        if (!progressInterval) {
            localRaceStartTime = Date.now();
            startRaceProgressBar();
        }
        
        // 랜덤 결과 생성
        generateRaceResults();
        
        // 경주 애니메이션 시작
        animateRace();
    }
    
    // 경주 결과 생성
    function generateRaceResults() {
        // 각 말마다 랜덤 속도와 가속도 설정
        horses.forEach(horse => {
            horse.baseSpeed = Math.random() * 3 + 2; // 기본 속도 (2~5)
            horse.acceleration = Math.random() * 0.1 - 0.02; // 가속도 (-0.02~0.08)
            horse.jitter = 0.2; // 무작위성
        });
        
        // 경주 시뮬레이션
        simulateRace();
    }
    
    // 경주 시뮬레이션 함수
    function simulateRace() {
        console.log('경주 시뮬레이션 시작...');
        const totalTime = RACE_TIME; // 총 경주 시간 (초)
        const numFrames = 60 * totalTime; // 총 프레임 수 (60fps)
        const trackWidth = calculateTrackWidth(); // 모든 말이 사용할 트랙 폭 계산
        
        console.log(`트랙 폭: ${trackWidth}px, 총 프레임 수: ${numFrames}`);
        
        // 실시간 순위표 초기화
        initializeRankingBoard();
        
        // 배당률에 따라 말의 완주 시간 결정
        const minTimeToFinish = RACE_TIME * 0.45; // 최소 완주 시간은 레이스 시간의 45% (서버와 일치)
        const maxTimeToFinish = RACE_TIME * 0.85; // 최대 완주 시간은 레이스 시간의 85% (서버와 일치)
        
        // 배당률을 기준으로 말을 정렬 (낮은 배당률 = 빠른 말)
        const sortedHorses = [...horses].sort((a, b) => a.odds - b.odds);
        
        console.log("말 정렬 결과 (배당률 기준):", sortedHorses.map(h => `${h.name} (${h.odds}배)`).join(", "));
        
        // 시간 간격 계산 - 균등한 분배를 위해 전체 가용 시간을 말 수로 나눔
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
        
        // 각 말의 전체 레이스 프레임 데이터 생성
        horses.forEach(horse => {
            // 기존 프레임 배열 초기화
            horse.frames = [];
            
            // 말의 목표 시간이 없으면 배당률 기준으로 설정 (예외 처리)
            if (!horse.targetFinishTime) {
                const oddsRatio = (horse.odds - 1.5) / 8.5; // 1.5~10.0 배당률 정규화
                horse.targetFinishTime = minTimeToFinish + (oddsRatio * (maxTimeToFinish - minTimeToFinish));
                console.warn(`말 '${horse.name}'의 목표 시간 누락, 배당률 기반으로 설정: ${horse.targetFinishTime.toFixed(2)}초`);
            }
            
            // 프레임 배열 생성 (각 프레임마다 말의 x 위치값)
            for (let frame = 0; frame <= numFrames; frame++) {
                // 현재 프레임의 게임 경과 시간 (초)
                const gameTime = frame / 60;
                
                // 말의 목표 완주 시간을 기준으로 진행률 계산 (0~1)
                const progress = Math.min(1.0, gameTime / horse.targetFinishTime);
                
                // 베지어 곡선 적용하여 자연스러운 가속/감속 효과
                const position = calculateBezierCurve(progress) * trackWidth;
                
                // 프레임 저장
                horse.frames.push(position);
            }
            
            // 프레임 데이터 유효성 검사 및 보정
            for (let i = 1; i < horse.frames.length; i++) {
                // 이전 프레임보다 뒤로 가지 않도록 보정
                if (horse.frames[i] < horse.frames[i-1]) {
                    horse.frames[i] = horse.frames[i-1];
                }
                
                // 최대 트랙 폭을 넘지 않도록 보정
                if (horse.frames[i] > trackWidth) {
                    horse.frames[i] = trackWidth;
                }
            }
            
            // 목표 완주 시간을 finishTime으로 설정 (완주 처리용)
            horse.finishTime = horse.targetFinishTime;
            
            // 진행 상태 초기화
            horse.position = 0;
            horse.finishedDisplayed = false;
            horse.actualRank = null;
            
            console.log(`말 '${horse.name}' 프레임 데이터 생성 완료: ${horse.frames.length}개 프레임, 목표 시간: ${horse.targetFinishTime.toFixed(2)}초`);
        });
        
        // 완주 시간 기준으로 등수 매기기
        raceResults = [...horses].sort((a, b) => a.targetFinishTime - b.targetFinishTime);
        
        // 결과에 순위 정보 추가
        raceResults.forEach((horse, index) => {
            horse.rank = index + 1;
        });
        
        console.log('경주 시뮬레이션 완료, 결과:', raceResults.map(h => `${h.name}: ${h.targetFinishTime.toFixed(2)}초 (${h.rank}위)`).join(', '));
        
        // 초기화
        finishedHorseCount = 0;
    }
    
    // 베지어 곡선 계산 헬퍼 함수 (부드러운 가속/감속 효과)
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
    
    // 실시간 순위표 초기화
    function initializeRankingBoard() {
        // 순위표 컨테이너가 없으면 생성
        let rankingBoard = document.getElementById('ranking-board');
        if (!rankingBoard) {
            rankingBoard = document.createElement('div');
            rankingBoard.id = 'ranking-board';
            rankingBoard.className = 'ranking-board';
            document.querySelector('.race-track').appendChild(rankingBoard);
                } else {
            rankingBoard.innerHTML = '';
        }
        
        // 순위표 제목
        const title = document.createElement('div');
        title.className = 'ranking-title';
        title.textContent = '실시간 순위';
        rankingBoard.appendChild(title);
        
        // 순위 목록
        const rankingList = document.createElement('ul');
        rankingList.className = 'ranking-list';
        rankingList.id = 'ranking-list';
        rankingBoard.appendChild(rankingList);
    }
    
    // 경주 애니메이션 함수
    function animateRace(startFrame = 0) {
        console.log('레이스 애니메이션 시작, 시작 프레임:', startFrame);
        
        // 애니메이션 프레임 변수
        let frameIndex = startFrame;
        const totalFrames = RACE_TIME * 60; // 60fps에서 총 프레임 수
        let lastPositionUpdateTime = Date.now();
        const positionUpdateInterval = 200; // 200ms마다 위치 정보 업데이트
        
        // 이전 애니메이션 정리
        if (raceAnimationId) {
            cancelAnimationFrame(raceAnimationId);
        }
        
        // 이미 거의 끝에 가까운 프레임이면 바로 결과 표시
        if (startFrame > totalFrames * 0.95) {
            console.log('레이스가 거의 종료되었습니다. 결과 표시.');
            finishRace();
            return;
        }
        
        // 진행 상태 바 시작 또는 업데이트
        if (!progressInterval) {
            // 시작 프레임이 0이 아니면 (이미 진행 중인 레이스) 경과 시간 반영
            const elapsedMsForProgress = startFrame > 0 ? (startFrame / 60) * 1000 : 0;
            startRaceProgressBar(elapsedMsForProgress);
        }
        
        // 새로고침 여부 확인 (시작 프레임이 0이 아니면 새로고침으로 간주)
        const isRefreshed = startFrame > 0;

        // 새로고침 후 렌더링 최적화를 위한 위치 초기 설정
        if (isRefreshed) {
            console.log('새로고침 후 애니메이션 재개, 현재 프레임으로 말 위치 즉시 업데이트');
            
            // 서버에서 받은 프레임 데이터가 있는지 확인
            const hasServerFrameData = horsesFrameData && Object.keys(horsesFrameData).length > 0;
            
            // 서버 데이터 로그
            if (hasServerFrameData) {
                console.log('서버에서 받은 프레임 데이터 사용, 항목 수:', Object.keys(horsesFrameData).length);
            } else {
                console.warn('서버에서 받은 프레임 데이터가 없음');
            }
            
            // 즉시 말 위치 업데이트 (트랜지션 없이)
            horses.forEach(horse => {
                updateHorsePosition(horse, frameIndex, true);
            });
            
            // 레이싱 UI가 제대로 표시되었는지 확인
            showRacingUI();
        } else {
            // 새 경기 시작 시 모든 말의 위치를 초기화
            horses.forEach(horse => {
                // 위치 초기화
                horse.position = 0;
                horse.finishedDisplayed = false;
                horse.finishTime = null;
                horse.actualRank = null;
                
                // DOM 요소 업데이트
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (horseElement) {
                    horseElement.style.left = '40px';
                    horseElement.style.removeProperty('transform');
                    horseElement.classList.remove('finished', 'near-finish');
                    
                    // 이름과 배당률 표시 복원
                    const horseName = horseElement.querySelector('.horse-name');
                    const horseOdds = horseElement.querySelector('.horse-odds');
                    if (horseName) horseName.style.display = '';
                    if (horseOdds) horseOdds.style.display = '';
                }
            });
            
            // 초기 프레임 인덱스 강제 설정
            frameIndex = 0;
        }
        
        // 애니메이션 프레임 함수
        function animate() {
            // 현재 프레임 계산 - 로컬 타이머 모드인지 확인
            let currentFrameIndex;
            
            if (localTimerMode) {
                // 로컬 타이머 모드 - 새로고침 후 진행 (서버 시간과 독립적)
                const elapsedMs = Date.now() - localTimerStart;
                currentFrameIndex = startFrame + Math.floor(elapsedMs / (1000 / 60));
            } else {
                // 서버 시간 기준 모드
                const currentServerTime = getServerTime();
                const elapsedMs = Math.max(0, currentServerTime - raceStartTime);
                currentFrameIndex = Math.floor(elapsedMs / (1000 / 60)); // 60fps로 변환
            }
            
            // 프레임 인덱스가 유효한지 확인하고 보정
            if (currentFrameIndex < 0) {
                console.warn('음수 프레임 인덱스 감지:', currentFrameIndex, '0으로 보정');
                frameIndex = 0;
            } else if (currentFrameIndex >= totalFrames) {
                // 레이스 종료 확인
                console.log('레이스 종료 프레임에 도달, 마무리 단계 시작');
                
                // 모든 말이 완주했는지 확인
                const allHorsesFinished = horses.every(horse => horse.finishedDisplayed);
                
                if (allHorsesFinished) {
                    // 모든 말이 완주했으면 애니메이션 종료 및 결과 표시
                    console.log('모든 말이 완주, 애니메이션 종료');
                    cancelAnimationFrame(raceAnimationId);
                    finishRace();
                    return;
                } else {
                    // 아직 완주하지 않은 말이 있으면 자연스럽게 이동 계속
                    // 총 프레임을 초과해도 약간의 여유를 두고 계속 진행 (최대 10초 추가)
                    const maxExtraFrames = 10 * 60; // 10초, 60fps
                    
                    // 추가 프레임을 초과했는지 확인
                    if (currentFrameIndex > totalFrames + maxExtraFrames) {
                        // 추가 시간도 초과했으면 레이스 마무리
                        console.log('추가 시간 초과, 남은 말도 강제 완주 처리');
                        
                        // 완주하지 않은 말들을 강제로 결승선으로 이동
                        const unfinishedHorses = horses.filter(horse => !horse.finishedDisplayed);
                        unfinishedHorses.forEach(horse => {
                            // 현재 위치 저장
                            const lastPosition = horse.position || 0;
                            // 서버 위치 정보 업데이트 (결승선 직전으로)
                            horse.serverPosition = GLOBAL_TRACK_WIDTH - 50;
                            
                            // 한 번에 너무 많이 이동하지 않도록 점진적 이동
                            const distanceToFinish = horse.serverPosition - lastPosition;
                            if (distanceToFinish > 100) {
                                // 긴 거리를 이동해야 하면 중간 지점으로 먼저 이동
                                horse.serverPosition = lastPosition + (distanceToFinish * 0.6);
                            }
                        });
                    }
                }
            } else {
                frameIndex = currentFrameIndex;
            }
            
            // 각 말 위치 업데이트
            horses.forEach(horse => {
                // 이미 완주한 말은 건너뛰기
                if (horse.finishedDisplayed) return;
                
                // 말 위치 업데이트 함수 호출
                updateHorsePosition(horse, frameIndex, false);
            });
            
            // 다음 프레임 요청
            raceAnimationId = requestAnimationFrame(animate);
            
            // 순위표 업데이트 (더 자주)
            updateRankingBoard();
        }
        
        // 애니메이션 시작
        raceAnimationId = requestAnimationFrame(animate);
        
        return raceAnimationId; // 애니메이션 ID 반환
    }
    
    // 실시간 순위표 업데이트
    function updateRankingBoard() {
        const rankingList = document.getElementById('ranking-list');
        if (!rankingList) return;
        
        // 순위표 비우기
        rankingList.innerHTML = '';
        
        // 현재 위치 기준으로 말들 정렬
        const currentPositions = horses.map(horse => ({
            id: horse.id,
            name: horse.name,
            position: horse.position,
            finishTime: horse.finishTime,
            rank: horse.actualRank || 0
        })).sort((a, b) => {
            // 이미 완주한 말은 완주 순위 기준으로 정렬
            if (a.finishTime && b.finishTime) {
                return a.rank - b.rank;
            }
            // 완주한 말이 앞으로
            if (a.finishTime) return -1;
            if (b.finishTime) return 1;
            // 나머지는 현재 위치 기준으로 정렬 (더 앞에 있는 말이 앞으로)
            return b.position - a.position;
        });
        
        // 순위 목록 생성
        currentPositions.forEach((horse, index) => {
            const rankItem = document.createElement('li');
            rankItem.className = 'ranking-item';
            
            // 완주한 말은 등수 표시, 아직 달리고 있는 말은 현재 순위 표시
            const rankText = horse.finishTime ? `${horse.rank}위` : `${index + 1}`;
            
            // 완주한 말은 특별 스타일 적용
            if (horse.finishTime) {
                rankItem.classList.add('finished-rank');
            }
            
            rankItem.innerHTML = `
                <span class="rank-number">${rankText}</span>
                <span class="rank-name">${horse.name}</span>
                <span class="rank-time">${horse.finishTime ? horse.finishTime.toFixed(2) + '초' : ''}</span>
            `;
            
            rankingList.appendChild(rankItem);
        });
    }
    
    // 경주 종료 및 결과 표시
    function finishRace() {
        // 경기 결과 패널 표시
        resultPanel.style.display = 'block';
        
        // 경주 진행 상태 표시기에 완료 표시
        raceProgressText.textContent = '경기 종료!';
        raceProgressBar.style.width = '100%';
        raceProgressPercentage.textContent = '100%';
        
        // 진행 표시기 타이머 중지 (5초 후 숨김)
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        // 5초 후 진행 표시기 숨김
        setTimeout(() => {
            hideRaceProgressBar();
        }, 5000);
        
        // 아직 완주하지 않은 말들 처리
        const unfinishedHorses = horses.filter(horse => !horse.finishedDisplayed);
        
        if (unfinishedHorses.length > 0) {
            console.log(`레이스 종료 시점에 완주하지 않은 말: ${unfinishedHorses.length}마리`);
            
            // 아직 완주하지 않은 말들은 순차적으로 결승선까지 이동 (지연 시간 적용)
            unfinishedHorses.forEach((horse, index) => {
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (!horseElement) return;
                
                // 배당률이 낮은 말이 먼저 도착하도록 정렬 기준 설정
                const delayBase = index * 400; // 각 말마다 400ms 간격으로 도착
                
                // 말의 현재 위치에 따라 추가 지연 설정 (이미 진행된 말이 더 빨리 도착)
                const currentPos = horse.position || 0;
                const progressRatio = Math.min(1, currentPos / GLOBAL_TRACK_WIDTH);
                const progressDelay = (1 - progressRatio) * 1000; // 진행률이 낮을수록 더 지연
                
                // 최종 지연 시간 (정렬 인덱스 + 진행률 기반)
                const delay = delayBase + progressDelay;
                
                // 지연 후 이동 시작
                setTimeout(() => {
                    // 현재 위치와 목표 위치 (결승선) 사이 거리 계산
                    const targetPosition = GLOBAL_TRACK_WIDTH - 45; // 말 아이콘 오프셋 고려
                    const distanceToFinish = targetPosition - currentPos;
                    
                    // 거리가 클수록 더 빠르게 이동 (자연스러운 가속)
                    const animationDuration = Math.min(2.5, Math.max(0.8, distanceToFinish / 250));
                    
                    // 트랜지션 설정으로 자연스러운 이동
                    horseElement.style.transition = `left ${animationDuration}s ease-out`;
                    
                    // 완주 위치로 이동
                    const finalPosition = `${targetPosition + 40}px`; // 40px는 레인 좌측 여백
                    horseElement.style.left = finalPosition;
                    
                    // 위치 정보 업데이트
                    horse.position = targetPosition;
                    
                    // 애니메이션 후 완주 처리 (트랜지션 시간 대기 후)
                    setTimeout(() => {
                        // 완주 시간 계산 (레이스 총 시간의 85~95% 범위에서 설정)
                        if (!horse.finishTime) {
                            // 인덱스에 따라 완주 시간 차등 부여 (나중에 도착한 말일수록 더 늦은 시간)
                            const baseTime = RACE_TIME * 0.85;
                            const maxFinishTime = RACE_TIME * 0.95;
                            const timeRange = maxFinishTime - baseTime;
                            const finishTime = baseTime + (index / Math.max(1, unfinishedHorses.length - 1)) * timeRange;
                            
                            horse.finishTime = finishTime;
                        }
                        
                        // 완주 처리
                        horse.finishedDisplayed = true;
                        
                        // 순위 계산 (먼저 완주한 말 수 + 1)
                        const finishedHorseCount = horses.filter(h => h.finishedDisplayed).length;
                        horse.actualRank = finishedHorseCount;
                        
                        // 완주 시 UI 업데이트
                        // z-index 조정
                        horseElement.style.zIndex = '10';
                        
                        // 이름과 배당률 숨기기
                        const horseName = horseElement.querySelector('.horse-name');
                        const horseOdds = horseElement.querySelector('.horse-odds');
                        if (horseName) horseName.style.display = 'none';
                        if (horseOdds) horseOdds.style.display = 'none';
                        
                        // 레인에 완주 정보 표시
                        const raceLane = horseElement.parentElement;
                        if (raceLane) {
                            // 완주한 레인 스타일 적용
                            raceLane.classList.add('finished-lane');
                            
                            // 순위에 따른 색상 적용
                            if (horse.actualRank <= 3) {
                                raceLane.classList.add(`${['first', 'second', 'third'][horse.actualRank - 1]}-rank`);
                            }
                            
                            // 레인에 결과 표시
                            if (!raceLane.querySelector('.lane-result')) {
                                const laneResultElement = document.createElement('div');
                                laneResultElement.className = 'lane-result';
                                laneResultElement.innerHTML = `
                                    <span class="lane-horse-name">${horse.name}</span>
                                    <span class="lane-finish-rank">${horse.actualRank}위</span>
                                    <span class="lane-finish-time">${horse.finishTime.toFixed(2)}초</span>
                                    <span class="lane-horse-odds">${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}배</span>
                                `;
                                raceLane.appendChild(laneResultElement);
                            }
                        }
                        
                        // 서버에 완주 정보 전송
                        if (socket.connected) {
                            socket.emit('update_horse_position', {
                                horseId: horse.id,
                                position: horse.position,
                                finishTime: horse.finishTime,
                                rank: horse.actualRank
                            });
                        }
                        
                        // 순위표 업데이트
                        updateRankingBoard();
                    }, animationDuration * 1000 + 100);
                }, delay);
            });
        }
        
        // 최종 말 위치 정보를 서버에 전송
        if (socket.connected) {
            horses.forEach(horse => {
                socket.emit('update_horse_position', {
                    horseId: horse.id,
                    position: horse.position
                });
            });
            console.log('최종 말 위치 정보 서버에 전송 완료');
        }
        
        // 경기 결과 목록 생성
        resultList.innerHTML = '';
        
        // 순위에 따라 결과 정렬
        raceResults = [...horses].sort((a, b) => {
            // 실제 등수 정보가 있으면 등수 기준으로 정렬
            if (a.actualRank && b.actualRank) {
                return a.actualRank - b.actualRank;
            } 
            // 완주 시간 기준으로 정렬
            return (a.finishTime || Infinity) - (b.finishTime || Infinity);
        });
        
        // 완주 시간 최대값 제한
        const maxTimeToFinish = RACE_TIME * 0.9; // 최대 54초
        raceResults.forEach(horse => {
            if (horse.finishTime) {
                horse.finishTime = Math.min(horse.finishTime, maxTimeToFinish);
            }
        });
        
        // 결과 업데이트 시간 지연 (모든 말이 완주할 시간 확보)
        const resultUpdateDelay = unfinishedHorses.length > 0 ? 3000 : 0;
        
        setTimeout(() => {
            raceResults.forEach((horse, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'result-item';
                
                const rank = document.createElement('span');
                rank.className = 'result-rank';
                rank.textContent = `${index + 1}`;
                
                const name = document.createElement('span');
                name.className = 'result-name';
                name.textContent = horse.name;
                
                const time = document.createElement('span');
                time.className = 'result-time';
                time.textContent = `${horse.finishTime.toFixed(2)}초`;
                
                listItem.appendChild(rank);
                listItem.appendChild(name);
                listItem.appendChild(time);
                
                resultList.appendChild(listItem);
                
                // 1등 말에 애니메이션 효과
                if (index === 0) {
                    const winnerHorse = document.getElementById(`horse-${horse.id}`);
                    if (winnerHorse) {
                        winnerHorse.style.animation = 'winner 1s infinite';
                    }
                }
            });
            
            // 베팅 결과 확인 및 정산
            checkBettingResults();
        }, resultUpdateDelay);
    }
    
    // 로컬 스토리지에서 사용자 정보 불러오기
    function loadUserInfo() {
        try {
            // 로컬 스토리지에서 사용자 정보 가져오기 (두 가지 키로 시도)
            let userData = localStorage.getItem('userInfo') || localStorage.getItem('user');
            
            if (!userData) {
                console.log('로그인 정보가 없습니다. 로그인 페이지로 이동합니다.');
                alert('로그인이 필요합니다.');
                window.location.href = '/login.html';
                return false;
            }
            
            // 데이터 파싱
            currentUser = JSON.parse(userData);
            
            // 사용자 정보가 유효한지 확인
            if (!currentUser || !currentUser.username) {
                console.error('로그인 정보가 유효하지 않습니다.');
                alert('로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.');
                window.location.href = '/login.html';
                return false;
            }
            
            console.log('사용자 정보 로드 완료:', currentUser.username);
            
            // 소켓 연결이 되어 있으면 사용자 인증
            authenticateUser();
            
            // 사용자 정보 UI 업데이트
            updateUserInfoUI();
            
            return true;
        } catch (e) {
            console.error('저장된 사용자 정보 파싱 오류:', e);
            alert('로그인 정보에 문제가 있습니다. 다시 로그인해 주세요.');
            window.location.href = '/login.html';
            return false;
        }
    }

    // 사용자 인증 함수
    function authenticateUser() {
        if (!socket || !socket.connected || !currentUser) return;
        
        console.log('소켓 사용자 인증 시작...');
        
        // 인증 요청 보내기
        socket.emit('authenticate', {
            userId: currentUser.id,
            username: currentUser.username,
            token: currentUser.token || '' // 토큰이 있으면 함께 전송
        });
    }

    // 사용자 정보 UI 업데이트
    function updateUserInfoUI() {
        if (!currentUser) return;
        
        // 이름 표시
        userNameElement.textContent = currentUser.username;
        
        // 잔액 표시
        let balanceStr = '';
        if (typeof currentUser.balance === 'number') {
            balanceStr = currentUser.balance.toLocaleString() + ' 원';
        } else {
            balanceStr = '0 원';
        }
        userBalanceElement.textContent = balanceStr;
        
        console.log('사용자 정보 UI 업데이트:', currentUser.username, balanceStr);
    }

    // 사용자 잔액 업데이트
    function updateUserBalance(balance) {
        if (!currentUser) return;
        
        // 잔액이 숫자가 아니면 변환
        if (typeof balance !== 'number') {
            balance = parseInt(balance) || 0;
        }
        
        // 최소값은 0
        balance = Math.max(0, balance);
        
        // 이전 잔액과 새 잔액 로깅
        console.log(`사용자 잔액 업데이트: ${currentUser.balance} → ${balance}`);
        
        // 사용자 객체 업데이트
        currentUser.balance = balance;
        
        // 로컬 스토리지 업데이트
        try {
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            // userInfo 키가 있으면 함께 업데이트
            if (localStorage.getItem('userInfo')) {
                localStorage.setItem('userInfo', JSON.stringify(currentUser));
            }
        } catch (e) {
            console.error('사용자 정보 저장 오류:', e);
        }
        
        // UI 업데이트
        userBalanceElement.textContent = balance.toLocaleString() + ' 원';
    }

    // 사용자 정보 새로고침 요청
    function refreshUserInfo() {
        if (!socket || !socket.connected || !currentUser) return;
        
        socket.emit('refresh_user_info');
        console.log('사용자 정보 새로고침 요청됨');
    }
    
    // 베팅 단계 UI 표시
    function showBettingUI() {
        console.log('베팅 UI 표시');
        
        // 게임 단계 텍스트 업데이트
        raceStatusText.textContent = '베팅 시간';
        raceStatusText.className = 'betting-phase';
        
        // 베팅 패널 표시
        document.querySelector('.betting-panel').style.display = 'flex';
        // 결과 패널 숨기기
        resultPanel.style.display = 'none';
        // 현재 베팅 패널 표시
        document.getElementById('current-bets-panel').style.display = 'block';
        // 베팅 버튼 활성화
        placeBetButton.disabled = false;
        
        // 진행 상태 업데이트
        hideRaceProgressBar();
        
        // 경기 단계에 따른 클래스 설정
        document.body.classList.remove('race-phase-racing', 'race-phase-preparing');
        document.body.classList.add('race-phase-betting');
        
        // 말들의 완주 상태 초기화 (베팅 단계에서는 시간과 등수 표시 제거)
        horses.forEach(horse => {
            horse.finishedDisplayed = false;
            // 완주 시간 표시 숨기기
            const finishTimeElement = document.getElementById(`finish-time-${horse.id}`);
            if (finishTimeElement) {
                finishTimeElement.style.display = 'none';
            }
        });
    }
    
    // 경주 단계 UI 표시
    function showRacingUI() {
        console.log('레이싱 UI 표시');
        
        // 게임 단계 텍스트 업데이트
        raceStatusText.textContent = '경기 진행 중';
        raceStatusText.className = 'racing-phase';
        
        // 베팅 패널 숨기기
        document.querySelector('.betting-panel').style.display = 'none';
        // 결과 패널 숨기기
        resultPanel.style.display = 'none';
        // 현재 베팅 패널 표시
        document.getElementById('current-bets-panel').style.display = 'block';
        // 베팅 버튼 비활성화
        placeBetButton.disabled = true;
        
        // 경기 단계에 따른 클래스 설정
        document.body.classList.remove('race-phase-betting', 'race-phase-preparing');
        document.body.classList.add('race-phase-racing');
        
        // 이미 결승선을 통과한 말에 대해서는 완주 시간 및 등수 표시 업데이트
        horses.forEach(horse => {
            if (horse.finishedDisplayed && horse.finishTime && horse.actualRank) {
                const finishTimeElement = document.getElementById(`finish-time-${horse.id}`);
                if (finishTimeElement) {
                    finishTimeElement.textContent = `${horse.finishTime.toFixed(2)}초 (${horse.actualRank}위)`;
                    finishTimeElement.style.display = 'inline-block';
                }
            }
        });
    }
    
    // 준비 단계 UI 표시
    function showPreparingUI() {
        console.log('준비 단계 UI 표시');
        
        // 게임 단계 텍스트 업데이트
        raceStatusText.textContent = '경기 준비 중';
        raceStatusText.className = 'preparing-phase';
        
        // 베팅 패널 숨기기
        document.querySelector('.betting-panel').style.display = 'none';
        // 결과 패널 숨기기
        resultPanel.style.display = 'none';
        // 현재 베팅 패널 표시
        document.getElementById('current-bets-panel').style.display = 'block';
        // 베팅 버튼 비활성화
        placeBetButton.disabled = true;
        
        // 진행 표시기 업데이트
        showRaceProgressBar();
        raceProgressText.textContent = '경기 준비 중...';
        
        // 경기 단계에 따른 클래스 설정
        document.body.classList.remove('race-phase-betting', 'race-phase-racing');
        document.body.classList.add('race-phase-preparing');
    }
    
    // 베팅 확정 함수
    function placeBet() {
        // 이미 베팅 진행 중이면 중복 실행 방지
        if (isBettingInProgress) {
            console.log('베팅 처리 중입니다. 중복 요청 방지.');
            return;
        }
        
        // 로그인 상태 확인
        if (!currentUser || !currentUser.id || currentUser.isGuest) {
            showNotification('베팅하려면 로그인이 필요합니다.', 'error');
            return;
        }
        
        // 게임 단계 확인
        if (gamePhase !== 'betting') {
            showNotification('현재 베팅 시간이 아닙니다.', 'warning');
            return;
        }
        
        // 단순 베팅인지 멀티 선택 베팅인지 확인
        let selectedHorseIds = [];
        
        // 선택된 베팅 유형에 따라 말 선택 확인
        if (selectedBetType === 'single') {
            // 단일 선택 베팅
            if (!selectedHorse) {
                showNotification('베팅할 말을 선택해주세요.', 'warning');
                return;
            }
            selectedHorseIds = [selectedHorse.id];
        } else if (selectedBetType === 'place') {
            // 복승 베팅: 단일 말 선택이 아닌 다중 선택으로 변경
            if (!multiSelectedHorses || multiSelectedHorses.length === 0) {
                showNotification('베팅할 말을 선택해주세요.', 'warning');
                return;
            }
            
            if (multiSelectedHorses.length !== 2) {
                showNotification('복승 베팅에는 2마리의 말을 선택해야 합니다.', 'warning');
                return;
            }
            
            // 말 ID 배열 생성
            selectedHorseIds = multiSelectedHorses.map(horse => horse.id);
        } else {
            // 기타 멀티 선택 베팅 (쌍승, 삼복승, 삼쌍승)
            if (!multiSelectedHorses || multiSelectedHorses.length === 0) {
                showNotification('베팅할 말을 선택해주세요.', 'warning');
                return;
            }
            
            // 베팅 유형별 필요한, 말 선택 수 확인
            const requiredHorseCount = {
                'quinella': 2,      // 쌍승식 - 2마리
                'trifecta-place': 3, // 삼복승식 - 3마리
                'trifecta': 3       // 삼쌍승식 - 3마리
            };
            
            const required = requiredHorseCount[selectedBetType] || 1;
            
            if (multiSelectedHorses.length !== required) {
                showNotification(`${getBetTypeName(selectedBetType)} 베팅에는 ${required}마리의 말을 선택해야 합니다.`, 'warning');
                return;
            }
            
            // 말 ID 배열 생성
            selectedHorseIds = multiSelectedHorses.map(horse => horse.id);
        }
        
        // 베팅 금액 확인
        const amount = parseInt(betAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
            showNotification('유효한 베팅 금액을 입력해주세요.', 'warning');
            return;
        }
        
        // 최소 베팅 금액 체크
        if (amount < 100) {
            showNotification('최소 베팅 금액은 100원입니다.', 'warning');
            return;
        }
        
        // 최대 베팅 금액 체크
        if (amount > 1000000) {
            showNotification('최대 베팅 금액은 1,000,000원입니다.', 'warning');
            return;
        }
        
        // 잔액 확인
        if (amount > currentUser.balance) {
            showNotification('잔액이 부족합니다.', 'error');
            return;
        }
        
        // 중복 베팅 확인 (클라이언트 측에서 동일한 베팅 정보가 있는지 확인)
        const isSameBetExists = currentBets.some(bet => {
            // 같은 베팅 유형인지 확인
            const isSameType = bet.type === selectedBetType || bet.betType === selectedBetType;
            
            // 같은 말을 선택했는지 확인
            let isSameHorses = false;
            if (selectedBetType === 'single' || selectedBetType === 'place') {
                // 단일 베팅 비교
                isSameHorses = bet.horses && bet.horses.length === 1 && 
                              bet.horses[0].id === selectedHorseIds[0];
            } else {
                // 다중 베팅 비교 (순서 무관)
                const betHorseIds = bet.horses ? bet.horses.map(h => h.id).sort() : [];
                const currentHorseIds = [...selectedHorseIds].sort();
                isSameHorses = JSON.stringify(betHorseIds) === JSON.stringify(currentHorseIds);
            }
            
            return isSameType && isSameHorses;
        });
        
        if (isSameBetExists) {
            showNotification('이미 동일한 유형으로 해당 말에 베팅했습니다.', 'warning');
            return;
        }
        
        // 진행 중 플래그 설정
        isBettingInProgress = true;
        
        // 베팅 정보 생성
        const betData = {
            betType: selectedBetType,
            horseIds: selectedHorseIds,
            amount: amount
        };
        
        // 베팅 버튼 비활성화 (중복 베팅 방지)
        placeBetButton.disabled = true;
        
        console.log('베팅 데이터 전송:', betData);
        
        // 소켓으로 베팅 요청 전송
        socket.emit('horse_racing_bet', betData);
        
        // 추가적인 베팅 정보 저장 (클라이언트 측)
        const clientBetInfo = {
            type: selectedBetType,
            amount: amount,
            timestamp: Date.now(),
            horses: selectedBetType === 'single' || selectedBetType === 'place' ? 
                    (selectedBetType === 'single' ? [selectedHorse] : multiSelectedHorses) : 
                    multiSelectedHorses,
            odds: parseFloat(selectedOddsText.textContent.replace('x', '')) || 
                  (selectedHorse ? selectedHorse.odds : 0),
            potentialWin: parseInt(potentialWinText.textContent.replace(/,/g, '').replace('원', '')) || 0,
            status: 'pending'
        };
        
        // 현재 베팅 목록에 임시 추가
        currentBets.push(clientBetInfo);
        
        // 베팅 내역 UI 업데이트
        updateBetsUI();
        
        // 5초 후에 베팅 처리 플래그 초기화 (안전장치)
        setTimeout(() => {
            isBettingInProgress = false;
        }, 5000);
        
        // 참고: 실제 베팅 성공/실패는 bet_response 이벤트에서 처리됨
    }
    
    // 베팅 폼 초기화
    function resetBettingForm() {
        selectedHorse = null;
        selectedBetType = null;
        multiSelectedHorses = [];
        betAmountInput.value = '';
        
        // UI 초기화
        const horseOptions = document.querySelectorAll('.horse-option');
        horseOptions.forEach(opt => opt.classList.remove('selected'));
        
        const betTypeOptions = document.querySelectorAll('.bet-type');
        betTypeOptions.forEach(opt => opt.classList.remove('selected'));
        
        // 베팅 정보 표시 초기화
        selectedHorseText.textContent = '선택 없음';
        selectedBetTypeText.textContent = '선택 없음';
        selectedOddsText.textContent = '-';
        potentialWinText.textContent = '0원';
        
        // 베팅 버튼 비활성화
        placeBetButton.disabled = true;
    }
    
    // 베팅 내역 UI 업데이트
    function updateBetsUI() {
        const betsList = document.getElementById('bets-list');
        
        // 베팅 목록 초기화
        betsList.innerHTML = '';
        
        // 현재 베팅 패널 표시 여부 설정
        const betsPanel = document.getElementById('current-bets-panel');
        if (currentBets && currentBets.length > 0) {
            betsPanel.style.display = 'block';
        } else {
            betsPanel.style.display = 'none';
            return;
        }
        
        // 각 베팅 내역 아이템 추가
        currentBets.forEach(bet => {
            const listItem = document.createElement('li');
            listItem.className = 'bet-item';
            
            // 베팅 상태에 따른 클래스 추가
            if (bet.status === 'win') {
                listItem.classList.add('bet-win');
            } else if (bet.status === 'lose') {
                listItem.classList.add('bet-lose');
            } else if (bet.status === 'pending') {
                listItem.classList.add('bet-pending');
            }
            
            // 베팅 유형
            const betType = document.createElement('div');
            betType.className = 'bet-type';
            betType.textContent = getBetTypeName(bet.type || bet.betType);
            
            // 베팅 말 정보
            const betHorses = document.createElement('div');
            betHorses.className = 'bet-horses';
            
            // 말 목록 생성
            const horses = bet.horses || [];
            const horseNames = horses.map(horse => horse.name).join(', ');
            betHorses.textContent = horseNames || '정보 없음';
            
            // 베팅 금액
            const betAmount = document.createElement('div');
            betAmount.className = 'bet-amount';
            betAmount.textContent = (bet.amount || 0).toLocaleString() + '원';
            
            // 예상 수익금
            const potentialWin = document.createElement('div');
            potentialWin.className = 'potential-win';
            
            // 예상 수익금 계산 (potential_win 또는 potentialWin 속성 사용)
            const winAmount = bet.potential_win || bet.potentialWin || 0;
            potentialWin.textContent = winAmount.toLocaleString() + '원';
            
            // 상태 표시
            const betStatus = document.createElement('div');
            betStatus.className = 'bet-status';
            
            // 상태에 따른 텍스트 설정
            if (bet.status === 'win') {
                betStatus.textContent = '승리';
                betStatus.classList.add('win');
                
                // 승리 금액 표시
                if (bet.winAmount) {
                    potentialWin.textContent = bet.winAmount.toLocaleString() + '원 획득!';
                    potentialWin.classList.add('win-amount');
                }
            } else if (bet.status === 'lose') {
                betStatus.textContent = '패배';
                betStatus.classList.add('lose');
            } else {
                betStatus.textContent = '진행 중';
                betStatus.classList.add('pending');
                
                // 현재 단계가 베팅 단계이고 서버 베팅 ID가 있으면 취소 버튼 추가
                if (gamePhase === 'betting' && bet.id) {
                    const cancelButton = document.createElement('button');
                    cancelButton.className = 'cancel-bet-btn';
                    cancelButton.textContent = '취소';
                    cancelButton.onclick = function() {
                        cancelBet(bet.id);
                    };
                    betStatus.appendChild(cancelButton);
                }
            }
            
            // 항목에 추가
            listItem.appendChild(betType);
            listItem.appendChild(betHorses);
            listItem.appendChild(betAmount);
            listItem.appendChild(potentialWin);
            listItem.appendChild(betStatus);
            
            // 목록에 추가
            betsList.appendChild(listItem);
        });
    }
    
    // 베팅 결과 확인 및 정산
    function checkBettingResults() {
        if (currentBets.length === 0 || raceResults.length === 0) return;
        
        let totalWinnings = 0;
        
        // 각 베팅에 대해 결과 확인
        currentBets.forEach(bet => {
            let isWin = false;
            let winAmount = 0;
            
            // 베팅 유형에 따라 승리 조건 확인
            switch (bet.type) {
                case 'single': // 단승 (1등 맞히기)
                    isWin = bet.horses[0].id === raceResults[0].id;
                    break;
                    
                case 'place': // 복승 (1등, 2등 순서 상관없이)
                    isWin = bet.horses.some(h => h.id === raceResults[0].id || h.id === raceResults[1].id);
                    break;
                    
                case 'quinella': // 쌍승 (1등, 2등 정확히)
                    if (bet.horses.length >= 2) {
                        const first = bet.horses[0].id === raceResults[0].id;
                        const second = bet.horses[1].id === raceResults[1].id;
                        isWin = first && second;
                    }
                    break;
                    
                case 'trifecta-place': // 삼복승 (1~3등 순서 상관없이)
                    if (bet.horses.length >= 3) {
                        const top3Ids = raceResults.slice(0, 3).map(h => h.id);
                        const betIds = bet.horses.map(h => h.id);
                        isWin = betIds.every(id => top3Ids.includes(id));
                    }
                    break;
                    
                case 'trifecta': // 삼쌍승 (1~3등 정확한 순서)
                    if (bet.horses.length >= 3) {
                        isWin = bet.horses[0].id === raceResults[0].id &&
                               bet.horses[1].id === raceResults[1].id &&
                               bet.horses[2].id === raceResults[2].id;
                    }
                    break;
            }
            
            // 승리 시 상금 계산
            if (isWin) {
                winAmount = bet.potentialWin;
                totalWinnings += winAmount;
                
                // 승리 알림
                setTimeout(() => {
                    showNotification(`축하합니다! ${getBetTypeName(bet.type)} 베팅에서 ${winAmount.toLocaleString()}원을 획득했습니다!`, 'success', 5000);
                }, 1000);
            }
        });
        
        // 총 상금이 있으면 잔액 업데이트
        if (totalWinnings > 0) {
            updateUserBalance(currentUser.balance + totalWinnings);
        }
        
        // 베팅 내역 초기화
        currentBets = [];
        updateBetsUI();
    }
    
    // 서버에서 받은 경기 결과 업데이트
    function updateRaceResult() {
        if (!raceResults || raceResults.length === 0) return;
        
        console.log('경기 결과 업데이트 중...');
        
        // 결과 패널 표시
        resultPanel.style.display = 'block';
        
        // 결과 목록 업데이트
        resultList.innerHTML = '';
        
        raceResults.forEach((horse, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'result-item';
            
            const rank = document.createElement('span');
            rank.className = 'result-rank';
            rank.textContent = `${index + 1}`;
            
            const name = document.createElement('span');
            name.className = 'result-name';
            name.textContent = horse.name;
            
            const time = document.createElement('span');
            time.className = 'result-time';
            time.textContent = `${horse.finishTime.toFixed(2)}초`;
            
            listItem.appendChild(rank);
            listItem.appendChild(name);
            listItem.appendChild(time);
            
            resultList.appendChild(listItem);
            
            // 1등 말에 애니메이션 효과
            if (index === 0) {
                const winnerHorse = document.getElementById(`horse-${horse.id}`);
                if (winnerHorse) {
                    winnerHorse.style.animation = 'winner 1s infinite';
                }
            }
        });
        
        // 베팅 결과 확인
        checkBettingResults();
    }
    
    // 경주 진행 상태 표시기 시작
    function startRaceProgressBar(elapsedMs = 0) {
        // 진행률 표시기 표시 및 초기화
        raceProgressBar.style.width = '0%';
        raceProgressText.textContent = '경기 시작!';
        raceProgressPercentage.textContent = '0%';
        
        // 초기 진행률 계산 (이미 경과된 시간 반영)
        const initialPercentage = Math.min(100, Math.floor((elapsedMs / (RACE_TIME * 1000)) * 100));
        raceProgressBar.style.transition = 'width 0.5s linear';
        raceProgressBar.style.width = `${initialPercentage}%`;
        
        // 특정 구간에 따른 초기 텍스트 설정
        if (initialPercentage < 25) {
            raceProgressText.textContent = '경기 시작!';
        } else if (initialPercentage < 50) {
            raceProgressText.textContent = '흥미진진한 접전!';
        } else if (initialPercentage < 75) {
            raceProgressText.textContent = '결승선이 보입니다!';
        } else if (initialPercentage < 100) {
            raceProgressText.textContent = '마지막 스퍼트!';
        } else {
            raceProgressText.textContent = '경기 종료!';
            // 이미 경기가 완료된 경우 다른 처리 없이 반환
            if (initialPercentage >= 100) {
                // 5초 후 진행 표시기 초기화
                setTimeout(() => {
                    raceProgressBar.style.width = '0%';
                    raceProgressText.textContent = '경기 준비 중...';
                    raceProgressPercentage.textContent = '0%';
                    
                    // 경기 결과 표시
                    if (raceResults.length > 0) {
                        resultPanel.style.display = 'block';
                    }
                }, 5000);
                return;
            }
        }
        
        // 이전 타이머 제거
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        // 진행 상태 업데이트 타이머 - 서버 시간 기반으로 수정
        progressInterval = setInterval(() => {
            // 현재 서버 시간과 레이스 시작 시간 기준으로 경과 시간 계산
            const currentServerTime = getServerTime();
            const elapsed = currentServerTime - raceStartTime;
            const percentage = Math.min(100, Math.floor((elapsed / (RACE_TIME * 1000)) * 100));
            
            // 진행률 업데이트
            raceProgressBar.style.width = `${percentage}%`;
            raceProgressPercentage.textContent = `${percentage}%`;
            
            // 특정 구간에 따른 텍스트 변경
            if (percentage < 25) {
                raceProgressText.textContent = '경기 시작!';
            } else if (percentage < 50) {
                raceProgressText.textContent = '흥미진진한 접전!';
            } else if (percentage < 75) {
                raceProgressText.textContent = '결승선이 보입니다!';
            } else if (percentage < 100) {
                raceProgressText.textContent = '마지막 스퍼트!';
            } else {
                raceProgressText.textContent = '경기 종료!';
                
                // 진행 상태 업데이트 타이머만 중지하고 완전한 경기 종료는 서버에서 race_result 이벤트로 처리
                clearInterval(progressInterval);
                progressInterval = null;
            }
        }, 100); // 더 부드러운 업데이트를 위해 100ms 간격으로 설정
    }
    
    // 경주 진행 상태 표시기 숨기기
    function hideRaceProgressBar() {
        // 진행 표시기 초기화
        raceProgressBar.style.width = '0%';
        raceProgressText.textContent = '경기 준비 중...';
        raceProgressPercentage.textContent = '0%';
        
        // 타이머 제거
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }
    
    // 게임 초기화 및 시작
    function initGame() {
        console.log('게임 초기화 시작...');
        
        // 사용자 정보 로드
        const isLoggedIn = loadUserInfo();
        console.log('로그인 상태:', isLoggedIn ? '로그인됨' : '게스트 모드');
        
        // 메뉴로 버튼 이벤트
        backToMenuButton.addEventListener('click', function() {
            window.location.href = '/menu.html';
        });
        
        // 트랙 폭 초기 계산
        calculateTrackWidth();
        console.log('초기 트랙 폭:', GLOBAL_TRACK_WIDTH);
        
        // 결승선 위치 조정
        const finishLine = document.querySelector('.finish-line');
        if (finishLine) {
            finishLine.style.right = `${FINISH_LINE_OFFSET}px`;
            console.log('결승선 위치 조정됨:', FINISH_LINE_OFFSET, 'px');
        }
        
        // 채팅 시스템 초기화 (채팅 패널 삭제로 인해 비활성화)
        console.log('채팅 패널이 삭제되어 채팅 시스템을 초기화하지 않습니다.');
        
        // 창 크기 변경 시 트랙 폭 재계산 및 말 위치 조정 (디바운스 적용)
        let resizeTimeout;
        window.addEventListener('resize', function() {
            // 디바운스 처리 - 연속적인 resize 이벤트에서 마지막 이벤트만 처리
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(function() {
                const oldTrackWidth = GLOBAL_TRACK_WIDTH;
                calculateTrackWidth();
                const newTrackWidth = GLOBAL_TRACK_WIDTH;
                
                // 트랙 폭이 크게 변경된 경우에만 말 위치 재조정
                if (Math.abs(oldTrackWidth - newTrackWidth) > 10) {
                    console.log('창 크기 변경으로 말 위치 재조정:', oldTrackWidth, '->', newTrackWidth);
                    
                    // 결승선 위치 조정
                    const finishLine = document.querySelector('.finish-line');
                    if (finishLine) {
                        finishLine.style.right = `${FINISH_LINE_OFFSET}px`;
                    }
                    
                    // 모든 말 위치 재조정
                    horses.forEach(horse => {
                        const horseElement = document.getElementById(`horse-${horse.id}`);
                        if (horseElement) {
                            // 이미 완주한 말은 결승선에 맞춰 정확히 재조정
                            if (horse.finishedDisplayed) {
                                const horseIconOffset = 45; // 말 아이콘 위치 (약 45px 정도 떨어진 위치)
                                
                                // 트랜지션 효과 제거하여 즉시 위치 변경
                                horseElement.style.removeProperty('transition');
                                
                                // 결승선 위치에 정확히 고정
                                horse.position = GLOBAL_TRACK_WIDTH - horseIconOffset;
                                horseElement.style.left = `${GLOBAL_TRACK_WIDTH - horseIconOffset + 40}px`;
                            } else {
                                // 진행 중인 말은 비율에 맞게 조정
                                const ratio = newTrackWidth / oldTrackWidth;
                                horse.position = horse.position * ratio;
                                
                                // 애니메이션 효과 제거하여 즉시 위치 변경
                                horseElement.style.removeProperty('transition');
                                horseElement.style.left = `${horse.position + 40}px`;
                                
                                // 약간의 지연 후 애니메이션 효과 복원
                                setTimeout(() => {
                                    if (!horse.finishedDisplayed) {
                                        horseElement.style.transition = 'left 0.15s linear';
                                    }
                                }, 50);
                            }
                        }
                    });
                }
            }, 100); // 100ms 디바운스
        });
        
        // 초기 타이머 모드를 서버 동기화로 설정
        localTimerMode = false;
        
        // 직접 말 생성 및 게임 시작 (서버에서 데이터를 받기 전에 기본 말 생성)
        generateHorses();
        showBettingUI();
        
        // 금액 버튼 이벤트 연결
        amountButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const amount = parseInt(this.dataset.amount);
                betAmountInput.value = amount;
                updateBetInfo();
            });
        });
        
        // 베팅 금액 입력 이벤트
        betAmountInput.addEventListener('input', updateBetInfo);
        
        // 베팅 유형 선택 이벤트
        betTypeOptions.forEach(option => {
            option.addEventListener('click', function() {
                selectBetType(this.dataset.type);
                updateBetInfo();
            });
        });
        
        // 베팅 확정 버튼 이벤트
        placeBetButton.addEventListener('click', placeBet);
        
        // 소켓 이벤트 리스너 설정
        setupSocketListeners();
        
        // 서버 시간 동기화 시도 (한 번만)
        syncServerTime();
        
        // 서버에서 상태 받아오기
        requestHorseData();
        
        // 남은 시간이 없으면 기본값 설정
        updateRemainingTime(BETTING_TIME);
        
        console.log('게임 초기화 완료');
        
        // 초기화 후 1초 후에 말 다시 그리기 (DOM이 완전히 준비된 후)
        setTimeout(() => {
            console.log('말 렌더링 다시 시도...');
            renderHorses();
        }, 1000);
        
        // 연결된 소켓에 사용자 정보 설정
        if (socket && currentUser) {
            socket.emit('set_user_info', {
                username: currentUser.username,
                userId: currentUser.id || 'local_user',
                isGuest: currentUser.isGuest || false,
                isLocalUser: true,
                balance: currentUser.balance
            });
            console.log('초기화 시 소켓에 사용자 정보 설정:', currentUser.username, '게스트 여부:', currentUser.isGuest);
        }
        
        // 정기적으로 사용자 정보를 동기화하는 타이머 설정 (30초마다)
        setInterval(() => {
            if (socket && socket.connected && currentUser) {
                console.log('정기 사용자 정보 동기화 실행');
                loadUserInfo();
            }
        }, 30000);
    }
    
    // 소켓 이벤트 리스너 설정
    function setupSocketListeners() {
        console.log('소켓 이벤트 리스너 설정 중...');
        
        // 서버 시간 응답 처리
        socket.on('server_time', function(data) {
            const serverTime = data.serverTime;
            const clientReceiveTime = Date.now();
            const latency = (clientReceiveTime - data.clientTime) / 2;
            serverTimeOffset = serverTime - (clientReceiveTime - latency);
            
            // 주기 시작 시간 설정
            if (data.cycleStartTime) {
                cycleStartTime = data.cycleStartTime;
            }
            
            console.log('서버 시간 동기화 완료. 오프셋:', serverTimeOffset, 'ms');
            console.log('주기 시작 시간:', new Date(cycleStartTime).toLocaleTimeString());
            console.log('베팅 시간:', data.bettingTime, '초, 레이싱 시간:', data.raceTime, '초, 총 주기:', data.totalCycle, '초');
            
            serverConnected = true;
            
            // 시간 동기화 후 게임 주기 시작 (처음 한 번만)
            if (!gameInitialized) {
                gameInitialized = true;
                initGameCycle();
            }
        });
        
        // 온라인 플레이어 목록 업데이트 (채팅 패널 삭제로 인해 비활성화)
        socket.on('online_players_update', function(players) {
            console.log('온라인 플레이어 목록 수신 (사용하지 않음)');
        });
        
        // 경마 게임 상태 응답 처리
        socket.on('race_state', function(data) {
            console.log('경마 게임 상태 수신:', data);
            
            // 서버에서 주기 시작 시간 업데이트
            if (data.cycleStartTime) {
                cycleStartTime = data.cycleStartTime;
                console.log('주기 시작 시간 업데이트:', new Date(cycleStartTime).toLocaleTimeString());
            }
            
            // 배팅 시간과 레이스 시간 상수 업데이트 (서버와 불일치 방지)
            if (data.bettingTime && data.bettingTime !== BETTING_TIME) {
                console.log(`베팅 시간 업데이트: ${BETTING_TIME}초 -> ${data.bettingTime}초`);
                BETTING_TIME = data.bettingTime;
            }
            
            if (data.raceTime && data.raceTime !== RACE_TIME) {
                console.log(`레이싱 시간 업데이트: ${RACE_TIME}초 -> ${data.raceTime}초`);
                RACE_TIME = data.raceTime;
            }
            
            // 이전 단계 저장
            const previousPhase = gamePhase;
            
            // 현재 단계 업데이트
            if (data.phase) {
                gamePhase = data.phase;
                console.log(`게임 단계 업데이트: ${previousPhase} -> ${gamePhase}`);
                
                // 단계가 변경된 경우 UI 업데이트
                if (previousPhase !== gamePhase) {
                    if (gamePhase === 'betting') {
                        showBettingUI();
                        hideRaceProgressBar();
                    } else if (gamePhase === 'preparing') {
                        showPreparingUI();
                    } else if (gamePhase === 'racing') {
                        showRacingUI();
                    } else if (gamePhase === 'finished') {
                        // 완료 단계 - 결과 표시
                        showRacingUI();
                        finishRace();
                    }
                }
            }
            
            // 트랙 폭 설정 (모든 말이 공유하는 값)
            if (data.trackWidth) {
                GLOBAL_TRACK_WIDTH = data.trackWidth;
            }
            
            // 말 데이터 업데이트
            if (data.horses && data.horses.length > 0) {
                // 새로운 말 데이터를 기존 데이터와 병합
                if (horses && horses.length > 0 && data.phase === 'betting') {
                    data.horses.forEach((newHorse, index) => {
                        const existingHorse = horses.find(h => h.id === newHorse.id);
                        if (existingHorse) {
                            // 기존 말이 있으면 위치 정보만 업데이트
                            newHorse.position = existingHorse.position || 0;
                            newHorse.finishTime = existingHorse.finishTime;
                            newHorse.actualRank = existingHorse.actualRank;
                        }
                    });
                }
                
                // 게임 단계가 변경되었고, 베팅이나 준비 단계로 전환된 경우 말 위치 초기화
                if (previousPhase !== gamePhase && (gamePhase === 'betting' || gamePhase === 'preparing')) {
                    data.horses.forEach(horse => {
                        horse.position = 0;
                        horse.finishedDisplayed = false;
                        horse.finishTime = null;
                        horse.actualRank = null;
                    });
                }
                
                horses = data.horses;
                
                // 서버에서 받은 말 위치 정보 업데이트
                if (data.horsesPositions) {
                    Object.keys(data.horsesPositions).forEach(horseId => {
                        const horse = horses.find(h => h.id == horseId);
                        if (horse) {
                            // 베팅이나 준비 단계에서는 위치를 0으로 강제
                            if (gamePhase === 'betting' || gamePhase === 'preparing') {
                                horse.position = 0;
                            } else {
                                horse.position = data.horsesPositions[horseId];
                            }
                        }
                    });
                }

                // 완주 시간 정보 업데이트
                if (data.horsesFinishTimes) {
                    Object.keys(data.horsesFinishTimes).forEach(horseId => {
                        const horse = horses.find(h => h.id == horseId);
                        if (horse) {
                            // 베팅이나 준비 단계에서는 완주 시간 초기화
                            if (gamePhase === 'betting' || gamePhase === 'preparing') {
                                horse.finishTime = null;
                                horse.finishedDisplayed = false;
                            } else {
                                horse.finishTime = data.horsesFinishTimes[horseId];
                            }
                        }
                    });
                }
                
                // 말 목록과 옵션 렌더링
                renderHorses();
                renderHorseOptions();
            }
            
            // 레이싱 시작 및 종료 시간 설정
            if (data.raceStartTime) {
                const oldStartTime = raceStartTime;
                raceStartTime = data.raceStartTime;
                
                if (oldStartTime && Math.abs(oldStartTime - raceStartTime) > 1000) {
                    console.log(`레이스 시작 시간 변경됨: ${new Date(oldStartTime).toLocaleTimeString()} -> ${new Date(raceStartTime).toLocaleTimeString()}`);
                }
            }
            
            if (data.raceEndTime) {
                raceEndTime = data.raceEndTime;
            }
            
            // 프레임 데이터가 있는 경우 설정 (준비 단계 또는 레이싱 단계)
            if (data.horsesFrameData && (gamePhase === 'preparing' || gamePhase === 'racing' || gamePhase === 'finished')) {
                console.log('서버에서 프레임 데이터 수신, 항목 수:', Object.keys(data.horsesFrameData).length);
                
                // 프레임 데이터 검증 및 로깅
                let validFrameDataCount = 0;
                let totalFrameCount = 0;
                
                for (const horseId in data.horsesFrameData) {
                    if (Array.isArray(data.horsesFrameData[horseId]) && data.horsesFrameData[horseId].length > 0) {
                        validFrameDataCount++;
                        totalFrameCount += data.horsesFrameData[horseId].length;
                    }
                }
                
                console.log(`유효한 프레임 데이터: ${validFrameDataCount}/${Object.keys(data.horsesFrameData).length} 말, 총 프레임 수: ${totalFrameCount}`);
                
                // 말별로 프레임 데이터를 말 객체에 복사 (백업)
                horses.forEach(horse => {
                    if (data.horsesFrameData[horse.id] && Array.isArray(data.horsesFrameData[horse.id]) && data.horsesFrameData[horse.id].length > 0) {
                        // 서버 프레임 데이터 저장
                        horse.frames = [...data.horsesFrameData[horse.id]];
                        console.log(`말 ${horse.name}(ID:${horse.id})의 프레임 데이터 설정, 프레임 수: ${horse.frames.length}`);
                    }
                });
                
                // 전역 프레임 데이터 저장
                horsesFrameData = data.horsesFrameData;
                
                // 레이싱 단계인 경우 레이싱 화면으로 전환
                if (gamePhase === 'racing') {
                    showRacingUI();
                    
                    // 진행 상황에 맞는 애니메이션 시작
                    if (data.racingElapsedTime !== undefined) {
                        // 이전에 진행 중이던 애니메이션 정리
                        if (raceAnimationId) {
                            cancelAnimationFrame(raceAnimationId);
                            raceAnimationId = null;
                        }
                        
                        // 진행 시간에 맞는 프레임 계산 (60fps 기준)
                        const currentFrame = Math.floor(data.racingElapsedTime / (1000 / 60));
                        
                        // 레이스 진행 바 표시
                        startRaceProgressBar(data.racingElapsedTime);
                        
                        // 로컬 타이머 모드 설정 (서버 시간과 독립적으로 진행)
                        localTimerMode = true;
                        localTimerStart = Date.now() - data.racingElapsedTime;
                        localRaceStartTime = Date.now() - data.racingElapsedTime;
                        
                        console.log(`경주 애니메이션 재시작, 경과 시간: ${data.racingElapsedTime}ms, 프레임: ${currentFrame}, 총 프레임: ${RACE_TIME * 60}`);
                        
                        // 경주가 거의 끝났으면 마지막 프레임부터 애니메이션 시작
                        const raceNearlyFinished = currentFrame > (RACE_TIME * 60 * 0.9); // 90% 이상 진행
                        
                        if (raceNearlyFinished) {
                            console.log('경주가 거의 끝났습니다. 마지막 프레임에서 재시작합니다.');
                            const lastFrameIndex = RACE_TIME * 60 - 10; // 마지막 10프레임 전부터 시작
                            animateRace(lastFrameIndex);
                        }
                        // 초기 단계(0.5초 미만)에서는 항상 처음부터 시작
                        else if (data.racingElapsedTime < 500) {
                            console.log('경주 초기 단계입니다. 처음부터 시작합니다.');
                            animateRace(0);
                        }
                        // 그 외에는 현재 프레임부터 애니메이션 재시작
                        else {
                            console.log(`경주 중간 단계입니다. 현재 프레임(${currentFrame})부터 시작합니다.`);
                            animateRace(currentFrame);
                        }
                        
                        // 남은 시간 타이머 업데이트
                        const remainingSeconds = Math.max(0, Math.floor((RACE_TIME * 1000 - data.racingElapsedTime) / 1000));
                        updateRemainingTime(remainingSeconds, true);
                    } else {
                        // 경과 시간 정보가 없는 경우, 처음부터 애니메이션 시작
                        console.log('경과 시간 정보 없음, 처음부터 애니메이션 시작');
                        animateRace(0);
                    }
                } else if (gamePhase === 'finished') {
                    // 경주가 끝난 경우, 결과 표시
                    showRacingUI();
                    
                    // 모든 말의 위치를 결승선으로 표시
                    horses.forEach(horse => {
                        horse.position = GLOBAL_TRACK_WIDTH;
                        horse.finishedDisplayed = true;
                    });
                    
                    // 말 렌더링 업데이트
                    renderHorses();
                    
                    // 결과가 있으면 결과 표시
                    if (data.results && data.results.length > 0) {
                        currentResults = data.results;
                        updateRaceResult();
                    }
                }
            }
            
            // 결과 데이터 업데이트 (경기가 끝났거나 베팅 단계에서 이전 결과를 표시할 때)
            if (data.results && data.results.length > 0) {
                currentResults = data.results;
                
                // 경주가 끝났거나 베팅 단계에서 이전 결과를 표시
                if (gamePhase === 'finished' || (gamePhase === 'betting' && data.racingElapsedTime === 0)) {
                    updateRaceResult();
                }
            }
            
            // 남은 시간 업데이트 (레이싱 단계에서는 위에서 이미 처리함)
            if (data.remainingTime !== undefined && gamePhase !== 'racing') {
                const isRacingPhase = gamePhase === 'racing';
                updateRemainingTime(data.remainingTime, isRacingPhase);
            }
        });
        
        // 소켓 연결 이벤트
        socket.on('connect', function() {
            console.log('서버에 연결되었습니다.');
            
            // 연결 시 사용자 정보 설정 (로컬 스토리지 정보 기반)
            if (currentUser && currentUser.username) {
                console.log('소켓 연결 성공, 사용자 인증 시작:', currentUser.username);
                authenticateUser();
                
                // 서버 시간 동기화 및 게임 상태 요청
                syncServerTime();
                requestHorseData();
            }
        });
        
        // 인증 응답 이벤트
        socket.on('auth_response', function(data) {
            console.log('인증 응답 수신:', data);
            
            if (data.success) {
                // 인증 성공
                console.log('소켓 인증 성공:', data.user ? data.user.username : '알 수 없음');
                
                // 사용자 정보 업데이트
                if (data.user) {
                    // 기존 사용자 객체에 최신 정보 병합
                    currentUser = {
                        ...currentUser,
                        ...data.user,
                        authenticated: true
                    };
                    
                    // UI 업데이트
                    updateUserInfoUI();
                    
                    // 로컬 스토리지 업데이트
                    localStorage.setItem('user', JSON.stringify(currentUser));
                    if (localStorage.getItem('userInfo')) {
                        localStorage.setItem('userInfo', JSON.stringify(currentUser));
                    }
                }
                
                // 게임 상태 요청
                requestHorseData();
            } else {
                // 인증 실패
                console.error('소켓 인증 실패:', data.message);
                
                // 게스트 모드인지 확인
                if (data.isGuest) {
                    console.log('게스트 모드로 연결됨');
                    currentUser.isGuest = true;
                    
                    // 게스트 UI 표시
                    userNameElement.textContent = '게스트 (베팅 불가)';
                    userBalanceElement.textContent = '0 원';
                } else {
                    // 심각한 인증 오류, 재로그인 필요
                    alert('인증에 실패했습니다. 다시 로그인해 주세요.');
                    window.location.href = '/login.html';
                }
            }
        });
        
        // 사용자 정보 업데이트 이벤트
        socket.on('user_info_update', function(data) {
            console.log('사용자 정보 업데이트 수신:', data);
            
            if (data.success && data.user) {
                console.log('서버에서 사용자 정보 업데이트됨:', data.user.username, '잔액:', data.user.balance);
                
                // 잔액만 업데이트 (UI 함께 업데이트)
                updateUserBalance(data.user.balance);
                
                // 전체 사용자 정보 업데이트 (로컬 스토리지 등)
                currentUser = {
                    ...currentUser,
                    ...data.user
                };
                
                localStorage.setItem('user', JSON.stringify(currentUser));
                if (localStorage.getItem('userInfo')) {
                    localStorage.setItem('userInfo', JSON.stringify(currentUser));
                }
            }
        });
        
        // 사용자 잔액 업데이트 이벤트
        socket.on('user_balance_update', function(data) {
            console.log('사용자 잔액 업데이트 이벤트 수신:', data);
            
            // 현재 사용자와 일치하는지 확인
            if (currentUser && data.username && 
                (data.username.toLowerCase() === currentUser.username.toLowerCase() || 
                data.userId === currentUser.id)) {
                
                // 잔액 업데이트
                updateUserBalance(data.balance);
                console.log('잔액 업데이트 완료:', data.balance);
            }
        });
        
        // 과거 호환성을 위한 balance_update 이벤트 처리
        socket.on('balance_update', function(data) {
            console.log('잔액 업데이트 이벤트 수신:', data);
            
            // 대소문자 구분 없이 사용자 이름 비교
            if (currentUser && data.username && 
                (data.username.toLowerCase() === currentUser.username.toLowerCase() || 
                data.userId === currentUser.id)) {
                console.log('사용자 잔액 업데이트:', currentUser.balance, '->', data.balance);
                updateUserBalance(data.balance);
            } else {
                console.log('잔액 업데이트가 현재 사용자와 일치하지 않습니다:', 
                    '이벤트 사용자=', data.username, 
                    '현재 사용자=', currentUser ? currentUser.username : '없음');
            }
        });
        
        // 베팅 응답 이벤트
        socket.on('bet_response', function(data) {
            console.log('베팅 응답 수신:', data);
            
            // 베팅 처리 플래그 초기화하여 중복 베팅 방지
            isBettingInProgress = false;
            
            // 베팅 버튼 다시 활성화
            placeBetButton.disabled = false;
            
            if (data.success) {
                // 베팅 성공
                updateUserBalance(data.newBalance);
                
                // 클라이언트 측에서 이미 베팅을 추가했으므로 중복 추가하지 않고
                // 서버에서 받은 정보로 기존 베팅 정보 업데이트만 수행
                if (data.bet && data.betId) {
                    // 가장 최근 추가된 베팅(마지막 항목)을 서버에서 받은 정보로 업데이트
                    if (currentBets.length > 0) {
                        const lastBetIndex = currentBets.length - 1;
                        
                        // 서버 정보로 업데이트
                        currentBets[lastBetIndex] = {
                            ...currentBets[lastBetIndex],
                            id: data.betId,
                            ...data.bet
                        };
                        
                        // UI 업데이트
                        updateBetsUI();
                    }
                }
                
                showNotification('베팅이 성공적으로 완료되었습니다!', 'success');
                
                // 베팅 폼 초기화
                resetBettingForm();
            } else {
                // 베팅 실패
                showNotification('베팅 실패: ' + data.message, 'error');
                
                // 실패 시 UI 베팅 내역에서 제거 (클라이언트에 먼저 추가된 경우)
                if (currentBets.length > 0) {
                    // 마지막 베팅 항목 제거 (가장 최근 추가된 것으로 가정)
                    currentBets.pop();
                    updateBetsUI();
                }
            }
        });
        
        // 베팅 취소 응답 이벤트
        socket.on('cancel_bet_response', function(data) {
            console.log('베팅 취소 응답 수신:', data);
            
            if (data.success) {
                // 잔액 업데이트
                updateUserBalance(data.newBalance);
                
                // 베팅 목록에서 제거
                const betIndex = currentBets.findIndex(bet => bet.id === data.betId);
                if (betIndex !== -1) {
                    currentBets.splice(betIndex, 1);
                    updateBetsUI();
                }
                
                showNotification('베팅이 취소되었습니다.', 'info');
            } else {
                showNotification('베팅 취소 실패: ' + data.message, 'error');
            }
        });
        
        // 경마 베팅 결과 이벤트
        socket.on('horse_race_winnings', function(data) {
            console.log('경마 베팅 결과 이벤트 수신:', data);
            
            if (!data || (!data.winningBets && !data.losingBets)) {
                console.log('유효하지 않은 베팅 결과 데이터');
                return;
            }
            
            // 소속 사용자 결과만 처리
            if (currentUser && data.userId === currentUser.id) {
                // 현재 게임 UI 상태 저장
                const currentGamePhase = gamePhase;
                
                // 승리한 베팅이 있는 경우 알림 표시
                if (data.winningBets && data.winningBets.length > 0) {
                    console.log('승리한 베팅 결과:', data.winningBets);
                    
                    // 각 승리 베팅 정보 표시
                    data.winningBets.forEach(bet => {
                        const betTypeName = getBetTypeName(bet.betType);
                        const winAmount = bet.winAmount || 0;
                        
                        // 게임 판 전체에 당첨 알림 표시
                        setTimeout(() => {
                            showNotification(`축하합니다! ${betTypeName} 베팅에서 ${winAmount.toLocaleString()}원을 획득했습니다!`, 'success', 5000);
                        }, 1000);
                    });
                    
                    // 잔액 업데이트
                    if (data.newBalance) {
                        updateUserBalance(data.newBalance);
                    }
                } else if (data.losingBets && data.losingBets.length > 0) {
                    console.log('패배한 베팅 결과:', data.losingBets.length, '건');
                    // 필요 시 패배 메시지 표시
                    // showNotification('아쉽게도 베팅에 실패했습니다.', 'info');
                }
                
                // 현재 베팅 내역 업데이트
                // 베팅 단계로 돌아온 경우에만 내역 클리어 (베팅 결과는 이전 게임 결과일 수 있음)
                if (currentGamePhase === 'betting') {
                    currentBets = [];
                    updateBetsUI();
                }
            } else {
                console.log('다른 사용자의 베팅 결과 이벤트 무시');
            }
        });
        
        // 새 경마 게임 시작 이벤트
        socket.on('new_race', function(data) {
            console.log('새 경마 게임 시작:', data);
            
            // 주기 시작 시간 업데이트
            if (data.cycleStartTime) {
                cycleStartTime = data.cycleStartTime;
            }
            
            if (data.horses && Array.isArray(data.horses)) {
                generateHorses(data.horses);
            }
            
            // 새 주기 시작
            gamePhase = 'betting';
            
            // 이전 타이머 제거
            clearAllTimers();
            
            showBettingUI();
            updateRemainingTime(BETTING_TIME);
        });
        
        // 경주 준비 이벤트 (서버에서 미리 계산된 경로 데이터 수신)
        socket.on('race_preparing', function(data) {
            console.log('경마 경주 준비 중:', data);
            
            // 준비 시작 시간 설정
            preparingStartTime = data.preparingStartTime;
            
            // 레이스 시작 및 종료 시간 설정
            raceStartTime = data.raceStartTime;
            raceEndTime = data.raceEndTime;
            
            // 경로 데이터 저장
            if (data.horsesFrameData) {
                horsesFrameData = data.horsesFrameData;
                GLOBAL_TRACK_WIDTH = data.trackWidth || GLOBAL_TRACK_WIDTH;
            }
            
            // 로컬 타이머 모드로 전환
            localTimerMode = true;
            localTimerStart = Date.now();
            
            // 준비 단계로 전환
            gamePhase = 'preparing';
            showPreparingUI();
            
            // 준비 단계 진행 상태 표시 시작
            startPreparingProgressBar();
        });
        
        // 경마 경주 시작 이벤트
        socket.on('race_start', function(data) {
            console.log('경마 경주 시작:', data);
            
            // 레이스 시작 시간 설정
            if (data.raceStartTime) {
                raceStartTime = data.raceStartTime;
            }
            
            // 레이스 종료 시간 설정
            if (data.raceEndTime) {
                raceEndTime = data.raceEndTime;
            }
            
            // 경로 데이터 저장 (준비 단계에서 받지 못한 경우 대비)
            if (data.horsesFrameData) {
                horsesFrameData = data.horsesFrameData;
            }
            
            // 로컬 타이머 모드로 전환
            localTimerMode = true;
            localTimerStart = Date.now();
            localRaceStartTime = Date.now();
            
            // 게임 단계 업데이트
            gamePhase = 'racing';
            
            // 모든 말의 위치와 상태 초기화 (경기 시작 시 위치 재설정)
            horses.forEach(horse => {
                horse.position = 0;
                horse.finishedDisplayed = false;
                horse.finishTime = null;
                horse.actualRank = null;
                
                // DOM 요소도 초기화
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (horseElement) {
                    horseElement.style.left = '40px';
                    horseElement.style.removeProperty('transform');
                    horseElement.classList.remove('finished', 'near-finish');
                    
                    // 완주 관련 시각적 요소 제거
                    const parent = horseElement.parentElement;
                    if (parent) {
                        parent.classList.remove('finished-lane', 'first-rank', 'second-rank', 'third-rank');
                        const laneResult = parent.querySelector('.lane-result');
                        if (laneResult) parent.removeChild(laneResult);
                    }
                    
                    // 이름과 배당률 표시 복원
                    const horseName = horseElement.querySelector('.horse-name');
                    const horseOdds = horseElement.querySelector('.horse-odds');
                    if (horseName) horseName.style.display = '';
                    if (horseOdds) horseOdds.style.display = '';
                    
                    // 부드러운 트랜지션 설정
                    horseElement.style.transition = 'left 0.1s linear';
                }
            });
            
            // UI 업데이트
            showRacingUI();
            
            // 진행 상태 표시줄 초기화 및 시작
            raceProgressBar.style.width = '0%';
            raceProgressText.textContent = '경기 시작!';
            raceProgressPercentage.textContent = '0%';
            showRaceProgressBar();
            
            // 순위표 초기화
            initializeRankingBoard();
            
            // 경주 애니메이션 시작 - 서버에서 업데이트를 받기 전에 간단한 애니메이션만 시작
            // 실제 위치 업데이트는 race_progress 이벤트에서 처리됨
            animateRace(0);
            
            // 레이싱 시간 전체 동안 타이머 설정
            updateRemainingTime(RACE_TIME, true);
        });
        
        // 경기 결과 이벤트
        socket.on('race_result', function(data) {
            console.log('경마 경주 결과:', data);
            
            if (data.results && Array.isArray(data.results)) {
                raceResults = data.results;
                
                // 서버에서 받은 말 위치 정보가 있으면 업데이트
                if (data.horsesPositions) {
                    Object.keys(data.horsesPositions).forEach(horseId => {
                        const horse = horses.find(h => h.id === parseInt(horseId));
                        if (horse) {
                            horse.position = data.horsesPositions[horseId];
                            
                            // DOM 업데이트
                            const horseElement = document.getElementById(`horse-${horse.id}`);
                            if (horseElement) {
                                horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                            }
                        }
                    });
                    console.log('말 위치 정보 업데이트 완료');
                }
                
                // 서버에서 받은 완주 시간 정보가 있으면 업데이트
                if (data.horsesFinishTimes) {
                    Object.keys(data.horsesFinishTimes).forEach(horseId => {
                        const horse = horses.find(h => h.id === parseInt(horseId));
                        if (horse) {
                            horse.finishTime = data.horsesFinishTimes[horseId];
                        }
                    });
                    console.log('완주 시간 정보 업데이트 완료');
                }
                
                // 서버에서 받은 순위 정보가 있으면 업데이트
                if (data.horsesRanks) {
                    Object.keys(data.horsesRanks).forEach(horseId => {
                        const horse = horses.find(h => h.id === parseInt(horseId));
                        if (horse) {
                            horse.actualRank = data.horsesRanks[horseId];
                            // 완주 표시 설정
                            if (horse.finishTime) {
                                horse.finishedDisplayed = true;
                            }
                        }
                    });
                    console.log('말 순위 정보 업데이트 완료');
                }
                
                // 완주 시간 기준으로 결과 정렬
                raceResults = [...horses].sort((a, b) => {
                    // 실제 순위가 있으면 순위 기준 정렬
                    if (a.actualRank && b.actualRank) {
                        return a.actualRank - b.actualRank;
                    }
                    // 그렇지 않으면 완주 시간 기준 정렬
                    return (a.finishTime || Infinity) - (b.finishTime || Infinity);
                });
                
                // 애니메이션 중지 (진행 중이었다면)
                if (raceAnimationId) {
                    cancelAnimationFrame(raceAnimationId);
                    raceAnimationId = null;
                }
                
                // 결과 표시
                finishRace();
            }
        });
        
        // 잔액 업데이트 이벤트
        socket.on('balance_update', function(data) {
            console.log('잔액 업데이트 이벤트 수신:', data);
            
            // 대소문자 구분 없이 사용자 이름 비교
            if (currentUser && data.username && 
                (data.username.toLowerCase() === currentUser.username.toLowerCase() || 
                data.userId === currentUser.id)) {
                console.log('사용자 잔액 업데이트:', currentUser.balance, '->', data.balance);
                updateUserBalance(data.balance);
            } else {
                console.log('잔액 업데이트가 현재 사용자와 일치하지 않습니다:', 
                    '이벤트 사용자=', data.username, 
                    '현재 사용자=', currentUser ? currentUser.username : '없음');
            }
        });
        
        // 베팅 상금 이벤트
        socket.on('horse_race_winnings', function(data) {
            console.log('경마 베팅 상금 이벤트 수신:', data);
            
            if (data.totalWinnings > 0) {
                // 기존 잔액과 새 잔액을 로그로 확인
                console.log('상금 지급으로 잔액 업데이트:', currentUser.balance, '->', data.newBalance);
                
                // 사용자 잔액 즉시 업데이트
                updateUserBalance(data.newBalance);
                
                // 2초 후 로컬 스토리지에서 사용자 정보 다시 불러와 동기화
                setTimeout(() => {
                    loadUserInfo();
                    console.log('사용자 정보 다시 로드 완료. 현재 잔액:', currentUser.balance);
                }, 2000);
                
                showNotification(`축하합니다! 총 ${data.totalWinnings.toLocaleString()}원의 상금을 획득했습니다!`, 'success', 5000);
            }
        });
        
        // 연결 오류 처리
        socket.on('connect_error', function(error) {
            console.error('소켓 연결 오류:', error);
            showNotification('서버 연결에 실패했습니다. 페이지를 새로고침하세요.', 'error');
        });
        
        console.log('소켓 이벤트 리스너 설정 완료');
    
        // 말 위치 업데이트 수신 (다른 클라이언트들의 업데이트)
        socket.on('horse_position_update', function(data) {
            if (data && data.horseId && data.position !== undefined) {
                // 말 위치 정보 업데이트
                const horse = horses.find(h => h.id === data.horseId);
                if (horse) {
                    horse.position = data.position;
                    
                    // DOM 업데이트
                    const horseElement = document.getElementById(`horse-${horse.id}`);
                    if (horseElement) {
                        horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                        
                        // 결승선 통과 후 이름표가 결승선과 겹치지 않도록 조정
                        if (horse.position >= GLOBAL_TRACK_WIDTH) {
                            horseElement.style.transform = 'translateX(20px)'; // 결승선 뒤쪽으로 위치 조정
                        }
                        
                        // 완주 시간이 있으면 업데이트
                        if (data.finishTime !== undefined) {
                            horse.finishTime = data.finishTime;
                            
                            // 순위 계산 (이미 완주한 말의 수)
                            const finishedHorseCount = horses.filter(h => h.finishTime !== undefined).length;
                            horse.actualRank = finishedHorseCount;
                            
                            // 완주한 말에 애니메이션 효과 추가
                            horseElement.classList.add('finished');
                            
                            // 말의 레인 요소 찾기
                            const raceLane = horseElement.parentElement;
                            if (raceLane) {
                                // 레인 색상 변경 (완주 순위에 따라 다른 색상)
                                raceLane.classList.add('finished-lane');
                                
                                // 순위에 따른 색상 적용
                                if (finishedHorseCount === 1) {
                                    raceLane.classList.add('first-rank');
                                } else if (finishedHorseCount === 2) {
                                    raceLane.classList.add('second-rank');
                                } else if (finishedHorseCount === 3) {
                                    raceLane.classList.add('third-rank');
                                }
                                
                                // 레인에 말 이름과 순위, 완주 시간 표시
                                let laneResultElement = raceLane.querySelector('.lane-result');
                                if (!laneResultElement) {
                                    laneResultElement = document.createElement('div');
                                    laneResultElement.className = 'lane-result';
                                    laneResultElement.innerHTML = `
                                        <span class="lane-horse-name">${horse.name}</span>
                                        <span class="lane-finish-rank">${finishedHorseCount}위</span>
                                        <span class="lane-finish-time">${horse.finishTime.toFixed(2)}초</span>
                                        <span class="lane-horse-odds">${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}배</span>
                                    `;
                                    raceLane.appendChild(laneResultElement);
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // 경주 진행 상황 업데이트 수신
        socket.on('race_progress', function(data) {
            // 경주 중이 아니면 무시
            if (gamePhase !== 'racing') {
                return;
            }
            
            // 디버깅 정보 (5초마다)
            const elapsedSeconds = data.elapsedTime ? Math.floor(data.elapsedTime / 1000) : 0;
            if (elapsedSeconds % 5 === 0) {
                console.log(`경주 진행 업데이트: ${elapsedSeconds}초 경과, 프레임: ${data.currentFrame || 0}`);
            }
            
            // 말 위치 정보 업데이트
            if (data.horsesPositions) {
                // 업데이트된 말 수 카운트
                let updatedHorseCount = 0;
                
                Object.keys(data.horsesPositions).forEach(horseId => {
                    // ID를 숫자로 변환
                    const numericHorseId = parseInt(horseId);
                    const horse = horses.find(h => h.id === numericHorseId);
                    
                    if (horse) {
                        // 서버에서 받은 위치 저장
                        const serverPosition = data.horsesPositions[horseId];
                        
                        // 말이 완주 상태가 아니고 위치가 변경된 경우만 업데이트
                        if (!horse.finishedDisplayed && horse.position !== serverPosition) {
                            // 현재 위치와 서버 위치가 큰 차이가 있는 경우 즉시 위치 업데이트
                            // 그렇지 않으면 부드럽게 애니메이션
                            const positionDiff = Math.abs(serverPosition - horse.position);
                            const needsImmediate = positionDiff > 50; // 50px 이상 차이나면 즉시 이동
                            
                            // 위치 업데이트
                            horse.serverPosition = serverPosition; // 서버 기준 위치 별도 저장
                            
                            // DOM 업데이트
                            const horseElement = document.getElementById(`horse-${horse.id}`);
                            if (horseElement) {
                                // 완주 처리
                                if (serverPosition >= GLOBAL_TRACK_WIDTH - 45) { // 결승선에 도달
                                    horse.position = serverPosition;
                                    handleHorseFinish(horse, horseElement, data.currentFrame || 0);
                                } 
                                // 일반 위치 업데이트
                                else {
                                    // 즉시 이동이 필요한 경우
                                    if (needsImmediate) {
                                        horse.position = serverPosition;
                                        horseElement.style.transition = 'none';
                                        horseElement.style.left = `${serverPosition + 40}px`; // 40px는 초기 offset
                                        
                                        // 다음 프레임에서 트랜지션 복원
                                        setTimeout(() => {
                                            if (horseElement && !horse.finishedDisplayed) {
                                                horseElement.style.transition = 'left 0.1s linear';
                                            }
                                        }, 50);
                                    } 
                                    // 부드러운 애니메이션이 필요한 경우
                                    else {
                                        // 현재 위치와 서버 위치 사이를 부드럽게 보간
                                        horse.position = serverPosition;
                                        horseElement.style.transition = 'left 0.1s linear';
                                        horseElement.style.left = `${serverPosition + 40}px`; // 40px는 초기 offset
                                    }
                                }
                                
                                updatedHorseCount++;
                            }
                        }
                    }
                });
                
                // 업데이트된 말이 있으면 순위표 갱신
                if (updatedHorseCount > 0) {
                    updateRankingBoard();
                }
            }
            
            // 경과 시간 표시 업데이트
            if (data.elapsedTime !== undefined) {
                // 진행 표시줄 업데이트
                const elapsedMs = data.elapsedTime;
                const totalMs = RACE_TIME * 1000;
                const progressPercent = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));
                
                // 진행 표시줄이 있으면 업데이트
                if (raceProgressBar) {
                    raceProgressBar.style.width = `${progressPercent}%`;
                    
                    if (raceProgressPercentage) {
                        raceProgressPercentage.textContent = `${progressPercent}%`;
                    }
                    
                    // 진행 단계에 따른 텍스트 업데이트
                    if (raceProgressText) {
                        if (progressPercent < 25) {
                            raceProgressText.textContent = '경기 시작!';
                        } else if (progressPercent < 50) {
                            raceProgressText.textContent = '흥미진진한 접전!';
                        } else if (progressPercent < 75) {
                            raceProgressText.textContent = '결승선이 보입니다!';
                        } else if (progressPercent < 100) {
                            raceProgressText.textContent = '마지막 스퍼트!';
                        } else {
                            raceProgressText.textContent = '경기 종료!';
                        }
                    }
                }
            }
        });
        
        // 말 위치 업데이트 이벤트 처리
        socket.on('race_positions_update', function(data) {
            // 경주 중일 때만 위치 업데이트 처리
            if (gamePhase !== 'racing') return;
            
            // 말 위치 정보 업데이트
            if (data.horsesPositions) {
                // 각 말의 위치 업데이트
                horses.forEach(horse => {
                    if (data.horsesPositions[horse.id] !== undefined) {
                        // 서버 위치 정보 저장
                        horse.serverPosition = data.horsesPositions[horse.id];
                    }
                });
            }
            
            // 완주 시간 정보 업데이트
            if (data.horsesFinishTimes) {
                // 각 말의 완주 시간 업데이트
                horses.forEach(horse => {
                    if (data.horsesFinishTimes[horse.id] !== undefined) {
                        // 완주 처리가 되지 않은 말만 처리
                        if (!horse.finishedDisplayed) {
                            // 완주 시간 설정
                            horse.finishTime = data.horsesFinishTimes[horse.id];
                            
                            // 서버에서 완주 처리된 말이면 완주 처리
                            if (horse.finishTime > 0) {
                                const horseElement = document.getElementById(`horse-${horse.id}`);
                                if (horseElement) {
                                    // 이미 완주 처리된 말이 아니면 완주 처리
                                    if (!horse.finishedDisplayed) {
                                        console.log(`서버 완주 정보에 따라 말 '${horse.name}' 완주 처리`);
                                        handleHorseFinish(horse, horseElement, data.racingElapsedTime / (1000 / 60));
                                    }
                                }
                            }
                        }
                    }
                });
            }
            
            // 경주 경과 시간 정보 업데이트
            if (data.racingElapsedTime !== undefined) {
                // 경주 경과 시간을 기준으로 남은 시간 업데이트
                const elapsedSeconds = data.racingElapsedTime / 1000;
                const remainingSeconds = Math.max(0, RACE_TIME - elapsedSeconds);
                
                // 로그 (5초마다 또는 마지막 10초에 출력)
                if (Math.floor(elapsedSeconds) % 5 === 0 || remainingSeconds <= 10) {
                    console.log(`경주 경과 시간: ${elapsedSeconds.toFixed(1)}초, 남은 시간: ${remainingSeconds.toFixed(1)}초`);
                }
            }
        });
    }
    
    // 준비 단계 UI 표시
    function showPreparingUI() {
        console.log('준비 단계 UI 표시');
        
        // 게임 단계 텍스트 업데이트
        raceStatusText.textContent = '경기 준비 중';
        raceStatusText.className = 'preparing-phase';
        
        // 베팅 패널 숨기기
        document.querySelector('.betting-panel').style.display = 'none';
        // 결과 패널 숨기기
        resultPanel.style.display = 'none';
        // 현재 베팅 패널 표시
        document.getElementById('current-bets-panel').style.display = 'block';
        // 베팅 버튼 비활성화
        placeBetButton.disabled = true;
        
        // 진행 표시기 업데이트
        showRaceProgressBar();
        raceProgressText.textContent = '경기 준비 중...';
        
        // 경기 단계에 따른 클래스 설정
        document.body.classList.remove('race-phase-betting', 'race-phase-racing');
        document.body.classList.add('race-phase-preparing');
    }
    
    // 준비 단계 진행 상태 표시 시작
    function startPreparingProgressBar(remainingTime = 0) {
        // 진행률 표시기 표시
        showRaceProgressBar();
        
        // 진행률 표시기 초기화
        raceProgressBar.style.width = '0%';
        raceProgressText.textContent = '경주 준비 중...';
        raceProgressPercentage.textContent = '0%';
        
        // 이전 타이머 제거
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        // 준비 시작 시간이 유효한지 확인
        if (!preparingStartTime || preparingStartTime <= 0) {
            console.warn('유효하지 않은 준비 시작 시간:', preparingStartTime);
            preparingStartTime = Date.now();
        }
        
        // 레이스 시작 시간이 유효한지 확인
        if (!raceStartTime || raceStartTime <= 0) {
            console.warn('유효하지 않은 레이스 시작 시간:', raceStartTime);
            // 준비 시간을 3초로 가정
            raceStartTime = preparingStartTime + 3000;
        }
        
        // 준비 시작 시간 기준으로 진행률 업데이트 타이머 설정
        progressInterval = setInterval(() => {
            const now = Date.now();
            const elapsedMs = now - preparingStartTime;
            const totalPrepareTime = raceStartTime - preparingStartTime;
            
            // 유효하지 않은 시간이면 보정
            if (totalPrepareTime <= 0) {
                clearInterval(progressInterval);
                progressInterval = null;
                
                // 즉시 경주 시작으로 진행
                startRaceProgressBar(0);
                return;
            }
            
            const percentage = Math.min(100, Math.floor((elapsedMs / totalPrepareTime) * 100));
        
            // 진행률 업데이트
            raceProgressBar.style.width = `${percentage}%`;
            raceProgressPercentage.textContent = `${percentage}%`;
            
            // 경주 시작 카운트다운
            const timeLeft = Math.ceil((raceStartTime - now) / 1000);
            if (timeLeft <= 3) {
                raceProgressText.textContent = `경주 시작 ${timeLeft}초 전...`;
            } else {
                raceProgressText.textContent = '경주 준비 중...';
            }
            
            // 준비 시간이 끝나면 경주 시작
            if (now >= raceStartTime) {
                clearInterval(progressInterval);
                progressInterval = null;
                
                // 경주 진행 상태 표시기 시작 (0초부터)
                startRaceProgressBar(0);
                
                // 게임 상태 업데이트
                gamePhase = 'racing';
                showRacingUI();
            }
        }, 100);
    }

    // 추가 CSS 스타일을 위한 요소 생성 및 문서에 추가
    const additionalStyle = document.createElement('style');
    additionalStyle.textContent = `
        /* 준비 단계 스타일 */
        .preparing-phase {
            background-color: #FF9800;
        }
        
        /* 말의 움직임을 더 부드럽게 만드는 스타일 */
        .horse {
            will-change: transform, left; /* GPU 가속 힌트 */
            transform: translateZ(0);     /* 하드웨어 가속 강제 적용 */
            transition: left 0.1s linear;  /* 기본 이동 트랜지션 */
            backface-visibility: hidden;  /* 렌더링 최적화 */
        }
        
        /* 결승선 근처 말 스타일 */
        .horse.near-finish {
            transition: left 0.05s linear !important; /* 더 빈번한 업데이트 */
        }
        
        /* 완주한 말 스타일 */
        .horse.finished {
            transition: none !important; /* 완주 후 트랜지션 제거 */
            animation: finishPulse 1.5s ease-in-out; /* 완주 효과 */
        }
        
        /* 1위 말 스타일 */
        .first-rank .horse {
            animation: winner 2s infinite !important; /* 우승자 효과 */
        }
        
        /* 레인 결과 표시 애니메이션 */
        .lane-result {
            animation: fadeIn 0.5s ease-in-out;
        }
        
        /* 완주 효과 애니메이션 */
        @keyframes finishPulse {
            0% { transform: translateZ(0) scale(1); }
            50% { transform: translateZ(0) scale(1.2); }
            100% { transform: translateZ(0) scale(1); }
        }
        
        /* 페이드인 애니메이션 */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* 각 레인 우승 표시 향상 */
        .first-rank {
            background-color: rgba(255, 215, 0, 0.2) !important;
            box-shadow: inset 0 0 15px rgba(255, 215, 0, 0.5);
        }
        
        .second-rank {
            background-color: rgba(192, 192, 192, 0.2) !important;
            box-shadow: inset 0 0 10px rgba(192, 192, 192, 0.5);
        }
        
        .third-rank {
            background-color: rgba(205, 127, 50, 0.2) !important;
            box-shadow: inset 0 0 10px rgba(205, 127, 50, 0.5);
        }
    `;
    document.head.appendChild(additionalStyle);
    
    // 게임 초기화 호출
    initGame();

    // 트랙 폭 계산 함수
    function calculateTrackWidth() {
        const raceTrack = document.querySelector('.race-track');
        if (!raceTrack) return GLOBAL_TRACK_WIDTH || 1000; // 기본값 설정
        
        // 트랙 전체 폭 - 결승선 오프셋 - 초기 말 위치 오프셋(40px)
        const trackWidth = raceTrack.clientWidth - FINISH_LINE_OFFSET - 40;
        
        // 유효하지 않은 값이면 기본값 적용
        const validWidth = (trackWidth > 100) ? trackWidth : 1000;
        
        // 변경된 폭이 기존 폭과 10px 이상 차이가 있을 때만 업데이트
        // 이렇게 하면 창 크기가 약간 변경될 때 불필요한 업데이트를 방지합니다
        if (!GLOBAL_TRACK_WIDTH || Math.abs(GLOBAL_TRACK_WIDTH - validWidth) > 10) {
            // 글로벌 변수에 저장하여 모든 곳에서 일관된 값 사용
            GLOBAL_TRACK_WIDTH = validWidth;
            console.log('트랙 폭 업데이트:', validWidth, 'px');
        }
        
        return validWidth;
    }

    // 별도 함수로 말 완주 처리 (코드 정리 및 중복 방지)
    function handleHorseFinish(horse, horseElement, frameIndex) {
        if (!horse || !horseElement) return;
        
        // 이미 완주 처리된 말이면 무시
        if (horse.finishedDisplayed) return;
        
        console.log(`말 '${horse.name}' 완주!`);
        
        // 말 요소에 완주 클래스 추가
        horseElement.classList.add('finished');
        horseElement.classList.remove('near-finish');
        
        // 완주 시간 계산 (프레임 인덱스 기준)
        const finishTime = frameIndex / 60; // 60fps 기준으로 초 단위 변환
        horse.finishTime = horse.targetFinishTime || finishTime;
        
        // 완주 상태 표시
        horse.finishedDisplayed = true;
        
        // 완주한 말 수 계산 (순위 결정)
        const finishedHorses = horses.filter(h => h.finishedDisplayed).length;
        horse.actualRank = finishedHorses;
        
        console.log(`말 '${horse.name}' 완주, 시간: ${horse.finishTime.toFixed(2)}초, 순위: ${horse.actualRank}위`);
        
        // 완주 시간 표시
        const finishTimeElement = document.getElementById(`finish-time-${horse.id}`);
        if (finishTimeElement) {
            finishTimeElement.textContent = `${horse.finishTime.toFixed(2)}초 (${horse.actualRank}위)`;
            finishTimeElement.style.display = 'block';
        }
        
        // 서버에 완주 정보 전송 (서버 연결이 있을 때만)
        if (socket && socket.connected) {
            socket.emit('horse_finish', {
                horseId: horse.id,
                finishTime: horse.finishTime,
                rank: horse.actualRank
            });
            
            console.log('서버에 완주 정보 전송:', horse.id, horse.finishTime.toFixed(2), horse.actualRank);
        }
        
        // 레인 스타일 업데이트
        updateLaneStyle(horse, horseElement);
        
        // 순위표 업데이트
        updateRankingBoard();
        
        // 경기 결과에 추가 (아직 없는 경우)
        if (!raceResults.includes(horse)) {
            // 정확히 결승선을 넘었는지 먼저 확인
            const finishLine = GLOBAL_TRACK_WIDTH - 45;
            if (parseFloat(horseElement.style.left) >= finishLine) {
                raceResults.push(horse);
                console.log(`말 '${horse.name}' 레이스 결과에 추가됨, 현재 결과 수: ${raceResults.length}`);
            }
        }
        
        // 모든 말이 완주했는지 확인
        const allHorsesFinished = horses.every(h => h.finishedDisplayed);
        if (allHorsesFinished) {
            console.log('모든 말이 완주했습니다. 결과 표시 준비 중...');
            
            // 1초 후 결과 패널 표시
            setTimeout(() => {
                finishRace();
            }, 1000);
        }
    }

    // 완주한 말의 레인 스타일 업데이트
    function updateLaneStyle(horse, horseElement) {
        const raceLane = horseElement.parentElement;
        if (!raceLane) return;
        
        // 완주한 레인 스타일 적용
        raceLane.classList.add('finished-lane');
        
        // 순위에 따른 색상 적용
        if (horse.actualRank === 1) {
            raceLane.classList.add('first-rank');
        } else if (horse.actualRank === 2) {
            raceLane.classList.add('second-rank');
        } else if (horse.actualRank === 3) {
            raceLane.classList.add('third-rank');
        }
        
        // 이미 레인 결과 요소가 있다면 제거
        const existingResult = raceLane.querySelector('.lane-result');
        if (existingResult) {
            raceLane.removeChild(existingResult);
        }
        
        // 레인에 결과 표시
        const laneResultElement = document.createElement('div');
        laneResultElement.className = 'lane-result';
        laneResultElement.innerHTML = `
            <span class="lane-horse-name">${horse.name}</span>
            <span class="lane-finish-rank">${horse.actualRank}위</span>
            <span class="lane-finish-time">${horse.finishTime.toFixed(2)}초</span>
            <span class="lane-horse-odds">${Number.isInteger(horse.odds) ? horse.odds + '.0' : horse.odds}배</span>
        `;
        
        // 이름과 배당률 숨기기
        const horseName = horseElement.querySelector('.horse-name');
        const horseOdds = horseElement.querySelector('.horse-odds');
        
        if (horseName) horseName.style.display = 'none';
        if (horseOdds) horseOdds.style.display = 'none';
        
        // 결과 요소 추가
        raceLane.appendChild(laneResultElement);
    }

    // 진행 표시줄 보이기 함수
    function showRaceProgressBar() {
        if (raceProgressContainer) {
            raceProgressContainer.style.display = 'flex';
        }
    }

    // 진행 표시줄 숨기기 함수
    function hideRaceProgressBar() {
        if (raceProgressContainer) {
            raceProgressContainer.style.display = 'none';
        }
        
        // 진행 타이머 정리
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
    }

    // 베팅 취소 함수
    function cancelBet(betId) {
        // 로그인 상태 확인
        if (!currentUser || !currentUser.id || currentUser.isGuest) {
            alert('로그인이 필요합니다.');
            return;
        }
        
        // 게임 단계 확인
        if (gamePhase !== 'betting') {
            alert('베팅 단계에서만 취소할 수 있습니다.');
            return;
        }
        
        // 취소할 베팅 ID 확인
        if (!betId) {
            console.error('취소할 베팅 ID가 없습니다.');
            return;
        }
        
        // 소켓으로 베팅 취소 요청 전송
        socket.emit('cancel_bet', { betId });
        
        console.log('베팅 취소 요청 전송:', betId);
        
        // 취소 결과는 cancel_bet_response 이벤트에서 처리됨
    }

    // 알림 시스템 추가
    let notificationQueue = [];
    let notificationDisplayed = false;

    // 알림 표시 함수
    function showNotification(message, type = 'info', duration = 3000) {
        // 알림 객체 생성
        const notification = {
            message: message,
            type: type,
            duration: duration
        };
        
        // 큐에 추가
        notificationQueue.push(notification);
        
        // 알림 처리 시작
        processNotificationQueue();
    }

    // 알림 큐 처리 함수
    function processNotificationQueue() {
        // 이미 표시 중이거나 큐가 비어있으면 종료
        if (notificationDisplayed || notificationQueue.length === 0) {
            return;
        }
        
        // 큐에서 다음 알림 가져오기
        const notification = notificationQueue.shift();
        notificationDisplayed = true;
        
        // 알림 요소가 없으면 생성
        let notificationElement = document.getElementById('game-notification');
        if (!notificationElement) {
            notificationElement = document.createElement('div');
            notificationElement.id = 'game-notification';
            document.body.appendChild(notificationElement);
            
            // 스타일 추가
            const style = document.createElement('style');
            style.textContent = `
                #game-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 15px 20px;
                    border-radius: 5px;
                    font-size: 16px;
                    z-index: 9999;
                    opacity: 0;
                    transition: opacity 0.3s ease-in-out;
                    max-width: 300px;
                    word-wrap: break-word;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                }
                #game-notification.info {
                    background-color: #2196F3;
                    color: white;
                }
                #game-notification.success {
                    background-color: #4CAF50;
                    color: white;
                }
                #game-notification.error {
                    background-color: #F44336;
                    color: white;
                }
                #game-notification.warning {
                    background-color: #FF9800;
                    color: white;
                }
            `;
            document.head.appendChild(style);
        }
        
        // 알림 내용과 스타일 설정
        notificationElement.textContent = notification.message;
        notificationElement.className = notification.type;
        
        // 알림 표시
        notificationElement.style.opacity = '1';
        
        // 지정된 시간 후에 알림 숨김
        setTimeout(() => {
            notificationElement.style.opacity = '0';
            // 알림이 사라진 후 플래그 초기화 및 다음 알림 처리
            setTimeout(() => {
                notificationDisplayed = false;
                processNotificationQueue();
            }, 300); // 페이드 아웃 트랜지션 시간
        }, notification.duration);
    }

    // 개별 말 위치 업데이트 함수 (새로 작성)
    function updateHorsePosition(horse, currentFrameIndex, isImmediate = false) {
        if (!horse) return;
        
        // 말 요소 찾기
        const horseElement = document.getElementById(`horse-${horse.id}`);
        if (!horseElement) return;
        
        // 완주한 말은 건너뛰기
        if (horse.finishedDisplayed) return;
        
        // 현재 위치 가져오기 (NaN 방지)
        const currentPosition = parseFloat(horseElement.style.left?.replace("px", "")) || 40;
        
        let targetPosition = 0;
        
        // 프레임 인덱스가 유효한지 확인 (최대 프레임 인덱스 = RACE_TIME * 60)
        const validFrameIndex = Math.min(currentFrameIndex, RACE_TIME * 60 - 1);
        if (validFrameIndex < 0) {
            targetPosition = 40; // 시작 위치
        } 
        // 서버 프레임 데이터 확인
        else if (horse.frames && Array.isArray(horse.frames) && validFrameIndex < horse.frames.length) {
            // 프레임 데이터에서 위치 가져오기
            targetPosition = horse.frames[validFrameIndex] + 40; // 40px은 레인 좌측 여백
        } else if (horsesFrameData && horsesFrameData[horse.id] && 
                   Array.isArray(horsesFrameData[horse.id]) && 
                   validFrameIndex < horsesFrameData[horse.id].length) {
            // 전역 프레임 데이터에서 위치 가져오기
            targetPosition = horsesFrameData[horse.id][validFrameIndex] + 40;
        } else if (horse.serverPosition !== undefined) {
            // 서버 위치 데이터가 있으면 사용
            targetPosition = horse.serverPosition + 40;
        } else {
            // 프레임 데이터가 없는 경우, 배당률 기반으로 위치 계산
            // 배당률이 낮을수록 빠른 속도로 이동
            const speedFactor = 1 / Math.max(1, horse.odds);
            const maxSpeed = 5;
            const baseSpeed = 2;
            const speed = baseSpeed + (speedFactor * maxSpeed);
            
            // 현재 프레임 위치에 맞게 위치 계산
            const frameProgress = Math.min(1.0, validFrameIndex / (RACE_TIME * 60));
            const targetProgress = calculateBezierCurve(frameProgress);
            targetPosition = targetProgress * GLOBAL_TRACK_WIDTH + 40;
        }
        
        // 현재 위치와 목표 위치의 차이가 너무 크면(순간이동 방지)
        const maxJump = 30; // 최대 허용 이동 거리
        if (Math.abs(targetPosition - currentPosition) > maxJump && !isImmediate) {
            // 최대 이동 거리로 제한
            if (targetPosition > currentPosition) {
                targetPosition = currentPosition + maxJump;
            } else {
                targetPosition = currentPosition - maxJump;
            }
        }
        
        // 현재 위치 저장
        horse.position = targetPosition - 40; // 40px 여백 제외한 실제 위치
        
        // 즉시 업데이트 또는 부드러운 이동 애니메이션
        if (isImmediate) {
            // 즉시 업데이트 (트랜지션 없음)
            horseElement.style.transition = 'none';
            horseElement.style.left = `${targetPosition}px`;
            
            // 50ms 후에 트랜지션 복원
            setTimeout(() => {
                horseElement.style.transition = 'left 0.15s linear';
            }, 50);
        } else {
            // 부드러운 이동 (트랜지션 적용)
            horseElement.style.transition = 'left 0.15s linear';
            horseElement.style.left = `${targetPosition}px`;
        }
        
        // 완주 판정 (트랙 폭의 95% 이상 진행 시)
        const horseWidth = horseElement.offsetWidth || 100; // 말 요소의 폭 고려
        const finishLine = GLOBAL_TRACK_WIDTH - horseWidth; // 말 아이콘 크기 고려한 결승선
        
        // 말이 결승선에 충분히 가까워졌는지 확인
        if (horse.position >= finishLine - horseWidth * 0.5) {
            // 근접 표시 (아직 완주하지 않은 경우)
            if (!horse.nearFinish) {
                horse.nearFinish = true;
                horseElement.classList.add('near-finish');
            }
            
            // 결승선을 완전히 통과했는지 확인
            if (horse.position >= finishLine) {
                // 경주 중일 때만 완주 처리
                if (gamePhase === 'racing' && !horse.finishedDisplayed) {
                    // 완주 시간 계산 (프레임 인덱스 기준)
                    handleHorseFinish(horse, horseElement, currentFrameIndex);
                }
            }
        }
        
        return horse.position;
    }

    // 말 이동 함수 개선 - style.left 파싱 문제 해결
    function moveHorse(horse, distance) {
        if (!horse || !horse.style) return;
        
        // style.left가 빈 문자열이거나 undefined일 때 발생하는 NaN 문제 해결
        const currentPosition = parseFloat(horse.style.left?.replace("px", "")) || 0;
        
        // 새 위치 계산 및 음수 방지
        const newPosition = Math.max(0, currentPosition + distance);
        
        // 새 위치 적용
        horse.style.left = `${newPosition}px`;
        
        return newPosition;
    }
}); 