const jwt = require('jsonwebtoken');

// JWT 비밀키 (실제 프로덕션에서는 환경 변수 등으로 안전하게 관리해야 함)
const JWT_SECRET = 'baccarat-game-jwt-secret-key';

// 토큰 만료 시간 설정 (30일)
const TOKEN_EXPIRE = '30d';

// JWT 토큰 생성
const generateToken = (user) => {
  // 민감한 정보(비밀번호 등)는 포함하지 않음
  const payload = {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin || false
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRE });
};

// JWT 토큰 검증
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

module.exports = {
  generateToken,
  verifyToken,
  JWT_SECRET
}; 