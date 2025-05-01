const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// JWT 시크릿 키
const jwtSecret = process.env.JWT_SECRET || 'bacaraGameSecretKey2025';

/**
 * JWT 토큰 인증 미들웨어
 */
exports.authenticateJWT = (req, res, next) => {
  console.log('인증 미들웨어 실행');
  
  // 헤더에서 토큰 가져오기
  const authHeader = req.headers.authorization;
  console.log('인증 헤더:', authHeader);
  
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    console.log('추출된 토큰:', token ? token.substring(0, 20) + '...' : 'undefined');
    
    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        console.error('토큰 검증 오류:', err.message);
        return res.status(403).json({ success: false, message: '유효하지 않은 토큰입니다.' });
      }
      
      console.log('토큰에서 추출된 사용자 정보:', user);
      
      // admin 사용자 처리 - username이 admin인 경우 관리자 권한 강제 부여
      const isAdminUser = user.username.toLowerCase() === 'admin';
      
      // 사용자 정보 설정
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = isAdminUser || user.isAdmin || user.is_admin === 1 || user.is_admin === true;
      
      console.log('세션에 설정된 사용자 정보:', req.session);
      
      next();
    });
  } else {
    console.log('인증 토큰이 없음');
    res.status(401).json({ success: false, message: '인증 토큰이 필요합니다.' });
  }
};

/**
 * 관리자 권한 확인 미들웨어
 */
exports.isAdmin = (req, res, next) => {
  console.log('관리자 권한 확인 미들웨어 실행:', req.session);
  
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
}; 