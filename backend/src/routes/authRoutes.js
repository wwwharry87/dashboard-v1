// routes/authRoutes.js
const express = require('express');
const { loginController } = require('../controllers/loginController');
const router = express.Router();

// Rota de login
router.post('/login', loginController);

module.exports = router;
