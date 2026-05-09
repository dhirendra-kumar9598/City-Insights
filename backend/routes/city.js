const express = require('express');
const router = express.Router();
const {
  fetchAllCityData,
  fetchSingleCityData,
  fetchAllCityDataWithHistory,
  fetchCityHistory
} = require('../services/fetchAndStoreAll');

router.get('/', async (req, res) => {
  try {
    const data = await fetchAllCityData();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history/:days', async (req, res) => {
  const days = Math.min(Number.parseInt(req.params.days, 10) || 7, 15);

  try {
    const data = await fetchAllCityDataWithHistory(days);
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:name/history', async (req, res) => {
  const days = Math.min(Number.parseInt(req.query.days, 10) || 7, 15);

  try {
    const data = await fetchCityHistory(req.params.name, days);
    if (!data) return res.status(404).json({ error: 'City not found' });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:name', async (req, res) => {
  try {
    const snapshot = await fetchSingleCityData(req.params.name);
    if (!snapshot) return res.status(404).json({ error: 'City not found' });
    res.json(snapshot);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
