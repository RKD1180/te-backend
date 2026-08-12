const express = require('express');
const router = express.Router();
const { getDrops, getDropById, createDrop } = require('../controllers/dropController');

router.get('/', getDrops);
router.get('/:id', getDropById);
router.post('/', createDrop);

module.exports = router;
