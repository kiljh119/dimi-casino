/**
 * Supabase 설정 가이드
 * 
 * 이 스크립트는 SQLite에서 Supabase로 마이그레이션하는 작업을 위한 참고 자료입니다.
 * 
 * 설정 단계:
 * 
 * 1. Supabase 계정 생성 및 프로젝트 생성
 *    - https://supabase.com 에서 회원 가입
 *    - 새로운 프로젝트 생성
 * 
 * 2. 환경 변수 설정
 *    - 프로젝트의 루트 디렉토리에 .env 파일 생성
 *    - 다음과 같은 환경 변수 설정:
 *      SUPABASE_URL=https://your-project-id.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *      SUPABASE_ANON_KEY=your-anon-key
 * 
 * 3. 필요한 패키지 설치
 *    - npm install @supabase/supabase-js
 * 
 * 4. 스키마 생성
 *    - Supabase SQL 에디터에서 src/config/supabase-schema.sql 파일의 내용을 실행
 *    - 또는 아래 제공되는 마이그레이션 함수를 사용하여 SQLite 데이터를 Supabase로 마이그레이션
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// Supabase 환경 변수
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// SQLite 데이터베이스 경로
const dbPath = process.env.DB_PATH || './database.sqlite';

// Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * SQLite에서 Supabase로 데이터 마이그레이션
 */
async function migrateData() {
  try {
    console.log('데이터 마이그레이션을 시작합니다...');
    
    // SQLite 데이터베이스 연결
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('SQLite 연결 오류:', err.message);
        process.exit(1);
      }
      console.log('SQLite 데이터베이스에 연결되었습니다.');
    });
    
    // 사용자 데이터 마이그레이션
    await migrateUsers(db);
    
    // 게임 히스토리 마이그레이션
    await migrateGameHistory(db);
    
    // 공개 게임 히스토리 마이그레이션
    await migratePublicGameHistory(db);
    
    // 채팅 메시지 마이그레이션
    await migrateChatMessages(db);
    
    // SQLite 연결 종료
    db.close((err) => {
      if (err) {
        console.error('SQLite 연결 종료 오류:', err.message);
      }
      console.log('SQLite 데이터베이스 연결이 종료되었습니다.');
    });
    
    console.log('데이터 마이그레이션이 완료되었습니다!');
  } catch (error) {
    console.error('마이그레이션 오류:', error);
  }
}

/**
 * 사용자 데이터 마이그레이션
 */
async function migrateUsers(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', async (err, rows) => {
      if (err) {
        console.error('사용자 조회 오류:', err.message);
        return reject(err);
      }
      
      console.log(`${rows.length}명의 사용자를 마이그레이션합니다...`);
      
      for (const user of rows) {
        try {
          const { error } = await supabase
            .from('users')
            .insert([{
              id: user.id,
              username: user.username,
              password: user.password,
              balance: user.balance,
              wins: user.wins,
              losses: user.losses,
              profit: user.profit,
              is_admin: user.is_admin === 1,
              created_at: user.created_at
            }]);
          
          if (error) throw error;
        } catch (error) {
          console.error(`사용자 마이그레이션 오류 (${user.username}):`, error.message);
        }
      }
      
      console.log('사용자 마이그레이션이 완료되었습니다.');
      resolve();
    });
  });
}

/**
 * 게임 히스토리 마이그레이션
 */
async function migrateGameHistory(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM game_history', async (err, rows) => {
      if (err) {
        console.error('게임 히스토리 조회 오류:', err.message);
        return reject(err);
      }
      
      console.log(`${rows.length}개의 게임 히스토리를 마이그레이션합니다...`);
      
      for (const history of rows) {
        try {
          const { error } = await supabase
            .from('game_history')
            .insert([{
              id: history.id,
              user_id: history.user_id,
              game_result: history.game_result,
              amount: history.amount,
              win_lose: history.win_lose,
              player_score: history.player_score,
              banker_score: history.banker_score,
              created_at: history.created_at
            }]);
          
          if (error) throw error;
        } catch (error) {
          console.error(`게임 히스토리 마이그레이션 오류 (ID: ${history.id}):`, error.message);
        }
      }
      
      console.log('게임 히스토리 마이그레이션이 완료되었습니다.');
      resolve();
    });
  });
}

/**
 * 공개 게임 히스토리 마이그레이션
 */
async function migratePublicGameHistory(db) {
  return new Promise((resolve, reject) => {
    // 테이블이 존재하는지 확인
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='public_game_history'", async (err, table) => {
      if (err) {
        console.error('테이블 확인 오류:', err.message);
        return reject(err);
      }
      
      if (!table) {
        console.log('public_game_history 테이블이 존재하지 않습니다. 이 테이블은 건너뜁니다.');
        return resolve();
      }
      
      db.all('SELECT * FROM public_game_history', async (err, rows) => {
        if (err) {
          console.error('공개 게임 히스토리 조회 오류:', err.message);
          return reject(err);
        }
        
        console.log(`${rows.length}개의 공개 게임 히스토리를 마이그레이션합니다...`);
        
        for (const history of rows) {
          try {
            // 카드 정보가 문자열이면 JSON으로 파싱
            let playerCards = history.player_cards;
            let bankerCards = history.banker_cards;
            
            if (typeof playerCards === 'string') {
              playerCards = JSON.parse(playerCards);
            }
            
            if (typeof bankerCards === 'string') {
              bankerCards = JSON.parse(bankerCards);
            }
            
            const { error } = await supabase
              .from('public_game_history')
              .insert([{
                id: history.id,
                user_id: history.user_id,
                username: history.username,
                choice: history.choice,
                bet_amount: history.bet_amount,
                result: history.result,
                win_amount: history.win_amount,
                player_score: history.player_score,
                banker_score: history.banker_score,
                player_cards: playerCards,
                banker_cards: bankerCards,
                created_at: history.created_at
              }]);
            
            if (error) throw error;
          } catch (error) {
            console.error(`공개 게임 히스토리 마이그레이션 오류 (ID: ${history.id}):`, error.message);
          }
        }
        
        console.log('공개 게임 히스토리 마이그레이션이 완료되었습니다.');
        resolve();
      });
    });
  });
}

/**
 * 채팅 메시지 마이그레이션
 */
async function migrateChatMessages(db) {
  return new Promise((resolve, reject) => {
    // 테이블이 존재하는지 확인
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'", async (err, table) => {
      if (err) {
        console.error('테이블 확인 오류:', err.message);
        return reject(err);
      }
      
      if (!table) {
        console.log('chat_messages 테이블이 존재하지 않습니다. 이 테이블은 건너뜁니다.');
        return resolve();
      }
      
      db.all('SELECT * FROM chat_messages', async (err, rows) => {
        if (err) {
          console.error('채팅 메시지 조회 오류:', err.message);
          return reject(err);
        }
        
        console.log(`${rows.length}개의 채팅 메시지를 마이그레이션합니다...`);
        
        for (const message of rows) {
          try {
            const { error } = await supabase
              .from('chat_messages')
              .insert([{
                id: message.id,
                user_id: message.user_id,
                username: message.username,
                message: message.message,
                is_admin: message.is_admin === 1,
                created_at: message.created_at
              }]);
            
            if (error) throw error;
          } catch (error) {
            console.error(`채팅 메시지 마이그레이션 오류 (ID: ${message.id}):`, error.message);
          }
        }
        
        console.log('채팅 메시지 마이그레이션이 완료되었습니다.');
        resolve();
      });
    });
  });
}

// 명령줄 인수에 따라 마이그레이션 실행
if (process.argv.includes('--migrate')) {
  migrateData();
} else {
  console.log(`
===================================================================
Supabase 마이그레이션 도우미
===================================================================

이 스크립트는 SQLite 데이터베이스에서 Supabase로 데이터를 마이그레이션하는 데 도움을 줍니다.

마이그레이션을 시작하기 전에 다음 사항을 확인하세요:

1. Supabase 프로젝트를 생성했는지 확인하세요.
2. .env 파일에 다음 환경 변수를 설정했는지 확인하세요:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - DB_PATH (SQLite 데이터베이스 경로)
3. Supabase SQL 에디터에서 src/config/supabase-schema.sql 파일의 내용을 실행했는지 확인하세요.

마이그레이션을 시작하려면 다음 명령어를 실행하세요:
node src/config/supabase-setup.js --migrate

===================================================================
  `);
}

module.exports = { supabase, migrateData }; 