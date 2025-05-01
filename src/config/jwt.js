const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// JWT 비밀키
const JWT_SECRET = process.env.JWT_SECRET || 'bacaraGameSecretKey2025';

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

// 모듈 내보내기
module.exports = {
  generateToken,
  verifyToken,
  JWT_SECRET
}; 