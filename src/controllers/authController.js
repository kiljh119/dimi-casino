const User = require('../models/User');
const bcrypt = require('bcrypt');
const { generateToken, verifyToken } = require('../config/jwt');

// 회원가입 컨트롤러
const register = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  // admin 이름으로 가입 방지 (단순히 문자열 비교)
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ success: false, message: '이 사용자 이름은 사용할 수 없습니다.' });
  }

  try {
    // 사용자 이름 중복 확인
    const existingUser = await User.findByUsername(username);
    
    if (existingUser) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 사용자 이름입니다.' });
    }
    
    // 사용자 등록
    const userId = await User.create(username, password);
    
    // 새로 생성된 사용자 정보 조회
    const user = await User.findById(userId);
    
    // JWT 토큰 생성
    const token = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: false
    });
    
    res.status(201).json({
      success: true, 
      message: '회원가입이 완료되었습니다.',
      userId,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // 구체적인 에러 메시지 처리
    if (error.message && error.message.includes('이미 사용 중인 사용자 이름입니다')) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 사용자 이름입니다.' });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: '사용자 등록 중 충돌이 발생했습니다. 다시 시도해주세요.' });
    }
    
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 로그인 컨트롤러
const login = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.status(400).json({ success: false, message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
    }
    
    // 비밀번호 확인
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
    }
    
    // admin 계정인 경우 항상 관리자 권한 부여
    const isAdminUser = user.username.toLowerCase() === 'admin';
    // is_admin 값이 true(boolean) 또는 1(integer)인 경우 관리자 권한 부여
    const hasAdminFlag = user.is_admin === true || user.is_admin === 1;
    const isAdmin = isAdminUser || hasAdminFlag;
    
    console.log('로그인: 관리자 권한 확인', {
      username: user.username,
      'is_admin 원본값': user.is_admin,
      'is_admin 타입': typeof user.is_admin,
      '관리자 여부': isAdmin
    });
    
    // 세션에 사용자 정보 저장 (세션 + JWT 하이브리드 방식)
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = isAdmin;
    
    // JWT 토큰 생성
    const token = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: isAdmin,
      is_admin: isAdmin // 명시적으로 is_admin 속성도 추가
    });
    
    res.status(200).json({ 
      success: true, 
      message: '로그인 성공',
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: isAdmin,
        is_admin: isAdmin // 이중으로 보장
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 로그아웃 컨트롤러
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true, message: '로그아웃 되었습니다.' });
  });
};

// 토큰 검증 컨트롤러 (자동 로그인용)
const verifyTokenController = async (req, res) => {
  const authHeader = req.headers.authorization;
  let token = req.body.token;
  
  // Authorization 헤더가 있는 경우 그것을 사용
  if (authHeader && !token) {
    token = authHeader.split(' ')[1];
  }
  
  if (!token) {
    return res.status(400).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
  }
  
  try {
    console.log('토큰 검증 시도:', token.substring(0, 20) + '...');
    const result = verifyToken(token);
    
    if (!result.valid) {
      console.error('토큰 검증 실패:', result.error);
      return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
    
    // 사용자 정보 조회
    const user = await User.findById(result.decoded.id);
    
    if (!user) {
      console.error('사용자를 찾을 수 없음:', result.decoded.id);
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // admin 계정인 경우 항상 관리자 권한 부여
    const isAdminUser = user.username.toLowerCase() === 'admin';
    // is_admin 값이 true(boolean) 또는 1(integer)인 경우 관리자 권한 부여
    const hasAdminFlag = user.is_admin === true || user.is_admin === 1;
    const isAdmin = isAdminUser || hasAdminFlag;
    
    console.log('토큰 검증: 관리자 권한 확인', {
      username: user.username,
      'is_admin 원본값': user.is_admin,
      'is_admin 타입': typeof user.is_admin,
      '관리자 여부': isAdmin
    });
    
    // 새 토큰 생성
    const newToken = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: isAdmin,
      is_admin: isAdmin // 명시적으로 is_admin 속성도 추가
    });
    
    console.log('새 토큰 생성 완료:', newToken.substring(0, 20) + '...');
    
    return res.status(200).json({
      success: true,
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: isAdmin,
        is_admin: isAdmin // 이중으로 보장
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 상세 정보 조회
const getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: user.is_admin === true || user.is_admin === 1
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 비밀번호 변경
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
  }
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 현재 비밀번호 확인
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
    }
    
    // 새 비밀번호로 업데이트
    await User.updatePassword(user.id, newPassword);
    
    res.status(200).json({ success: true, message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

module.exports = {
  register,
  login,
  logout,
  verifyToken: verifyTokenController,
  getUserDetails,
  changePassword
}; 