const express = require('express');
const router = express.Router();
const { getClientes } = require('../controllers/clientesController');

router.get('/', getClientes);

module.exports = router;
