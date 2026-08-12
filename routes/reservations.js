const express = require('express');
const router = express.Router();
const { getActiveReservations, reserve, cancelReservation } = require('../controllers/reservationController');

router.get('/', getActiveReservations);
router.post('/', reserve);
router.delete('/:id', cancelReservation);

module.exports = router;
