const express = require('express');
const router = express.Router();
const { login, resetPasswordManual, getUser } = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/login', login);
router.post('/reset-password-manual', resetPasswordManual);
router.get('/usuario', authMiddleware, getUser); // NOVA ROTA ADICIONADA

module.exports = router;