const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const adminController = require('../controllers/adminController');

// 게임 관련 라우트
router.get('/history', gameController.getHistory);
router.get('/rankings', gameController.getRankings);

// 관리자 관련 라우트
router.get('/admin/users', adminController.getAllUsers);
router.get('/admin/users/search', adminController.searchUsers);
router.post('/admin/users/add-balance', adminController.addBalance);
router.post('/admin/users/subtract-balance', adminController.subtractBalance);
router.post('/admin/users/delete', adminController.deleteUser);

module.exports = router; 