const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

// 채팅 메시지 테이블 생성
db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
`);

class ChatMessage {
    // 새 메시지 저장
    static async save(userId, username, message, isAdmin = false) {
        console.log(`메시지 저장: ${username}(${userId}): ${message}, 관리자: ${isAdmin}`);
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO chat_messages (user_id, username, message, is_admin)
                VALUES (?, ?, ?, ?)
            `;
            db.run(query, [userId, username, message, isAdmin ? 1 : 0], function(err) {
                if (err) {
                    console.error('메시지 저장 오류:', err);
                    return reject(err);
                }
                console.log('메시지 저장 성공, ID:', this.lastID);
                resolve(this.lastID);
            });
        });
    }

    // 최근 메시지 가져오기
    static async getRecent(limit = 50) {
        console.log(`최근 ${limit}개 메시지 조회 시작`);
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    id,
                    user_id as userId,
                    username,
                    message,
                    is_admin as isAdmin,
                    created_at as createdAt
                FROM chat_messages
                ORDER BY created_at DESC
                LIMIT ?
            `;
            db.all(query, [limit], (err, rows) => {
                if (err) {
                    console.error('메시지 조회 오류:', err);
                    return reject(err);
                }
                
                console.log(`${rows.length}개 메시지 조회 완료`);
                
                // 최신순으로 가져와서 역순으로 정렬 (오래된 메시지가 위로)
                const messages = rows.reverse().map(row => {
                    // 날짜 형식 정규화
                    let timestamp;
                    try {
                        timestamp = new Date(row.createdAt).getTime();
                    } catch (e) {
                        console.error('날짜 변환 오류:', e);
                        timestamp = Date.now();
                    }
                    
                    return {
                        id: row.id,
                        userId: row.userId,
                        sender: row.username,
                        message: row.message,
                        isAdmin: row.isAdmin === 1,
                        time: timestamp
                    };
                });
                
                console.log('메시지 변환 완료');
                resolve(messages);
            });
        });
    }

    // 메시지 삭제 (관리자용)
    static async delete(messageId) {
        console.log(`메시지 삭제 요청: ID ${messageId}`);
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM chat_messages WHERE id = ?', [messageId], function(err) {
                if (err) {
                    console.error('메시지 삭제 오류:', err);
                    return reject(err);
                }
                console.log(`메시지 삭제 결과: ${this.changes}개 삭제됨`);
                resolve(this.changes > 0);
            });
        });
    }

    // 모든 메시지 삭제 (관리자용)
    static async deleteAll() {
        console.log('모든 메시지 삭제 요청');
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM chat_messages', function(err) {
                if (err) {
                    console.error('모든 메시지 삭제 오류:', err);
                    return reject(err);
                }
                console.log(`모든 메시지 삭제 결과: ${this.changes}개 삭제됨`);
                resolve(this.changes);
            });
        });
    }
}

module.exports = ChatMessage; 