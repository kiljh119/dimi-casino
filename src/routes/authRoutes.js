const express = require('express');
const authController = require('../controllers/authController');
const { authenticateJWT } = require('../middlewares/authMiddleware');

const router = express.Router();

// 인증 라우트
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/verify-token', authController.verifyToken);

// 사용자 상세 정보 가져오기
router.get('/user/details', authenticateJWT, authController.getUserDetails);

// 비밀번호 변경
router.post('/user/change-password', authenticateJWT, authController.changePassword);

module.exports = router; 

// 밥.net:3000/api/register POST