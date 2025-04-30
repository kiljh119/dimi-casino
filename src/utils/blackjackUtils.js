// 블랙잭 게임 유틸리티 함수

// 새 덱 생성
function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 1=A, 11=J, 12=Q, 13=K
    const deck = [];
    
    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }
    
    return shuffleDeck(deck);
}

// 덱 섞기
function shuffleDeck(deck) {
    const shuffled = [...deck];
    
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
}

// 카드 값 계산
function calculateHandValue(cards) {
    let sum = 0;
    let aceCount = 0;
    
    for (const card of cards) {
        if (card.value === 1) {
            sum += 11;
            aceCount++;
        } else if (card.value > 10) {
            sum += 10;
        } else {
            sum += card.value;
        }
    }
    
    // 합이 21을 초과하면 에이스를 1로 계산
    while (sum > 21 && aceCount > 0) {
        sum -= 10;
        aceCount--;
    }
    
    return sum;
}

// 딜러의 패 판단
function shouldDealerDraw(dealerCards) {
    const value = calculateHandValue(dealerCards);
    return value < 17;
}

// 블랙잭 여부 확인
function isBlackjack(cards) {
    return cards.length === 2 && calculateHandValue(cards) === 21;
}

// 게임 결과 판단
function determineResult(playerCards, dealerCards) {
    const playerValue = calculateHandValue(playerCards);
    const dealerValue = calculateHandValue(dealerCards);
    
    const playerBlackjack = isBlackjack(playerCards);
    const dealerBlackjack = isBlackjack(dealerCards);
    
    // 둘 다 블랙잭
    if (playerBlackjack && dealerBlackjack) {
        return 'push';
    }
    
    // 플레이어 블랙잭
    if (playerBlackjack) {
        return 'blackjack';
    }
    
    // 딜러 블랙잭
    if (dealerBlackjack) {
        return 'lose';
    }
    
    // 플레이어 버스트
    if (playerValue > 21) {
        return 'lose';
    }
    
    // 딜러 버스트
    if (dealerValue > 21) {
        return 'win';
    }
    
    // 값 비교
    if (playerValue > dealerValue) {
        return 'win';
    } else if (playerValue < dealerValue) {
        return 'lose';
    } else {
        return 'push';
    }
}

// 승리 금액 계산
function calculateWinAmount(bet, result) {
    switch (result) {
        case 'win':
            return bet * 2; // 원래 돈 + 이긴 돈
        case 'blackjack':
            return bet * 2.5; // 원래 돈 + 이긴 돈(1.5배)
        case 'push':
            return bet; // 원래 돈 반환
        case 'lose':
            return 0; // 잃음
        default:
            return 0;
    }
}

module.exports = {
    createDeck,
    shuffleDeck,
    calculateHandValue,
    shouldDealerDraw,
    isBlackjack,
    determineResult,
    calculateWinAmount
}; 