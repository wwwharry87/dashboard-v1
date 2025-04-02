const express = require('express');
const router = express.Router();
const { login, resetPasswordManual } = require('../controllers/authController');

router.post('/login', login);
router.post('/reset-password-manual', resetPasswordManual);

module.exports = router;
