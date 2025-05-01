// 결승선 통과 확인
if (horse.position >= trackWidth && !horse.finishTime) {
    finishedHorseCount++;
    horse.finishTime = frameIndex / 60; // 초 단위로 변환
    // 완주 시간이 유효한 범위 내에 있도록 제한
    const maxTimeToFinish = RACE_TIME * 0.85; // 최대 51초
    horse.finishTime = Math.min(horse.finishTime, maxTimeToFinish);
    horse.actualRank = finishedHorseCount; // 실제 완주 순서 기록
    console.log(`${horse.name} 결승선 통과! 시간: ${horse.finishTime.toFixed(2)}초, 순위: ${horse.actualRank}위`);
    
    // 완주 시간 표시
    const finishTimeElement = document.getElementById(`finish-time-${horse.id}`);
    if (finishTimeElement) {
        finishTimeElement.textContent = `${horse.finishTime.toFixed(2)}초 (${horse.actualRank}위)`;
        finishTimeElement.style.display = 'inline-block';
    }
    
    // 순위 표시 요소 생성
    const rankElement = document.createElement('div');
    rankElement.className = 'horse-rank';
    rankElement.textContent = `${horse.actualRank}위`;
    
    // 기존 순위 요소가 있으면 제거
    const existingRank = horseElement.querySelector('.horse-rank');
    if (existingRank) {
        horseElement.removeChild(existingRank);
    }
    
    // 말 요소에 순위 추가
    horseElement.appendChild(rankElement);
    
    // 완주한 말에 애니메이션 효과 추가
    horseElement.classList.add('finished');
    
    // 완주한 말의 레인 색상 변경
    const raceLane = horseElement.parentElement;
    if (raceLane) {
        // 레인 색상 변경 (완주 순위에 따라 다른 색상)
        raceLane.classList.add('finished-lane');
        
        // 순위에 따른 색상 적용
        if (horse.actualRank === 1) {
            raceLane.classList.add('first-rank');
        } else if (horse.actualRank === 2) {
            raceLane.classList.add('second-rank');
        } else if (horse.actualRank === 3) {
            raceLane.classList.add('third-rank');
        }
        
        // 레인에 순위 표시
        const laneRankElement = document.createElement('div');
        laneRankElement.className = 'lane-rank';
        laneRankElement.textContent = `${horse.actualRank}위`;
        raceLane.appendChild(laneRankElement);
    }
    
    // 순위표 업데이트
    updateRankingBoard();
    
    // 완주 시간 서버에 전송
    if (socket.connected) {
        socket.emit('update_horse_position', {
            horseId: horse.id,
            position: horse.position,
            finishTime: horse.finishTime,
            rank: horse.actualRank
        });
    }
} 