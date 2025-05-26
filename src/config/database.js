const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// Supabase 환경 변수
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 연결 테스트
async function testConnection() {
  try {
    console.log('Supabase 연결 테스트 중...');
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.error('Supabase 연결 오류:', error.message);
      return false;
    }
    
    console.log('Supabase에 성공적으로 연결되었습니다.');
    return true;
  } catch (err) {
    console.error('Supabase 연결 테스트 중 예외 발생:', err.message);
    return false;
  }
}

// 데이터베이스 초기화
async function initializeDatabase() {
  try {
    // 연결 테스트
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Supabase 연결 실패');
    }

    // 사용자 테이블 확인 및 생성
    const { error: usersError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'users',
      query_text: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          balance DECIMAL DEFAULT 1000.0,
          wins INTEGER DEFAULT 0,
          losses INTEGER DEFAULT 0,
          profit DECIMAL DEFAULT 0.0,
          is_admin BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `
    });
    
    if (usersError) {
      console.error('사용자 테이블 초기화 오류:', usersError.message);
      throw usersError;
    }
    
    // 게임 히스토리 테이블 확인 및 생성
    const { error: gameHistoryError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'game_history',
      query_text: `
        CREATE TABLE IF NOT EXISTS game_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          game_result TEXT NOT NULL,
          amount DECIMAL NOT NULL,
          win_lose TEXT NOT NULL,
          player_score INTEGER NOT NULL,
          banker_score INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `
    });
    
    if (gameHistoryError) {
      console.error('게임 히스토리 테이블 초기화 오류:', gameHistoryError.message);
      throw gameHistoryError;
    }
    
    // 세션 테이블 확인 및 생성
    const { error: sessionTableError } = await supabase.rpc('create_table_if_not_exists', {
      table_name: 'user_sessions',
      query_text: `
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `
    });
    
    if (sessionTableError) {
      console.error('세션 테이블 초기화 오류:', sessionTableError.message);
      throw sessionTableError;
    }
    
    console.log('데이터베이스 테이블이 성공적으로 초기화되었습니다.');
    return true;
  } catch (error) {
    console.error('데이터베이스 테이블 초기화 실패:', error.message);
    throw error;
  }
}

// 기존 데이터베이스 API 사용 형태를 유지하기 위한 래퍼
async function run(query, params = [], callback) {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: query,
      params: params
    });
    
    if (error) {
      console.error('RPC execute_sql 오류:', error.message);
      throw error;
    }
    
    if (callback && typeof callback === 'function') {
      callback.call({ lastID: data?.id || null, changes: data?.rows_affected || 0 });
    }
    
    return data;
  } catch (err) {
    console.error('Database error:', err.message);
    if (callback && typeof callback === 'function') {
      callback(err);
    }
    throw err;
  }
}

async function get(query, params = [], callback) {
  try {
    const { data, error } = await supabase.rpc('execute_sql_get', {
      query_text: query,
      params: params
    });
    
    if (error) {
      console.error('RPC execute_sql_get 오류:', error.message);
      throw error;
    }
    
    if (callback && typeof callback === 'function') {
      callback(null, data);
    }
    
    return data;
  } catch (err) {
    console.error('Database error:', err.message);
    if (callback && typeof callback === 'function') {
      callback(err);
    }
    throw err;
  }
}

async function all(query, params = [], callback) {
  try {
    const { data, error } = await supabase.rpc('execute_sql_all', {
      query_text: query,
      params: params
    });
    
    if (error) {
      console.error('RPC execute_sql_all 오류:', error.message);
      throw error;
    }
    
    if (callback && typeof callback === 'function') {
      callback(null, data);
    }
    
    return data;
  } catch (err) {
    console.error('Database error:', err.message);
    if (callback && typeof callback === 'function') {
      callback(err);
    }
    throw err;
  }
}

function serialize(callback) {
  // Supabase에서는 serialize가 필요하지 않지만 호환성을 위해 유지
  if (callback && typeof callback === 'function') {
    callback();
  }
}

module.exports = {
  supabase,
  testConnection,
  initializeDatabase,
  run,
  get,
  all,
  serialize
}; 