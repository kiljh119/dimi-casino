const crypto = require('crypto');
const Session = require('../models/Session');

/**
 * Supabase를 사용하는 세션 미들웨어
 */
function sessionMiddleware(options = {}) {
  const cookieName = options.cookieName || 'bacarat.sid';
  const secret = options.secret || 'bacaraGameSessionKey2025';
  const maxAge = options.maxAge || 30 * 24 * 60 * 60 * 1000; // 기본 30일

  return async (req, res, next) => {
    // 쿠키에서 세션 ID 가져오기
    let sid = req.cookies?.[cookieName];
    let sessionData = null;

    // 세션 ID가 없으면 새로 생성
    if (!sid) {
      sid = crypto.randomUUID();
      res.cookie(cookieName, sid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge
      });
    } else {
      // 세션 데이터 조회
      sessionData = await Session.get(sid);
    }

    // 세션 객체 초기화
    req.session = sessionData || {};

    // 세션 저장 메소드
    req.session.save = async () => {
      const expireDate = new Date(Date.now() + maxAge);
      await Session.set(sid, req.session, expireDate);
    };

    // 세션 파괴 메소드
    req.session.destroy = async (callback) => {
      await Session.destroy(sid);
      res.clearCookie(cookieName);
      req.session = null;
      if (typeof callback === 'function') {
        callback();
      }
    };

    // 응답이 끝날 때 세션 저장
    const originalEnd = res.end;
    res.end = async function(...args) {
      if (req.session) {
        await req.session.save();
      }
      originalEnd.apply(this, args);
    };

    next();
  };
}

// 주기적으로 만료된 세션 정리 (1시간마다)
setInterval(async () => {
  const count = await Session.cleanup();
  if (count > 0) {
    console.log(`만료된 세션 ${count}개가 정리되었습니다.`);
  }
}, 60 * 60 * 1000);

module.exports = sessionMiddleware; 