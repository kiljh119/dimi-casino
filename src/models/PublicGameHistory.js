const { supabase } = require('../config/database');

class PublicGameHistory {
    // 새 게임 기록 추가
    static async add(userId, username, choice, betAmount, result, winAmount, playerScore, bankerScore, playerCards, bankerCards) {
        return new Promise(async (resolve, reject) => {
            try {
                // 카드 정보는 JSON 문자열로 저장
                const playerCardsJson = JSON.stringify(playerCards || []);
                const bankerCardsJson = JSON.stringify(bankerCards || []);
                
                // 현재 시간으로 타임스탬프 추가하여 충돌 방지
                const timestamp = new Date();
                
                const { data, error } = await supabase
                    .from('public_game_history')
                    .insert([{
                        user_id: userId,
                        username,
                        choice,
                        bet_amount: betAmount,
                        result,
                        win_amount: winAmount,
                        player_score: playerScore,
                        banker_score: bankerScore,
                        player_cards: playerCardsJson,
                        banker_cards: bankerCardsJson,
                        created_at: timestamp
                    }])
                    .select();
                
                if (error) throw error;
                
                console.log('공개 게임 기록 저장 성공:', data[0].id);
                resolve(data[0].id);
            } catch (error) {
                console.error('게임 기록 저장 오류:', error);
                reject(error);
            }
        });
    }

    // 최근 게임 기록 가져오기
    static async getRecent(limit = 20) {
        return new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase
                    .from('public_game_history')
                    .select(`
                        id,
                        user_id,
                        username,
                        choice,
                        bet_amount,
                        result,
                        win_amount,
                        player_score,
                        banker_score,
                        player_cards,
                        banker_cards,
                        created_at
                    `)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                
                if (error) throw error;
                
                // 최신순으로 정렬
                const history = data.map(row => {
                    let playerCards = [];
                    let bankerCards = [];
                    
                    // JSON 문자열을 객체로 변환
                    try {
                        if (row.player_cards) {
                            playerCards = JSON.parse(row.player_cards);
                        }
                        if (row.banker_cards) {
                            bankerCards = JSON.parse(row.banker_cards);
                        }
                    } catch (error) {
                        console.error('카드 정보 파싱 오류:', error);
                    }
                    
                    return {
                        id: row.id,
                        userId: row.user_id,
                        username: row.username,
                        choice: row.choice,
                        betAmount: row.bet_amount,
                        result: row.result,
                        winAmount: row.win_amount,
                        playerScore: row.player_score,
                        bankerScore: row.banker_score,
                        playerCards: playerCards,
                        bankerCards: bankerCards,
                        time: new Date(row.created_at).getTime(),
                        isWin: row.result === 'win'
                    };
                });
                
                resolve(history);
            } catch (error) {
                console.error('게임 기록 조회 오류:', error);
                reject(error);
            }
        });
    }

    // 특정 사용자의 게임 기록 가져오기
    static async getUserHistory(userId, limit = 10) {
        return new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase
                    .from('public_game_history')
                    .select(`
                        id,
                        user_id,
                        username,
                        choice,
                        bet_amount,
                        result,
                        win_amount,
                        player_score,
                        banker_score,
                        player_cards,
                        banker_cards,
                        created_at
                    `)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                
                if (error) throw error;
                
                const history = data.map(row => {
                    let playerCards = [];
                    let bankerCards = [];
                    
                    // JSON 문자열을 객체로 변환
                    try {
                        if (row.player_cards) {
                            playerCards = JSON.parse(row.player_cards);
                        }
                        if (row.banker_cards) {
                            bankerCards = JSON.parse(row.banker_cards);
                        }
                    } catch (error) {
                        console.error('카드 정보 파싱 오류:', error);
                    }
                    
                    return {
                        id: row.id,
                        userId: row.user_id,
                        username: row.username,
                        choice: row.choice,
                        betAmount: row.bet_amount,
                        result: row.result,
                        winAmount: row.win_amount,
                        playerScore: row.player_score,
                        bankerScore: row.banker_score,
                        playerCards: playerCards,
                        bankerCards: bankerCards,
                        time: new Date(row.created_at).getTime(),
                        isWin: row.result === 'win'
                    };
                });
                
                resolve(history);
            } catch (error) {
                console.error('사용자 게임 기록 조회 오류:', error);
                reject(error);
            }
        });
    }

    // 게임 기록 삭제 (관리자용)
    static async delete(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, count } = await supabase
                    .from('public_game_history')
                    .delete()
                    .eq('id', id)
                    .select('count');
                
                if (error) throw error;
                
                resolve(count > 0);
            } catch (error) {
                console.error('게임 기록 삭제 오류:', error);
                reject(error);
            }
        });
    }

    // 모든 게임 기록 삭제 (관리자용)
    static async deleteAll() {
        return new Promise(async (resolve, reject) => {
            try {
                const { error } = await supabase
                    .from('public_game_history')
                    .delete()
                    .gte('id', 0);  // 모든 레코드 지우기
                
                if (error) throw error;
                
                resolve(true);
            } catch (error) {
                console.error('모든 게임 기록 삭제 오류:', error);
                reject(error);
            }
        });
    }

    // ID로 게임 기록 조회
    static async getById(id) {
        return new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase
                    .from('public_game_history')
                    .select(`
                        id,
                        user_id,
                        username,
                        choice,
                        bet_amount,
                        result,
                        win_amount,
                        player_score,
                        banker_score,
                        player_cards,
                        banker_cards,
                        created_at
                    `)
                    .eq('id', id)
                    .single();
                
                if (error) {
                    if (error.code === 'PGRST116') { // Record Not Found
                        return resolve(null);
                    }
                    throw error;
                }
                
                if (!data) {
                    return resolve(null);
                }
                
                let playerCards = [];
                let bankerCards = [];
                
                // JSON 문자열을 객체로 변환
                try {
                    if (data.player_cards) {
                        playerCards = JSON.parse(data.player_cards);
                    }
                    if (data.banker_cards) {
                        bankerCards = JSON.parse(data.banker_cards);
                    }
                } catch (error) {
                    console.error('카드 정보 파싱 오류:', error);
                }
                
                const result = {
                    id: data.id,
                    userId: data.user_id,
                    username: data.username,
                    choice: data.choice,
                    betAmount: data.bet_amount,
                    result: data.result,
                    winAmount: data.win_amount,
                    playerScore: data.player_score,
                    bankerScore: data.banker_score,
                    playerCards: playerCards,
                    bankerCards: bankerCards,
                    time: new Date(data.created_at).getTime(),
                    isWin: data.result === 'win'
                };
                
                resolve(result);
            } catch (error) {
                console.error('게임 기록 조회 오류:', error);
                reject(error);
            }
        });
    }
}

module.exports = PublicGameHistory; 