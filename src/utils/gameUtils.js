// 카드 생성 함수
function drawCard() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { value, suit };
}

// 핸드 값 계산 함수
function calculateHandValue(hand) {
  let value = hand.reduce((sum, card) => {
    if (card.value === 'J' || card.value === 'Q' || card.value === 'K') return sum + 0;
    if (card.value === 'A') return sum + 1;
    return sum + parseInt(card.value);
  }, 0) % 10;
  
  return value;
}

// 게임 결과 계산 함수
function calculateGameResult(choice, amount) {
  // 숫자로 변환 (문자열 또는 다른 타입이 들어올 경우 대비)
  let betAmount = 0;
  try {
    betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount < 0) {
      betAmount = 0;
    }
  } catch (e) {
    betAmount = 0;
  }
  
  // 카드 생성
  const playerCards = [drawCard(), drawCard()];
  const bankerCards = [drawCard(), drawCard()];
  
  // 초기 점수 계산
  let playerScore = calculateHandValue(playerCards);
  let bankerScore = calculateHandValue(bankerCards);
  
  // 추가 카드 규칙 적용
  if (playerScore <= 5) {
    playerCards.push(drawCard());
    playerScore = calculateHandValue(playerCards);
  }
  
  if (bankerScore <= 5) {
    bankerCards.push(drawCard());
    bankerScore = calculateHandValue(bankerCards);
  }
  
  // 승패 판정
  let isWin = false;
  let winAmount = 0;
  
  if ((playerScore > bankerScore && choice === 'player') || 
      (bankerScore > playerScore && choice === 'banker') || 
      (playerScore === bankerScore && choice === 'tie')) {
    isWin = true;
    if (choice === 'player') winAmount = betAmount;
    if (choice === 'banker') winAmount = betAmount * 0.95;
    if (choice === 'tie') winAmount = betAmount * 8;
  }
  
  return {
    playerCards,
    bankerCards,
    playerScore,
    bankerScore,
    isWin,
    winAmount
  };
}

module.exports = {
  drawCard,
  calculateHandValue,
  calculateGameResult
}; 