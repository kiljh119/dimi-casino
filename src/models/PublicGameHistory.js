const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

// 공개 게임 기록 테이블 생성
db.run(`
    CREATE TABLE IF NOT EXISTS public_game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        choice TEXT NOT NULL,
        bet_amount REAL NOT NULL,
        result TEXT NOT NULL,
        win_amount REAL DEFAULT 0,
        player_score INTEGER NOT NULL,
        banker_score INTEGER NOT NULL,
        player_cards TEXT,
        banker_cards TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
`);

class PublicGameHistory {
    // 새 게임 기록 추가
    static async add(userId, username, choice, betAmount, result, winAmount, playerScore, bankerScore, playerCards, bankerCards) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO public_game_history (user_id, username, choice, bet_amount, result, win_amount, player_score, banker_score, player_cards, banker_cards)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            // 카드 정보는 JSON 문자열로 저장
            const playerCardsJson = JSON.stringify(playerCards || []);
            const bankerCardsJson = JSON.stringify(bankerCards || []);
            
            db.run(query, [userId, username, choice, betAmount, result, winAmount, playerScore, bankerScore, playerCardsJson, bankerCardsJson], function(err) {
                if (err) {
                    console.error('게임 기록 저장 오류:', err);
                    return reject(err);
                }
                console.log('공개 게임 기록 저장 성공:', this.lastID);
                resolve(this.lastID);
            });
        });
    }

    // 최근 게임 기록 가져오기
    static async getRecent(limit = 20) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id,
                    user_id as userId,
                    username,
                    choice,
                    bet_amount as betAmount,
                    result,
                    win_amount as winAmount,
                    player_score as playerScore,
                    banker_score as bankerScore,
                    player_cards as playerCardsJson,
                    banker_cards as bankerCardsJson,
                    created_at as createdAt
                FROM public_game_history
                ORDER BY created_at DESC
                LIMIT ?
            `;
            
            db.all(query, [limit], (err, rows) => {
                if (err) {
                    console.error('게임 기록 조회 오류:', err);
                    return reject(err);
                }
                
                // 최신순으로 정렬
                const history = rows.map(row => {
                    let playerCards = [];
                    let bankerCards = [];
                    
                    // JSON 문자열을 객체로 변환
                    try {
                        if (row.playerCardsJson) {
                            playerCards = JSON.parse(row.playerCardsJson);
                        }
                        if (row.bankerCardsJson) {
                            bankerCards = JSON.parse(row.bankerCardsJson);
                        }
                    } catch (error) {
                        console.error('카드 정보 파싱 오류:', error);
                    }
                    
                    return {
                        id: row.id,
                        userId: row.userId,
                        username: row.username,
                        choice: row.choice,
                        betAmount: row.betAmount,
                        result: row.result,
                        winAmount: row.winAmount,
                        playerScore: row.playerScore,
                        bankerScore: row.bankerScore,
                        playerCards: playerCards,
                        bankerCards: bankerCards,
                        time: new Date(row.createdAt).getTime(),
                        isWin: row.result === 'win'
                    };
                });
                
                resolve(history);
            });
        });
    }

    // 특정 사용자의 게임 기록 가져오기
    static async getUserHistory(userId, limit = 10) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id,
                    user_id as userId,
                    username,
                    choice,
                    bet_amount as betAmount,
                    result,
                    win_amount as winAmount,
                    player_score as playerScore,
                    banker_score as bankerScore,
                    player_cards as playerCardsJson,
                    banker_cards as bankerCardsJson,
                    created_at as createdAt
                FROM public_game_history
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `;
            
            db.all(query, [userId, limit], (err, rows) => {
                if (err) {
                    console.error('사용자 게임 기록 조회 오류:', err);
                    return reject(err);
                }
                
                const history = rows.map(row => {
                    let playerCards = [];
                    let bankerCards = [];
                    
                    // JSON 문자열을 객체로 변환
                    try {
                        if (row.playerCardsJson) {
                            playerCards = JSON.parse(row.playerCardsJson);
                        }
                        if (row.bankerCardsJson) {
                            bankerCards = JSON.parse(row.bankerCardsJson);
                        }
                    } catch (error) {
                        console.error('카드 정보 파싱 오류:', error);
                    }
                    
                    return {
                        id: row.id,
                        userId: row.userId,
                        username: row.username,
                        choice: row.choice,
                        betAmount: row.betAmount,
                        result: row.result,
                        winAmount: row.winAmount,
                        playerScore: row.playerScore,
                        bankerScore: row.bankerScore,
                        playerCards: playerCards,
                        bankerCards: bankerCards,
                        time: new Date(row.createdAt).getTime(),
                        isWin: row.result === 'win'
                    };
                });
                
                resolve(history);
            });
        });
    }

    // 게임 기록 삭제 (관리자용)
    static async delete(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM public_game_history WHERE id = ?', [id], function(err) {
                if (err) {
                    console.error('게임 기록 삭제 오류:', err);
                    return reject(err);
                }
                resolve(this.changes > 0);
            });
        });
    }

    // 모든 게임 기록 삭제 (관리자용)
    static async deleteAll() {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM public_game_history', function(err) {
                if (err) {
                    console.error('모든 게임 기록 삭제 오류:', err);
                    return reject(err);
                }
                resolve(this.changes);
            });
        });
    }

    // ID로 게임 기록 조회
    static async getById(id) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id,
                    user_id as userId,
                    username,
                    choice,
                    bet_amount as betAmount,
                    result,
                    win_amount as winAmount,
                    player_score as playerScore,
                    banker_score as bankerScore,
                    player_cards as playerCardsJson,
                    banker_cards as bankerCardsJson,
                    created_at as createdAt
                FROM public_game_history
                WHERE id = ?
            `;
            
            db.get(query, [id], (err, row) => {
                if (err) {
                    console.error('게임 기록 조회 오류:', err);
                    return reject(err);
                }
                
                if (!row) {
                    return resolve(null);
                }
                
                let playerCards = [];
                let bankerCards = [];
                
                // JSON 문자열을 객체로 변환
                try {
                    if (row.playerCardsJson) {
                        playerCards = JSON.parse(row.playerCardsJson);
                    }
                    if (row.bankerCardsJson) {
                        bankerCards = JSON.parse(row.bankerCardsJson);
                    }
                } catch (error) {
                    console.error('카드 정보 파싱 오류:', error);
                }
                
                // 데이터 형식 변환
                const gameHistory = {
                    id: row.id,
                    userId: row.userId,
                    username: row.username,
                    choice: row.choice,
                    betAmount: row.betAmount,
                    result: row.result,
                    winAmount: row.winAmount,
                    playerScore: row.playerScore,
                    bankerScore: row.bankerScore,
                    playerCards: playerCards,
                    bankerCards: bankerCards,
                    time: new Date(row.createdAt).getTime(),
                    isWin: row.result === 'win',
                    createdAt: row.createdAt
                };
                
                resolve(gameHistory);
            });
        });
    }
}

module.exports = PublicGameHistory; 