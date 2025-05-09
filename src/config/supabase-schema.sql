-- Supabase 초기 설정 스키마

-- create_table_if_not_exists 함수 생성
CREATE OR REPLACE FUNCTION create_table_if_not_exists(
  table_name TEXT,
  query_text TEXT
) RETURNS VOID AS $$
BEGIN
  EXECUTE query_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- execute_sql 함수 생성 (일반 SQL 쿼리 실행)
CREATE OR REPLACE FUNCTION execute_sql(
  query_text TEXT,
  params JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
  rows_affected INTEGER;
  last_id INTEGER;
BEGIN
  EXECUTE query_text
  INTO result;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  -- INSERT 쿼리인 경우 마지막 ID 가져오기
  IF query_text ~* '^INSERT' THEN
    EXECUTE 'SELECT lastval()' INTO last_id;
  ELSE
    last_id := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'id', last_id,
    'rows_affected', rows_affected,
    'result', result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- execute_sql_get 함수 생성 (단일 행 조회)
CREATE OR REPLACE FUNCTION execute_sql_get(
  query_text TEXT,
  params JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query_text
  INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- execute_sql_all 함수 생성 (여러 행 조회)
CREATE OR REPLACE FUNCTION execute_sql_all(
  query_text TEXT,
  params JSONB DEFAULT '[]'::JSONB
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query_text
  INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 테이블 생성
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
);

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
);

CREATE TABLE IF NOT EXISTS public_game_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  choice TEXT NOT NULL,
  bet_amount DECIMAL NOT NULL,
  result TEXT NOT NULL,
  win_amount DECIMAL DEFAULT 0,
  player_score INTEGER NOT NULL,
  banker_score INTEGER NOT NULL,
  player_cards JSONB,
  banker_cards JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- RLS(Row Level Security) 정책 설정
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 데이터에 접근할 수 있도록 정책 수정 (개발 단계에서만 사용)
CREATE POLICY "Allow all for users" ON users
  FOR ALL USING (true);

CREATE POLICY "Allow all for game_history" ON game_history
  FOR ALL USING (true);

CREATE POLICY "Allow all for public_game_history" ON public_game_history
  FOR ALL USING (true);

CREATE POLICY "Allow all for chat_messages" ON chat_messages
  FOR ALL USING (true);

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Users can view their own data" ON users;
DROP POLICY IF EXISTS "Admins can view all user data" ON users;
DROP POLICY IF EXISTS "Anyone can view public game history" ON public_game_history;
DROP POLICY IF EXISTS "Users can view their own game history" ON game_history;
DROP POLICY IF EXISTS "Anyone can view chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert their own chat messages" ON chat_messages;

-- 아래는 기존 정책 주석 처리 (참고용)
/*
-- 사용자는 자신의 정보만 볼 수 있음
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- 관리자는 모든 사용자 정보를 볼 수 있음
CREATE POLICY "Admins can view all user data" ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.is_admin = true
    )
  );

-- 모든 사용자는 공개 게임 기록을 볼 수 있음
CREATE POLICY "Anyone can view public game history" ON public_game_history
  FOR SELECT USING (true);

-- 사용자는 자신의 게임 기록만 볼 수 있음
CREATE POLICY "Users can view their own game history" ON game_history
  FOR SELECT USING (auth.uid() = user_id);

-- 모든 사용자는 채팅 메시지를 볼 수 있음
CREATE POLICY "Anyone can view chat messages" ON chat_messages
  FOR SELECT USING (true);

-- 사용자는 자신의 채팅 메시지만 작성할 수 있음
CREATE POLICY "Users can insert their own chat messages" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    (auth.uid() IS NOT NULL AND user_id IS NULL)
  );
*/

-- 세션 테이블
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

-- 세션 만료 인덱스
CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire ON user_sessions (expire);

-- RLS(Row Level Security) 정책 설정
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- 세션 테이블에 대한 모든 작업 허용 정책
CREATE POLICY "Allow all operations on sessions" ON user_sessions
  USING (true)
  WITH CHECK (true);

-- 필요한 저장 프로시저 생성
CREATE OR REPLACE FUNCTION create_table_if_not_exists(table_name TEXT, query_text TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE query_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SQL 실행 함수들
CREATE OR REPLACE FUNCTION execute_sql(query_text TEXT, params JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB AS $$
BEGIN
  EXECUTE query_text;
  RETURN '{"rows_affected": 1}'::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION execute_sql_get(query_text TEXT, params JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query_text INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION execute_sql_all(query_text TEXT, params JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE query_text INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 