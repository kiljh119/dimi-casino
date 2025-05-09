const { supabase } = require('../config/database');

class Session {
  /**
   * 세션 생성 또는 업데이트
   * @param {string} sid 세션 ID
   * @param {object} sessionData 세션 데이터
   * @param {Date} expireDate 만료 날짜
   */
  static async set(sid, sessionData, expireDate) {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .upsert({
          sid,
          sess: sessionData,
          expire: expireDate
        }, {
          onConflict: 'sid'
        });

      if (error) {
        console.error('세션 저장 오류:', error.message);
        throw error;
      }

      return true;
    } catch (err) {
      console.error('세션 저장 중 예외 발생:', err.message);
      return false;
    }
  }

  /**
   * 세션 조회
   * @param {string} sid 세션 ID
   * @returns {object|null} 세션 데이터 또는 null
   */
  static async get(sid) {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('sess')
        .eq('sid', sid)
        .gt('expire', new Date().toISOString())
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // PGRST116는 결과가 없을 때 발생하는 에러
          console.error('세션 조회 오류:', error.message);
        }
        return null;
      }

      return data?.sess || null;
    } catch (err) {
      console.error('세션 조회 중 예외 발생:', err.message);
      return null;
    }
  }

  /**
   * 세션 삭제
   * @param {string} sid 세션 ID
   * @returns {boolean} 성공 여부
   */
  static async destroy(sid) {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .eq('sid', sid);

      if (error) {
        console.error('세션 삭제 오류:', error.message);
        throw error;
      }

      return true;
    } catch (err) {
      console.error('세션 삭제 중 예외 발생:', err.message);
      return false;
    }
  }

  /**
   * 만료된 세션 정리
   * @returns {number} 삭제된 세션 수
   */
  static async cleanup() {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .delete()
        .lt('expire', new Date().toISOString())
        .select('count');

      if (error) {
        console.error('세션 정리 오류:', error.message);
        throw error;
      }

      return data?.count || 0;
    } catch (err) {
      console.error('세션 정리 중 예외 발생:', err.message);
      return 0;
    }
  }
}

module.exports = Session; 