const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// JWT 시크릿 키
const jwtSecret = process.env.JWT_SECRET || 'bacaraGameSecretKey2025';

/**
 * JWT 토큰 인증 미들웨어
 */
const authenticateJWT = (req, res, next) => {
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
      
      // 관리자 권한 확인 - 다음 중 하나라도 true면 관리자
      // 1. username이 'admin'
      // 2. isAdmin 속성이 true
      // 3. is_admin 속성이 true 또는 1
      const isAdminUser = 
        user.username.toLowerCase() === 'admin' || 
        user.isAdmin === true || 
        user.is_admin === true || 
        user.is_admin === 1;
      
      // 사용자 정보 설정
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = isAdminUser;
      
      // 디버깅을 위해 관리자 여부 로깅
      console.log(`사용자 ${user.username}의 관리자 여부:`, req.session.isAdmin ? '예' : '아니오');
      console.log('관리자 여부 판단 기준:', {
        'username === admin': user.username.toLowerCase() === 'admin',
        'isAdmin === true': user.isAdmin === true,
        'is_admin === true': user.is_admin === true,
        'is_admin === 1': user.is_admin === 1
      });
      
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
const isAdmin = (req, res, next) => {
  console.log('관리자 권한 확인 미들웨어 실행');
  console.log('세션 정보:', req.session);
  
  if (!req.session || !req.session.isAdmin) {
    console.error('관리자 권한 없음:', req.session ? req.session.username : '세션 없음');
    return res.status(403).json({ 
      success: false, 
      message: '관리자 권한이 필요합니다. 관리자로 로그인해주세요.' 
    });
  }
  
  console.log(`사용자 ${req.session.username}에게 관리자 접근 권한 승인됨`);
  next();
};

module.exports = {
  authenticateJWT,
  isAdmin
}; 