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
    
    // 게임 상수
    const BETTING_TIME = 120; // 2분
    const RACE_TIME = 60; // 1분
    const TOTAL_CYCLE = BETTING_TIME + RACE_TIME; // 3분
    const TRACK_WIDTH = raceTrack.clientWidth - 80; // 트랙 폭(finish line 앞까지)
    
    // 게임 상태 변수
    let currentUser = null;
    let horses = [];
    let serverTimeOffset = 0;
    let gamePhase = 'betting'; // 'betting' 또는 'racing'
    let selectedHorse = null;
    let selectedBetType = null;
    let currentBets = [];
    let raceResults = [];
    let multiSelectedHorses = [];
    let raceAnimationId = null;
    let serverConnected = false;
    let gameInitialized = false;
    
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
    
    // 게임 주기 초기화 (3분마다 한 번씩 경기)
    function initGameCycle() {
        console.log('게임 주기 초기화 중...');
        
        // 현재 서버 시간을 기준으로 다음 경기 시작 시간 계산
        const serverTime = getServerTime();
        const millisInCycle = TOTAL_CYCLE * 1000;
        
        // 현재 시간이 주기 내 어디에 위치하는지 계산
        const timeInCycle = serverTime % millisInCycle;
        
        // 주기 내에서 베팅 단계인지 경주 단계인지 결정
        if (timeInCycle < BETTING_TIME * 1000) {
            // 베팅 단계
            gamePhase = 'betting';
            const timeToRace = BETTING_TIME * 1000 - timeInCycle;
            console.log('베팅 단계. 경주 시작까지:', Math.floor(timeToRace / 1000), '초');
            
            // 말 데이터 요청
            requestHorseData();
            
            // 베팅 UI 표시
            showBettingUI();
            
            // 경주 시작 시간에 맞춰 타이머 설정
            setTimeout(() => {
                startRace();
            }, timeToRace);
            
            // 매 초마다 남은 시간 업데이트
            updateRemainingTime(Math.floor(timeToRace / 1000));
        } else {
            // 경주 단계
            gamePhase = 'racing';
            const timeToNextCycle = millisInCycle - timeInCycle;
            console.log('경주 단계. 다음 주기까지:', Math.floor(timeToNextCycle / 1000), '초');
            
            // 말 데이터 요청
            requestHorseData();
            
            // 경주 UI 표시
            showRacingUI();
            
            // 경주 시뮬레이션 시작
            simulateExistingRace(timeInCycle - BETTING_TIME * 1000);
            
            // 다음 주기 시작 시간에 맞춰 타이머 설정
            setTimeout(() => {
                requestHorseData();
                showBettingUI();
            }, timeToNextCycle);
            
            // 매 초마다 남은 시간 업데이트
            updateRemainingTime(Math.floor(timeToNextCycle / 1000), true);
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
        setTimeout(() => {
            if (horses.length === 0) {
                console.log('서버 응답 없음, 로컬에서 말 생성');
                generateHorses();
            }
        }, 5000);
    }
    
    // 남은 시간 업데이트 함수
    function updateRemainingTime(secondsLeft, isRacingPhase = false) {
        let intervalId = setInterval(() => {
            secondsLeft--;
            
            // 시간 형식 변환 (MM:SS)
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;
            timeRemainingElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // 경주 단계에서 다음 베팅 단계로 전환
            if (isRacingPhase && secondsLeft <= 0) {
                clearInterval(intervalId);
                gamePhase = 'betting';
                // 다음 베팅 단계 시작
                requestHorseData();
                showBettingUI();
                updateRemainingTime(BETTING_TIME);
            } 
            // 베팅 단계에서 경주 단계로 전환
            else if (!isRacingPhase && secondsLeft <= 0) {
                clearInterval(intervalId);
                gamePhase = 'racing';
                startRace();
                updateRemainingTime(RACE_TIME, true);
            }
        }, 1000);
    }
    
    // 말 생성 함수
    function generateHorses(serverHorses = null) {
        console.log('말 생성 중...');
        
        horses = [];
        
        // 서버에서 말 데이터를 받았으면 사용
        if (serverHorses && Array.isArray(serverHorses) && serverHorses.length > 0) {
            console.log('서버에서 받은 말 데이터 사용:', serverHorses);
            horses = serverHorses.map((horse, index) => ({
                id: horse.id || (index + 1),
                name: horse.name || horseNames[index],
                odds: horse.odds || parseFloat((Math.random() * 8.5 + 1.5).toFixed(1)),
                position: 0,
                lane: index,
                finishTime: null
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
        
        console.log('생성된 말 데이터:', horses);
        renderHorses();
        renderHorseOptions();
    }
    
    // 트랙에 말 렌더링
    function renderHorses() {
        console.log('말 렌더링 중...');
        
        // 기존 레인 제거
        while (raceTrack.firstChild) {
            if (raceTrack.lastChild.className !== 'finish-line') {
                raceTrack.removeChild(raceTrack.lastChild);
            } else {
                break;
            }
        }
        
        // 각 말에 대해 레인 생성
        horses.forEach(horse => {
            console.log(`말 렌더링: ${horse.name}, ID: ${horse.id}, 레인: ${horse.lane}`);
            
            const lane = document.createElement('div');
            lane.className = 'race-lane';
            
            const laneNumber = document.createElement('span');
            laneNumber.className = 'lane-number';
            laneNumber.textContent = horse.lane + 1;
            
            const horseElement = document.createElement('div');
            horseElement.className = 'horse';
            horseElement.id = `horse-${horse.id}`;
            horseElement.style.left = `${horse.position}px`;
            
            const horseIcon = document.createElement('span');
            horseIcon.className = 'horse-icon';
            horseIcon.innerHTML = '<i class="fas fa-horse"></i>';
            
            const horseName = document.createElement('span');
            horseName.className = 'horse-name';
            horseName.textContent = horse.name;
            
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
        horseList.innerHTML = '';
        
        horses.forEach(horse => {
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
                selectHorse(horse);
            });
            
            horseList.appendChild(option);
        });
    }
    
    // 말 선택 함수
    function selectHorse(horse) {
        // 베팅 유형에 따라 단일 또는 다중 선택
        if (!selectedBetType || selectedBetType === 'single') {
            // 단일 선택 (단승)
            selectedHorse = horse;
            
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
                
                // UI에서 선택 해제
                const opt = document.querySelector(`.horse-option[data-id="${horse.id}"]`);
                if (opt) opt.classList.remove('selected');
            } else if (multiSelectedHorses.length < maxSelections) {
                // 최대 선택 가능 수보다 적게 선택되어 있으면 추가
                multiSelectedHorses.push(horse);
                
                // UI에서 선택 표시
                const opt = document.querySelector(`.horse-option[data-id="${horse.id}"]`);
                if (opt) opt.classList.add('selected');
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
        
        // 말 선택 옵션 UI 초기화
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
        const trackWidth = raceTrack.clientWidth - 80; // 트랙 폭
        
        console.log(`트랙 폭: ${trackWidth}px, 총 프레임 수: ${numFrames}`);
        
        // 각 말에 대한 위치 프레임 계산
        horses.forEach(horse => {
            horse.frames = [];
            let pos = 0;
            let speed = horse.baseSpeed;
            
            console.log(`말 '${horse.name}' 속도 계산: 기본 속도=${horse.baseSpeed}`);
            
            for (let i = 0; i < numFrames; i++) {
                // 속도 업데이트 (가속도와 무작위성 적용)
                speed += horse.acceleration + (Math.random() * horse.jitter - horse.jitter/2);
                speed = Math.max(0.5, Math.min(8, speed)); // 속도 제한
                
                // 위치 업데이트
                pos += speed;
                pos = Math.min(pos, trackWidth); // 트랙 끝을 넘지 않도록
                
                horse.frames.push(pos);
                
                // 결승선 통과 시 완주 시간 기록
                if (pos >= trackWidth && !horse.finishTime) {
                    horse.finishTime = i / 60; // 초 단위로 변환
                    console.log(`시뮬레이션: ${horse.name} 결승선 통과! 시간: ${horse.finishTime.toFixed(2)}초`);
                }
            }
        });
        
        // 완주 시간 기준으로 등수 매기기
        raceResults = [...horses].sort((a, b) => a.finishTime - b.finishTime);
        
        console.log('경주 시뮬레이션 완료, 결과:', raceResults.map(h => `${h.name}: ${h.finishTime.toFixed(2)}초`).join(', '));
    }
    
    // 이미 진행 중인 경주 시뮬레이션 (중간에 페이지 로드 시)
    function simulateExistingRace(elapsedTime) {
        console.log(`진행 중인 경주 시뮬레이션. 경과 시간: ${elapsedTime/1000}초`);
        
        // 경주가 얼마나 진행되었는지 계산 (초 단위)
        const progress = elapsedTime / 1000;
        
        // 경주 결과 생성
        generateRaceResults();
        
        // 현재 진행 상황까지 말 위치 업데이트
        const frameIndex = Math.min(Math.floor(progress * 60), RACE_TIME * 60 - 1);
        
        console.log(`현재 프레임 인덱스: ${frameIndex}`);
        
        horses.forEach(horse => {
            if (frameIndex < horse.frames.length) {
                horse.position = horse.frames[frameIndex];
                const horseElement = document.getElementById(`horse-${horse.id}`);
                if (horseElement) {
                    console.log(`말 '${horse.name}' 위치 설정: ${horse.position}px`);
                    horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                } else {
                    console.error(`말 요소를 찾을 수 없음: horse-${horse.id}`);
                }
            }
        });
        
        // 나머지 시간 동안 애니메이션 계속
        animateRace(frameIndex);
    }
    
    // 경주 애니메이션 함수
    function animateRace(startFrame = 0) {
        console.log('애니메이션 시작. 시작 프레임:', startFrame);
        let frameIndex = startFrame;
        const totalFrames = RACE_TIME * 60; // 60fps로 60초 동안
        
        // 이전 애니메이션 중지
        if (raceAnimationId) {
            cancelAnimationFrame(raceAnimationId);
        }
        
        // 트랙 폭 다시 계산 (화면 크기 변경에 대응)
        const trackWidth = raceTrack.clientWidth - 80;
        
        // 애니메이션 프레임 함수
        function animate() {
            if (frameIndex < totalFrames) {
                // 각 말 위치 업데이트
                horses.forEach(horse => {
                    if (!horse.frames || frameIndex >= horse.frames.length) {
                        // 프레임 데이터가 없거나 부족한 경우 실시간 계산
                        if (!horse.speed) {
                            horse.speed = horse.baseSpeed || (Math.random() * 3 + 2);
                        }
                        
                        // 속도 업데이트 (가속도와 무작위성 적용)
                        horse.speed += (horse.acceleration || 0) + (Math.random() * 0.2 - 0.1);
                        horse.speed = Math.max(0.5, Math.min(8, horse.speed));
                        
                        // 위치 업데이트
                        horse.position += horse.speed;
                        horse.position = Math.min(horse.position, trackWidth);
                    } else {
                        // 미리 계산된 프레임 데이터 사용
                        const position = horse.frames[frameIndex];
                        horse.position = position;
                    }
                    
                    // DOM 업데이트
                    const horseElement = document.getElementById(`horse-${horse.id}`);
                    if (horseElement) {
                        horseElement.style.left = `${horse.position + 40}px`; // 40px는 초기 offset
                    }
                    
                    // 결승선 통과 확인
                    if (horse.position >= trackWidth && !horse.finishTime) {
                        horse.finishTime = frameIndex / 60; // 초 단위로 변환
                        console.log(`${horse.name} 결승선 통과! 시간: ${horse.finishTime.toFixed(2)}초`);
                    }
                });
                
                frameIndex++;
                raceAnimationId = requestAnimationFrame(animate);
            } else {
                // 애니메이션 종료 후 결과 표시
                finishRace();
            }
        }
        
        // 애니메이션 시작
        raceAnimationId = requestAnimationFrame(animate);
    }
    
    // 경주 종료 및 결과 표시
    function finishRace() {
        // 경기 결과 패널 표시
        resultPanel.style.display = 'block';
        
        // 경기 결과 목록 생성
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
    
    // 소켓 이벤트 리스너 설정
    function setupSocketListeners() {
        console.log('소켓 이벤트 리스너 설정 중...');
        
        // 서버 시간 응답 처리
        socket.on('server_time', function(data) {
            const serverTime = data.serverTime;
            const clientReceiveTime = Date.now();
            const latency = (clientReceiveTime - data.clientTime) / 2;
            serverTimeOffset = serverTime - (clientReceiveTime - latency);
            console.log('서버 시간 동기화 완료. 오프셋:', serverTimeOffset, 'ms');
            
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
            
            // 말 데이터가 있으면 설정
            if (data.horses && Array.isArray(data.horses)) {
                generateHorses(data.horses);
            }
            
            // 경기 단계 설정
            if (data.phase === 'racing') {
                gamePhase = 'racing';
                showRacingUI();
            } else {
                gamePhase = 'betting';
                showBettingUI();
            }
            
            // 남은 시간 업데이트
            if (data.remainingTime) {
                updateRemainingTime(data.remainingTime, data.phase === 'racing');
            }
            
            // 결과가 있으면 업데이트
            if (data.results && data.results.length > 0) {
                raceResults = data.results;
                updateRaceResult();
            }
        });
        
        // 새 경마 게임 시작 이벤트
        socket.on('new_race', function(data) {
            console.log('새 경마 게임 시작:', data);
            
            if (data.horses && Array.isArray(data.horses)) {
                generateHorses(data.horses);
            }
            
            gamePhase = 'betting';
            showBettingUI();
            updateRemainingTime(BETTING_TIME);
        });
        
        // 경마 경주 시작 이벤트
        socket.on('race_start', function(data) {
            console.log('경마 경주 시작:', data);
            
            gamePhase = 'racing';
            showRacingUI();
            startRace();
        });
        
        // 경기 결과 이벤트
        socket.on('race_result', function(data) {
            console.log('경마 경주 결과:', data);
            
            if (data.results && Array.isArray(data.results)) {
                raceResults = data.results;
                updateRaceResult();
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
    
    // 게임 초기화 및 시작
    function initGame() {
        console.log('게임 초기화 시작...');
        
        // 사용자 정보 로드
        if (!loadUserInfo()) return;
        
        // 메뉴로 버튼 이벤트
        backToMenuButton.addEventListener('click', function() {
            window.location.href = '/menu.html';
        });
        
        // 직접 말 생성 및 게임 시작 (서버 연결 상태와 관계없이)
        generateHorses();
        showBettingUI();
        updateRemainingTime(BETTING_TIME);
        
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
        
        // 서버 시간 동기화 시도
        syncServerTime();
        
        console.log('게임 초기화 완료');
    }
    
    // 게임 초기화 호출
    initGame();
}); 