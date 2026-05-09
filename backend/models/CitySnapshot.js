const mongoose = require('mongoose');

const CitySnapshotSchema = new mongoose.Schema({
  cityId: { type: String, index: true },
  cityName: { type: String, required: true, index: true },
  country: { type: String },
  lat: { type: Number },
  lng: { type: Number },
  currency: { type: String },

  weather: {
    temp: { type: Number },
    feelslike: { type: Number },
    humidity: { type: Number },
    wind_kph: { type: Number },
    pressure_mb: { type: Number },
    description: { type: String },
    icon: { type: String },
    uv_index: { type: Number, default: 0 },
    visibility_km: { type: Number },
    timestamp: { type: Date }
  },

  aqi: {
    value: { type: Number, min: 1, max: 6 },
    category: { type: String, default: 'Unknown' },
    pm2_5: { type: Number },
    pm10: { type: Number },
    co: { type: Number },
    no2: { type: Number },
    o3: { type: Number },
    so2: { type: Number },
    timestamp: { type: Date }
  },

  population: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('CitySnapshot', CitySnapshotSchema);
