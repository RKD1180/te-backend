const express = require('express');
const router = express.Router();
const { reserve, cancelReservation } = require('../controllers/reservationController');

router.post('/', reserve);
router.delete('/:id', cancelReservation);

module.exports = router;
