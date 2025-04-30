const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 인증 라우트
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/verify-token', authController.verifyToken);

module.exports = router; 

// 밥.net:3000/api/register POST