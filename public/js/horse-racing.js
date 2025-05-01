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
        
        // 현재 서버 시간을 기준으로 주기 내 위치 계산
        const serverTime = getServerTime();
        
        // 현재 시간이 주기 내 어디에 위치하는지 계산
        if (!cycleStartTime) {
            console.error('주기 시작 시간이 설정되지 않았습니다.');
            return;
        }
        
        const elapsedTime = serverTime - cycleStartTime;
        const timeInCycle = elapsedTime % (TOTAL_CYCLE * 1000);
        
        // 주기 내에서 베팅 단계인지 경주 단계인지 결정
        const isRacingPhase = timeInCycle >= BETTING_TIME * 1000;
        gamePhase = isRacingPhase ? 'racing' : 'betting';
        
        console.log(`현재 주기 시작 시간: ${new Date(cycleStartTime).toLocaleTimeString()}`);
        console.log(`경과 시간: ${Math.floor(elapsedTime / 1000)}초, 주기 내 위치: ${Math.floor(timeInCycle / 1000)}초`);
        console.log(`현재 단계: ${gamePhase}`);
            
            // 말 데이터 요청
            requestHorseData();
        
        // 초기에는 서버 시간으로 동기화
        localTimerMode = false;
        
        if (gamePhase === 'betting') {
            // 베팅 단계
            const timeToRace = BETTING_TIME * 1000 - timeInCycle;
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
        } else {
            // 경주 단계
            const racingElapsedTime = timeInCycle - BETTING_TIME * 1000; // 레이싱 단계에서 경과된 시간
            const remainingRaceTime = Math.max(0, RACE_TIME * 1000 - racingElapsedTime); // 남은 레이싱 시간
            const timeToNextCycle = (TOTAL_CYCLE * 1000) - timeInCycle;
            
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
            simulateExistingRace(racingElapsedTime);
            
            // 다음 주기 시작 시간에 맞춰 타이머 설정
            const nextCycleTimer = setTimeout(() => {
                gamePhase = 'betting';
                // 로컬 타이머 모드로 전환
                localTimerMode = true;
                localTimerStart = Date.now();
                requestHorseData();
                showBettingUI();
                hideRaceProgressBar();
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
        if (secondsLeft <= 0) {
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
        
        // 서버 시간 기준으로 타이머 설정
        const serverCurrentTime = getServerTime(); // 현재 서버 시간
        const timerEndTime = isRacingPhase ? 
            (raceStartTime + RACE_TIME * 1000) : // 레이싱 단계면 레이스 시작 시간 + 레이싱 시간
            (serverCurrentTime + secondsLeft * 1000); // 베팅 단계면 현재 시간 + 남은 시간
        
        console.log(`타이머 설정: 종료 시간 ${new Date(timerEndTime).toLocaleTimeString()}, 남은 시간: ${secondsLeft}초`);
        
        // 타이머 시작 (60ms 간격으로 업데이트하여 부드럽게 표시)
        countdownInterval = setInterval(() => {
            // 현재 서버 시간 기준으로 남은 시간 계산
            const currentServerTime = getServerTime();
            const remainingMs = timerEndTime - currentServerTime;
            const remainingSeconds = Math.ceil(remainingMs / 1000); // 초 단위로 변환하고 올림
            
            // 시간 표시 업데이트
            updateTimerDisplay(Math.max(0, remainingSeconds));
            
            // 시간이 다 되면 다음 단계로 전환
            if (remainingMs <= 0) {
                clearInterval(countdownInterval);
                
                // 현재 로컬 단계에 따라 다음 단계로 전환
                if (isRacingPhase) {
                    gamePhase = 'betting';
                    hideRaceProgressBar();
                    
                    // 서버에 데이터 요청 (새 게임)
                    requestHorseData();
                    showBettingUI();
                    updateRemainingTime(BETTING_TIME, false);
                } else {
                    gamePhase = 'racing';
                    startRaceProgressBar();
                    
                    // 경주 시작
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
                const odds = (Math.random() * 8.5 + 1.5).toFixed(1);
                
                horses.push({
                    id: i + 1,
                    name: horseNames[i],
                    odds: parseFloat(odds),
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
                const odds = (Math.random() * 8.5 + 1.5).toFixed(1);
                horses.push({
                    id: i + 1,
                    name: horseNames[i],
                    odds: parseFloat(odds),
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
        
        // 각 말에 대해 레인 생성
        horses.forEach((horse, index) => {
            if (!horse) {
                console.error('유효하지 않은 말 데이터:', horse, 'index:', index);
                return;
            }
            
            console.log(`말 렌더링: ${horse.name}, ID: ${horse.id}, 레인: ${index}`);
            
            // 레인이 정의되지 않은 경우 인덱스로 대체
            if (horse.lane === undefined) {
                horse.lane = index;
            }
            
            const lane = document.createElement('div');
            lane.className = 'race-lane';
            
            // 이미 완주한 말인 경우 레인에 순위 표시
            if (horse.finishTime && horse.actualRank) {
                lane.classList.add('finished-lane');
                
                // 순위에 따른 색상 적용
                if (horse.actualRank === 1) {
                    lane.classList.add('first-rank');
                } else if (horse.actualRank === 2) {
                    lane.classList.add('second-rank');
                } else if (horse.actualRank === 3) {
                    lane.classList.add('third-rank');
                }
                
                // 레인에 순위 표시
                const laneRankElement = document.createElement('div');
                laneRankElement.className = 'lane-rank';
                laneRankElement.textContent = `${horse.actualRank}위`;
                lane.appendChild(laneRankElement);
            }
            
            const laneNumber = document.createElement('span');
            laneNumber.className = 'lane-number';
            laneNumber.textContent = horse.lane + 1;
            
            const horseElement = document.createElement('div');
            horseElement.className = 'horse';
            horseElement.id = `horse-${horse.id}`;
            // 초기 위치 설정 (40px는 레인의 왼쪽 여백)
            horseElement.style.left = `${(horse.position || 0) + 40}px`;
            
            // 말 아이콘 다시 추가
            const horseIcon = document.createElement('span');
            horseIcon.className = 'horse-icon';
            horseIcon.innerHTML = '<i class="fas fa-horse"></i>';
            
            const horseName = document.createElement('span');
            horseName.className = 'horse-name';
            horseName.textContent = horse.name;
            
            // 말 아이콘과 이름만 표시 (완주 시간 요소는 제외)
            horseElement.appendChild(horseIcon);
            horseElement.appendChild(horseName);
            
            lane.appendChild(laneNumber);
            lane.appendChild(horseElement);
            
            raceTrack.appendChild(lane);
        });
        
        console.log('말 렌더링 완료');
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
            odds.textContent = `${horse.odds}x`;
            
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
                alert(`최대 ${maxSelections}마리까지 선택 가능합니다.`);
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
            alert(`${maxSelections}마리의 말을 선택해주세요.`);
        }
    }
    
    // 베팅 정보 업데이트
    function updateBetInfo() {
        const amount = parseInt(betAmountInput.value) || 0;
        
        // 선택된 말 정보 표시
        if (selectedBetType === 'quinella' || selectedBetType === 'trifecta' || selectedBetType === 'trifecta-place') {
            // 다중 선택 베팅
            const selectedNames = multiSelectedHorses.map(h => h.name).join(', ');
            selectedHorseText.textContent = selectedNames || '선택 없음';
        } else {
            // 단일 선택 베팅
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
            if (selectedBetType === 'quinella' && multiSelectedHorses.length === 2) {
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
                           (selectedBetType === 'place' && multiSelectedHorses.length >= 1) || 
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
        
        // 각 말들의 속도를 계산하여 반드시 RACE_TIME 내에 완주하도록 조정
        const minTimeToFinish = RACE_TIME * 0.4; // 최소 완주 시간은 24초 (레이스 시간의 40%)
        const maxTimeToFinish = RACE_TIME * 0.85; // 최대 완주 시간은 51초 (레이스 시간의 85%)
        
        // 실시간 순위표 초기화
        initializeRankingBoard();
        
        // 말들의 최종 도착 시간을 미리 결정 (겹치지 않게)
        const targetFinishTimes = [];
        
        // 배당률에 따라 말의 순위 결정 (낮은 배당률 = 빠른 말)
        const horsesWithOdds = [...horses].sort((a, b) => a.odds - b.odds);
        
        // 각 말마다 겹치지 않는 목표 완주 시간 설정
        horsesWithOdds.forEach((horse, index) => {
            // 시간 간격 계산 - 전체 가용 시간을 말 수로 나눔
            const timeRange = maxTimeToFinish - minTimeToFinish;
            const timePerHorse = timeRange / horses.length;
            
            // 기본 목표 시간 = 최소 시간 + (인덱스 * 말당 시간) + 약간의 랜덤성
            const baseFinishTime = minTimeToFinish + (index * timePerHorse);
            const randomFactor = Math.random() * (timePerHorse * 0.5); // 0 ~ 시간 간격의 절반까지 랜덤성 추가
            
            // 최종 목표 시간 (최대 시간을 넘지 않도록)
            const targetFinishTime = Math.min(maxTimeToFinish, baseFinishTime + randomFactor);
            targetFinishTimes.push(targetFinishTime);
        });
        
        // 각 말에 대한 위치 프레임 계산
        horsesWithOdds.forEach((horse, index) => {
            horse.frames = [];
            
            // 목표 완주 시간 설정
            const finalFinishTime = targetFinishTimes[index];
            horse.targetFinishTime = finalFinishTime;
            
            // 평균 속도 계산 (트랙 폭 / 완주 시간)
            const avgSpeed = trackWidth / (finalFinishTime * 60); // 초당 프레임 수 고려
            
            console.log(`말 '${horse.name}' 계산: 배당률=${horse.odds}, 목표 완주 시간=${finalFinishTime.toFixed(2)}초, 평균 속도=${avgSpeed.toFixed(2)}px/프레임`);
            
            // 기본 속도와 가속도 설정
            const baseSpeed = avgSpeed * 0.7; // 시작 속도는 평균의 70%
            const acceleration = avgSpeed * 0.6 / numFrames; // 가속도는 속도를 서서히 증가시키기 위한 값
            
            let pos = 0;
            let speed = baseSpeed;
            let previousSpeeds = [speed, speed, speed]; // 속도 평활화를 위한 이전 속도 기록
            
            for (let i = 0; i < numFrames; i++) {
                // 시간에 따른 속도 패턴 - 시작은 느리게, 중간은 빠르게, 마지막은 조금 느리게
                const timeProgress = i / numFrames;
                
                // 완주 시간 기반 보정 - 진도가 늦으면 속도 증가, 빠르면 감속
                const expectedPosition = (i / finalFinishTime / 60) * trackWidth;
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
                const targetFrame = Math.floor(finalFinishTime * 60);
                if (i === targetFrame - 1) {
                    pos = trackWidth;
                }
                
                pos = Math.min(pos, trackWidth); // 트랙 끝을 넘지 않도록
                
                horse.frames.push(pos);
                
                // 결승선 통과 시 완주 시간 기록
                if (pos >= trackWidth && !horse.finishTime) {
                    horse.finishTime = i / 60; // 초 단위로 변환
                    // 완주 시간이 최대 시간을 초과하지 않도록 제한
                    horse.finishTime = Math.min(horse.finishTime, maxTimeToFinish);
                    console.log(`시뮬레이션: ${horse.name} 결승선 통과! 시간: ${horse.finishTime.toFixed(2)}초`);
                    break; // 결승선 통과 후 더 이상 프레임 계산 불필요
                }
            }
            
            // 모든 프레임에 대해 항상 위치값이 있도록 보장
            if (horse.frames.length < numFrames) {
                const lastPos = horse.frames[horse.frames.length - 1] || trackWidth;
                while (horse.frames.length < numFrames) {
                    horse.frames.push(lastPos);
                }
            }
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
        console.log('애니메이션 시작. 시작 프레임:', startFrame);
        
        // 프레임 인덱스 초기화
        let frameIndex = startFrame;
        const totalFrames = RACE_TIME * 60; // 60fps로 60초 동안
        
        // 이전 애니메이션 중지
        if (raceAnimationId) {
            cancelAnimationFrame(raceAnimationId);
        }
        
        // 트랙 폭 다시 계산 (화면 크기 변경에 대응)
        const trackWidth = calculateTrackWidth();
        
        // 말 위치 정보 업데이트 주기 설정 (500ms마다 한 번)
        let lastPositionUpdateTime = Date.now();
        const positionUpdateInterval = 500; // 500ms마다 위치 정보 업데이트
        
        // 경주 진행 상태 표시기 시작
        if (!progressInterval) {
            // 시작 프레임이 0이 아니면 (이미 진행 중인 레이스) 경과 시간 반영
            const elapsedMsForProgress = startFrame > 0 ? (startFrame / 60) * 1000 : 0;
            startRaceProgressBar(elapsedMsForProgress);
        }
        
        // 애니메이션 프레임 함수
        function animate() {
            // 서버 시간 기준으로 현재 프레임 계산
            const currentServerTime = getServerTime();
            const elapsedMs = currentServerTime - raceStartTime;
            frameIndex = Math.floor(elapsedMs / (1000 / 60)); // 60fps로 변환
            
            // 레이스 종료 확인
            if (frameIndex >= totalFrames) {
                console.log('레이스 완료, 애니메이션 종료');
                cancelAnimationFrame(raceAnimationId);
                return;
            }
            
            // 각 말 위치 업데이트
            horses.forEach(horse => {
                // 서버에서 미리 계산된 프레임 데이터 사용
                if (horsesFrameData && horsesFrameData[horse.id] && frameIndex < horsesFrameData[horse.id].length) {
                    const position = horsesFrameData[horse.id][frameIndex];
                    horse.position = position;
                } 
                // 프레임 데이터가 없으면 클라이언트에서 계산
                else if (!horse.finishTime) {
                    // 기본 속도 기반 움직임 로직 (서버 데이터가 없을 때 대체)
                    if (!horse.speedData) {
                        // 배당률 기반으로 평균 속도 초기화
                        const weight = 1 / horse.odds;
                        const targetFinishTime = RACE_TIME * 0.9 - (weight * RACE_TIME * 0.2);
                        const avgSpeed = GLOBAL_TRACK_WIDTH / (targetFinishTime * 60);
                        
                        horse.speedData = {
                            currentSpeed: avgSpeed * 0.7,
                            avgSpeed: avgSpeed,
                            acceleration: avgSpeed * 0.4 / totalFrames,
                            previousSpeeds: [avgSpeed * 0.7, avgSpeed * 0.7, avgSpeed * 0.7]
                        };
                    }
                    
                    // 현재 프레임에 맞는 위치 계산
                    const timeProgress = frameIndex / totalFrames;
                    let speedMultiplier = 1.0;
                    
                    if (timeProgress < 0.2) {
                        speedMultiplier = 0.8 + timeProgress;
                    } else if (timeProgress > 0.7) {
                        speedMultiplier = 1.2 - ((timeProgress - 0.7) * 0.5);
                    }
                    
                    const moveAmount = (horse.speedData.avgSpeed * speedMultiplier) + 
                        (Math.random() * 0.4 - 0.2); // 약간의 랜덤성 추가
                    
                    horse.position += moveAmount;
                    horse.position = Math.min(horse.position, GLOBAL_TRACK_WIDTH);
                }
                
                // DOM 업데이트 - 부드러운 트랜지션을 위해 transition 속성 사용
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (horseElement) {
                    horseElement.style.transition = 'left 0.15s linear';
                    horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                    
                    // 결승선 근처에 도달했을 때 이름표가 결승선과 겹치지 않도록 조정
                    const finishLine = document.querySelector('.finish-line');
                    if (finishLine) {
                        const finishLinePosition = GLOBAL_TRACK_WIDTH + 40; // 결승선 위치 (40px는 초기 offset)
                        const distanceToFinish = finishLinePosition - (horse.position + 40);
                        
                        // 결승선 근처(30px 이내)에 도달했을 때 이름표 위치 조정
                        if (distanceToFinish < 30 && distanceToFinish >= 0) {
                            // 결승선 가까이 있을 때 말 이름표 위치 조정 (결승선 앞쪽으로 위치)
                            horseElement.style.transform = 'translateX(-50px)';
                        } else if (horse.position >= GLOBAL_TRACK_WIDTH) {
                            // 결승선 통과 후에는 결승선 뒤쪽으로 위치 조정
                            horseElement.style.transform = 'translateX(20px)';
                            horseElement.style.left = `${GLOBAL_TRACK_WIDTH + 40}px`; // 정확히 결승선에 위치
                        } else {
                            // 그 외에는 원래 위치로 복원
                            horseElement.style.transform = '';
                        }
                    }
                }
                
                // 결승선 통과 감지 및 처리
                if (horse.position >= GLOBAL_TRACK_WIDTH && !horse.finishedDisplayed) {
                    horse.finishedDisplayed = true; // 이미 표시됐음을 기록
                    
                    // 완주 시간은 서버에서 받은 값이 있으면 그것을 사용, 없으면 현재 프레임 기준으로 계산
                    const finishTime = horse.finishTime || (frameIndex / 60);
                    horse.finishTime = finishTime;
                    
                    // 순위 계산 (현재 완주한 말의 수 + 1)
                    const finishedHorseCount = horses.filter(h => h.finishedDisplayed).length;
                    horse.actualRank = finishedHorseCount;
                    
                    console.log(`${horse.name} 결승선 통과! 시간: ${finishTime.toFixed(2)}초, 순위: ${finishedHorseCount}위`);
                    
                    // 완주한 말에 애니메이션 효과 추가
                    horseElement.classList.add('finished');
                    
                    // 완주한 말의 레인 색상 변경
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
                        
                        // 레인에 순위 표시
                        const laneRankElement = document.createElement('div');
                        laneRankElement.className = 'lane-rank';
                        laneRankElement.textContent = `${finishedHorseCount}위`;
                        raceLane.appendChild(laneRankElement);
                    }
                    
                    // 서버에 완주 정보 전송
                    if (socket.connected) {
                        socket.emit('update_horse_position', {
                            horseId: horse.id,
                            position: horse.position,
                            finishTime: finishTime,
                            rank: finishedHorseCount
                        });
                    }
                    
                    // 순위표 업데이트
                    updateRankingBoard();
                }
            });
            
            // 주기적으로 말 위치 정보를 서버에 전송
            const currentTime = Date.now();
            if (currentTime - lastPositionUpdateTime >= positionUpdateInterval && socket.connected) {
                lastPositionUpdateTime = currentTime;
                
                // 각 말의 현재 위치 정보를 서버에 전송
                horses.forEach(horse => {
                    if (!horse.finishedDisplayed) { // 아직 완주하지 않은 말만 업데이트
                        socket.emit('update_horse_position', {
                            horseId: horse.id,
                            position: horse.position
                        });
                    }
                });
            }
            
            // 모든 말이 완주했는지 확인하고 경기 종료 처리
            const allFinished = horses.every(horse => horse.finishedDisplayed);
            if (allFinished && raceResults && raceResults.length > 0) {
                console.log('모든 말이 완주했습니다. 경기 종료.');
                cancelAnimationFrame(raceAnimationId);
                finishRace();
                return;
            }
            
            // 다음 프레임 요청
            raceAnimationId = requestAnimationFrame(animate);
        }
        
        // 애니메이션 시작
        raceAnimationId = requestAnimationFrame(animate);
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
        
        // 완주 시간에 따라 결과 정렬
        raceResults = [...horses].sort((a, b) => 
            (a.finishTime || Infinity) - (b.finishTime || Infinity)
        );
        
        // 완주 시간 최대값 제한
        const maxTimeToFinish = RACE_TIME * 0.85; // 최대 51초
        raceResults.forEach(horse => {
            if (horse.finishTime) {
                horse.finishTime = Math.min(horse.finishTime, maxTimeToFinish);
            }
        });
        
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
    }
    
    // 로컬 스토리지에서 사용자 정보 불러오기
    function loadUserInfo() {
        try {
            // 로컬 스토리지에 사용자 정보가 없으면 임시 정보 생성
            let userData = localStorage.getItem('user');
            if (!userData) {
                const tempUser = {
                    username: '게스트 사용자',
                    balance: 50000
                };
                localStorage.setItem('user', JSON.stringify(tempUser));
                userData = JSON.stringify(tempUser);
            }
            
            currentUser = JSON.parse(userData);
            console.log('로컬 스토리지 사용자 정보:', currentUser);
            
            if (!currentUser || !currentUser.username) {
                console.error('로그인 정보가 없습니다. 임시 계정을 생성합니다.');
                currentUser = {
                    username: '게스트 사용자',
                    balance: 50000
                };
                localStorage.setItem('user', JSON.stringify(currentUser));
            }
            
            // 사용자 정보 표시
            userNameElement.textContent = currentUser.username;
            updateUserBalance(currentUser.balance);
            
            return true;
        } catch (e) {
            console.error('저장된 사용자 정보 파싱 오류:', e);
            // 오류 시 임시 사용자 생성
            currentUser = {
                username: '게스트 사용자',
                balance: 50000
            };
            localStorage.setItem('user', JSON.stringify(currentUser));
            
            userNameElement.textContent = currentUser.username;
            updateUserBalance(currentUser.balance);
            
            return true;
        }
    }
    
    // 사용자 잔액 업데이트
    function updateUserBalance(balance) {
        if (currentUser) {
            currentUser.balance = balance;
            localStorage.setItem('user', JSON.stringify(currentUser));
            userBalanceElement.textContent = balance.toLocaleString() + ' 원';
        }
    }
    
    // 베팅 단계 UI 표시
    function showBettingUI() {
        raceStatusText.textContent = '베팅 진행 중';
        raceStatusText.className = 'betting-phase';
        resultPanel.style.display = 'none';
        document.querySelector('.betting-panel').style.display = 'flex';
        document.getElementById('current-bets-panel').style.display = 'block';
        placeBetButton.disabled = false;
        
        // 진행 표시기 초기화
        hideRaceProgressBar();
    }
    
    // 경주 단계 UI 표시
    function showRacingUI() {
        raceStatusText.textContent = '경주 진행 중';
        raceStatusText.className = 'racing-phase';
        resultPanel.style.display = 'none';
        document.querySelector('.betting-panel').style.display = 'none';
        document.getElementById('current-bets-panel').style.display = 'block';
        placeBetButton.disabled = true;
    }
    
    // 베팅 확정 함수
    function placeBet() {
        if (!selectedHorse || !selectedBetType || gamePhase !== 'betting') {
            alert('유효한 베팅을 선택해주세요.');
            return;
        }
        
        const amount = parseInt(betAmountInput.value);
        if (isNaN(amount) || amount <= 0) {
            alert('유효한 베팅 금액을 입력해주세요.');
            return;
        }
        
        if (amount > currentUser.balance) {
            alert('잔액이 부족합니다.');
            return;
        }
        
        // 베팅 정보 생성
        const betInfo = {
            type: selectedBetType,
            amount: amount,
            horses: selectedBetType === 'single' ? [selectedHorse] : multiSelectedHorses,
            odds: parseFloat(selectedOddsText.textContent.replace('x', '')) || selectedHorse.odds,
            potentialWin: parseInt(potentialWinText.textContent.replace(/,/g, '').replace('원', ''))
        };
        
        // 베팅 정보 저장
        currentBets.push(betInfo);
        
        // 잔액 업데이트 (즉시 차감)
        updateUserBalance(currentUser.balance - amount);
        
        // 베팅 내역 UI 업데이트
        updateBetsUI();
        
        // 베팅 폼 초기화
        resetBettingForm();
        
        // 서버에 베팅 정보 전송
        if (serverConnected) {
            socket.emit('horse_racing_bet', {
                username: currentUser.username,
                betType: betInfo.type,
                horseIds: betInfo.horses.map(h => h.id),
                amount: betInfo.amount
            });
        } else {
            alert('서버 연결이 불안정합니다. 베팅이 정상적으로 처리되지 않을 수 있습니다.');
        }
        
        alert('베팅이 완료되었습니다!');
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
        betsList.innerHTML = '';
        
        currentBets.forEach((bet, index) => {
            const betItem = document.createElement('li');
            betItem.className = 'bet-item';
            
            const betDetail = document.createElement('div');
            betDetail.className = 'bet-detail';
            
            const betType = document.createElement('div');
            betType.textContent = getBetTypeName(bet.type) + ': ' + bet.horses.map(h => h.name).join(', ');
            
            const betDetailType = document.createElement('div');
            betDetailType.className = 'bet-detail-type';
            betDetailType.textContent = `배당률 ${bet.odds.toFixed(1)}x`;
            
            betDetail.appendChild(betType);
            betDetail.appendChild(betDetailType);
            
            const betAmount = document.createElement('div');
            betAmount.className = 'bet-amount';
            betAmount.textContent = bet.amount.toLocaleString() + '원';
            
            const potentialWin = document.createElement('div');
            potentialWin.className = 'bet-potential-win';
            potentialWin.textContent = '예상: ' + bet.potentialWin.toLocaleString() + '원';
            
            betItem.appendChild(betDetail);
            betItem.appendChild(betAmount);
            betItem.appendChild(potentialWin);
            
            betsList.appendChild(betItem);
        });
        
        // 베팅 내역이 없으면 메시지 표시
        if (currentBets.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.className = 'bet-item';
            emptyMessage.textContent = '아직 베팅 내역이 없습니다.';
            betsList.appendChild(emptyMessage);
        }
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
                    alert(`축하합니다! ${getBetTypeName(bet.type)} 베팅에서 ${winAmount.toLocaleString()}원을 획득했습니다!`);
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
        if (!loadUserInfo()) return;
        
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
        
        // 창 크기 변경 시 트랙 폭 재계산
        window.addEventListener('resize', function() {
            calculateTrackWidth();
            // 말 위치 재조정
            horses.forEach(horse => {
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (horseElement) {
                    horseElement.style.left = `${horse.position + 40}px`;
                }
            });
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
        
        // 소켓 연결 이벤트
        socket.on('connect', function() {
            console.log('서버에 연결되었습니다.');
            syncServerTime();
        });
        
        // 경마 게임 상태 응답
        socket.on('race_state', function(data) {
            console.log('경마 게임 상태 수신:', data);
            
            // 주기 시작 시간 설정
            if (data.cycleStartTime) {
                cycleStartTime = data.cycleStartTime;
            }
            
            // 말 데이터가 있으면 설정
            if (data.horses && Array.isArray(data.horses)) {
                generateHorses(data.horses);
            }
            
            // 경기 단계 설정
            gamePhase = data.phase;
            
            // 레이스 시작 및 종료 시간 설정
            if (data.raceStartTime) {
                raceStartTime = data.raceStartTime;
            }
            if (data.raceEndTime) {
                raceEndTime = data.raceEndTime;
            }
            
            // 준비 단계나 레이싱 단계면 프레임 데이터 저장
            if ((data.phase === 'preparing' || data.phase === 'racing') && data.horsesFrameData) {
                horsesFrameData = data.horsesFrameData;
                GLOBAL_TRACK_WIDTH = data.trackWidth || GLOBAL_TRACK_WIDTH;
            }
            
            if (data.phase === 'racing') {
                showRacingUI();
                
                // 레이싱 시작 시간 설정 (서버에서 받은 경과 시간 반영)
                if (data.racingElapsedTime !== undefined) {
                    localTimerMode = true;
                    localTimerStart = Date.now() - data.racingElapsedTime;
                    localRaceStartTime = Date.now() - data.racingElapsedTime;
                    
                    // 말 위치 정보가 있다면 업데이트
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
                        console.log('서버에서 받은 말 위치 정보로 업데이트 완료');
                    }
                    
                    // 프레임 데이터가 있으면 애니메이션 시작
                    if (horsesFrameData && Object.keys(horsesFrameData).length > 0) {
                        // 현재 경과 시간에 해당하는 프레임 계산
                        const frameIndex = Math.floor(data.racingElapsedTime / 1000 * 60); // 60fps 기준
                        animateRace(frameIndex);
                    }
                    
                    // 경기가 이미 거의 종료된 경우
                    if (data.racingElapsedTime >= RACE_TIME * 1000 - 5000) {
                        console.log('경기가 이미 거의 종료되었습니다. 결과 표시');
                        // 경주 진행 상태 표시기에 완료 표시
                        raceProgressBar.style.width = '100%';
                        raceProgressText.textContent = '경기 종료!';
                        raceProgressPercentage.textContent = '100%';
                        
                        // 결과가 있으면 바로 표시
                        if (data.results && data.results.length > 0) {
                            raceResults = data.results;
                            finishRace();
            } else {
                            // 남은 시간 업데이트 (거의 끝남)
                            updateRemainingTime(Math.floor(Math.max(1, (RACE_TIME * 1000 - data.racingElapsedTime) / 1000)), true);
            }
                    } else {
                        // 경과 시간에 맞게 진행 상태 표시기 업데이트 및 경주 계속
                        startRaceProgressBar(data.racingElapsedTime);
            
            // 남은 시간 업데이트
            if (data.remainingTime) {
                            updateRemainingTime(data.remainingTime, true);
                        }
                    }
                }
            } else if (data.phase === 'preparing') {
                // 준비 단계 UI 표시
                showPreparingUI();
                startRaceProgressBar(0); // 준비 단계 진행 상태 표시 시작
                
                // 남은 시간 업데이트
                if (data.remainingTime) {
                    updateRemainingTime(data.remainingTime, false);
                }
            } else {
                showBettingUI();
                hideRaceProgressBar();
                
                // 남은 시간 업데이트
                if (data.remainingTime) {
                    updateRemainingTime(data.remainingTime, false);
                }
            }
            
            // 결과가 있으면 업데이트 (베팅 단계에서는 이전 결과 표시)
            if (data.results && data.results.length > 0 && data.phase === 'betting') {
                raceResults = data.results;
                updateRaceResult();
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
            
            gamePhase = 'racing';
            showRacingUI();
            
            // 경주 애니메이션 시작 (서버에서 미리 계산된 경로 데이터 사용)
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
                
                // 완주 시간 기준으로 결과 정렬
                raceResults = [...horses].sort((a, b) => 
                    (a.finishTime || Infinity) - (b.finishTime || Infinity)
                );
                
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
            if (data.username === currentUser.username) {
                updateUserBalance(data.balance);
            }
        });
        
        // 베팅 응답 이벤트
        socket.on('bet_response', function(data) {
            if (data.success) {
                updateUserBalance(data.newBalance);
                alert('베팅이 성공적으로 완료되었습니다!');
            } else {
                alert('베팅 실패: ' + data.message);
            }
        });
        
        // 베팅 상금 이벤트
        socket.on('horse_race_winnings', function(data) {
            console.log('경마 베팅 상금:', data);
            
            if (data.totalWinnings > 0) {
                updateUserBalance(data.newBalance);
                alert(`축하합니다! 총 ${data.totalWinnings.toLocaleString()}원의 상금을 획득했습니다!`);
            }
        });
        
        // 연결 오류 처리
        socket.on('connect_error', function(error) {
            console.error('소켓 연결 오류:', error);
            alert('서버 연결에 실패했습니다. 페이지를 새로고침하세요.');
        });
        
        console.log('소켓 이벤트 리스너 설정 완료');
        
        // 말 위치 업데이트 수신 (다른 클라이언트들의 업데이트)
        socket.on('horse_position_update', function(data) {
            if (data && data.horseId && data.position !== undefined) {
                // 말 위치 정보 업데이트
                const horse = horses.find(h => h.id === data.horseId);
                if (horse) {
                    horse.position = data.position;
                    
                    // 완주 시간이 있으면 업데이트
                    if (data.finishTime !== undefined) {
                        horse.finishTime = data.finishTime;
                        
                        // 완주 시간 표시 업데이트
                        const finishTimeElement = document.getElementById(`finish-time-${horse.id}`);
                        if (finishTimeElement) {
                            finishTimeElement.textContent = `${horse.finishTime.toFixed(2)}초`;
                            finishTimeElement.style.display = 'inline-block';
                        }
                        
                        // 완주한 말에 애니메이션 효과 추가
                        const horseElement = document.getElementById(`horse-${horse.id}`);
                        if (horseElement) {
                            horseElement.classList.add('finished');
                        }
                    }
                    
                    // DOM 업데이트
                    const horseElement = document.getElementById(`horse-${horse.id}`);
                    if (horseElement) {
                        horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                        
                        // 결승선 통과 후 이름표가 결승선과 겹치지 않도록 조정
                        if (horse.position >= GLOBAL_TRACK_WIDTH) {
                            horseElement.style.transform = 'translateX(20px)'; // 결승선 뒤쪽으로 위치 조정
                        }
                    }
                }
            }
        });
        
        // 경주 진행 상황 업데이트 수신
        socket.on('race_progress', function(data) {
            if (data && data.horsesPositions && gamePhase === 'racing') {
                // 말 위치 정보 업데이트
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
                
                // 경과 시간 표시 업데이트
                if (data.elapsedTime) {
                    const elapsedSeconds = Math.floor(data.elapsedTime / 1000);
                    console.log(`경주 진행 중: ${elapsedSeconds}초 경과`);
                }
            }
        });
    }
    
    // 준비 단계 UI 표시
    function showPreparingUI() {
        raceStatusText.textContent = '경주 준비 중';
        raceStatusText.className = 'preparing-phase';
        resultPanel.style.display = 'none';
        document.querySelector('.betting-panel').style.display = 'none';
        document.getElementById('current-bets-panel').style.display = 'block';
        placeBetButton.disabled = true;
        
        // 진행 표시기 업데이트
        showRaceProgressBar();
        raceProgressText.textContent = '경주 준비 중...';
    }
    
    // 준비 단계 진행 상태 표시 시작
    function startPreparingProgressBar() {
        // 진행률 표시기 표시 및 초기화
        raceProgressBar.style.width = '0%';
        raceProgressText.textContent = '경주 준비 중...';
        raceProgressPercentage.textContent = '0%';
        
        // 이전 타이머 제거
        if (progressInterval) {
            clearInterval(progressInterval);
        }
        
        // 준비 시작 시간 기준으로 진행률 업데이트 타이머 설정
        progressInterval = setInterval(() => {
            const now = Date.now();
            const elapsedMs = now - preparingStartTime;
            const totalPrepareTime = raceStartTime - preparingStartTime;
            const percentage = Math.min(100, Math.floor((elapsedMs / totalPrepareTime) * 100));
            
            // 진행률 업데이트
            raceProgressBar.style.width = `${percentage}%`;
            raceProgressPercentage.textContent = `${percentage}%`;
            
            // 경주 시작 카운트다운
            const secondsLeft = Math.ceil((raceStartTime - now) / 1000);
            
            if (secondsLeft <= 3) {
                raceProgressText.textContent = `경주 시작까지 ${secondsLeft}초!`;
                // 카운트다운 효과 추가
                const countdownEffect = document.createElement('div');
                countdownEffect.className = 'countdown-effect';
                countdownEffect.textContent = secondsLeft;
                document.body.appendChild(countdownEffect);
                
                // 효과 제거
                setTimeout(() => {
                    document.body.removeChild(countdownEffect);
                }, 900);
            } else {
                raceProgressText.textContent = '경주 준비 중...';
            }
            
            // 준비 시간이 끝나면 경주 시작
            if (now >= raceStartTime) {
                clearInterval(progressInterval);
                progressInterval = null;
                
                // 경주 진행 상태 표시기 시작 (0초부터)
                startRaceProgressBar(0);
            }
        }, 100);
    }

    // 추가 CSS 스타일 (카운트다운 효과)
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        @keyframes countdown {
            0% { transform: scale(3); opacity: 0; }
            20% { transform: scale(2); opacity: 1; }
            80% { transform: scale(1); opacity: 1; }
            100% { transform: scale(0.5); opacity: 0; }
        }
        
        .countdown-effect {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(2);
            font-size: 5rem;
            font-weight: bold;
            color: #ff5722;
            z-index: 1000;
            animation: countdown 1s forwards;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
        }
        
        .preparing-phase {
            background-color: #FF9800;
        }
    `;
    document.head.appendChild(styleElement);
    
    // 게임 초기화 호출
    initGame();

    // 트랙 폭 계산 함수
    function calculateTrackWidth() {
        const raceTrack = document.querySelector('.race-track');
        if (!raceTrack) return GLOBAL_TRACK_WIDTH || 1000; // 기본값 설정
        
        // 트랙 전체 폭 - 결승선 오프셋 - 초기 말 위치 오프셋(40px)
        const trackWidth = raceTrack.clientWidth - FINISH_LINE_OFFSET - 40;
        
        // 유효하지 않은 값이면 기본값 적용
        const validWidth = trackWidth > 0 ? trackWidth : 1000;
        
        // 글로벌 변수에 저장하여 모든 곳에서 일관된 값 사용
        GLOBAL_TRACK_WIDTH = validWidth;
        
        console.log('트랙 폭 계산:', validWidth, 'px');
        return validWidth;
    }
}); 