const { supabase } = require('../config/database');

class ChatMessage {
    // 새 메시지 저장
    static async save(userId, username, message, isAdmin = false) {
        // admin 계정인 경우 항상 관리자 권한으로 설정
        if (username.toLowerCase() === 'admin') {
            isAdmin = true;
        }
        
        console.log(`메시지 저장: ${username}(${userId}): ${message}, 관리자: ${isAdmin}`);
        return new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase
                    .from('chat_messages')
                    .insert([{
                        user_id: userId,
                        username: username,
                        message,
                        is_admin: isAdmin ? 1 : 0,
                        created_at: new Date()
                    }])
                    .select();
                
                if (error) throw error;
                
                console.log('메시지 저장 성공, ID:', data[0].id);
                resolve(data[0].id);
            } catch (error) {
                console.error('메시지 저장 오류:', error);
                reject(error);
            }
        });
    }

    // 최근 메시지 가져오기
    static async getRecent(limit = 50) {
        console.log(`최근 ${limit}개 메시지 조회 시작`);
        return new Promise(async (resolve, reject) => {
            try {
                const { data, error } = await supabase
                    .from('chat_messages')
                    .select(`
                        id,
                        user_id,
                        username,
                        message,
                        is_admin,
                        created_at
                    `)
                    .order('created_at', { ascending: false })
                    .limit(limit);
                
                if (error) throw error;
                
                console.log(`${data.length}개 메시지 조회 완료`);
                
                // 최신순으로 가져와서 역순으로 정렬 (오래된 메시지가 위로)
                const messages = data.reverse().map(row => {
                    // admin 계정인 경우 항상 관리자로 표시
                    let isAdmin = row.is_admin === 1 || row.is_admin === true;
                    if (row.username && row.username.toLowerCase() === 'admin') {
                        isAdmin = true;
                    }
                    
                    return {
                        id: row.id,
                        userId: row.user_id,
                        sender: row.username,
                        message: row.message,
                        isAdmin: isAdmin,
                        time: new Date(row.created_at).getTime()
                    };
                });
                
                console.log('메시지 변환 완료');
                resolve(messages);
            } catch (error) {
                console.error('메시지 조회 오류:', error);
                reject(error);
            }
        });
    }

    // 메시지 삭제 (관리자용)
    static async delete(messageId) {
        console.log(`메시지 삭제 요청: ID ${messageId}`);
        return new Promise(async (resolve, reject) => {
            try {
                const { error } = await supabase
                    .from('chat_messages')
                    .delete()
                    .eq('id', messageId);
                
                if (error) throw error;
                
                console.log(`메시지 삭제 성공: ID ${messageId}`);
                resolve(true);
            } catch (error) {
                console.error('메시지 삭제 오류:', error);
                reject(error);
            }
        });
    }

    // 모든 메시지 삭제 (관리자용)
    static async deleteAll() {
        console.log('모든 메시지 삭제 요청');
        return new Promise(async (resolve, reject) => {
            try {
                const { error } = await supabase
                    .from('chat_messages')
                    .delete()
                    .gte('id', 0);
                
                if (error) throw error;
                
                console.log('모든 메시지 삭제 성공');
                resolve(true);
            } catch (error) {
                console.error('모든 메시지 삭제 오류:', error);
                reject(error);
            }
        });
    }
}

module.exports = ChatMessage; 