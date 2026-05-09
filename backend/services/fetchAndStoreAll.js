const axios = require('axios');
const CitySnapshot = require('../models/CitySnapshot');

const cities = require('../config/cities.json');

const populationCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const normalizeCityName = (value) => value.trim().toLowerCase().replace(/[_-]+/g, ' ');

const findConfiguredCity = (name) => {
  const normalizedName = normalizeCityName(name);
  return cities.find((city) => (
    normalizeCityName(city.id) === normalizedName || normalizeCityName(city.name) === normalizedName
  ));
};

const unknownAqi = () => ({
  value: null,
  category: 'Unknown',
  timestamp: new Date()
});

const getWeatherAndAQI = async (cityName, days = 7, includeAqi = true, includeAlerts = false) => {
  if (!process.env.WEATHERAPI_KEY) {
    console.error('WEATHERAPI_KEY missing in .env');
    return {
      weather: null,
      aqi: unknownAqi(),
      success: false,
      error: 'WEATHERAPI_KEY missing'
    };
  }

  try {
    const { data } = await axios.get('https://api.weatherapi.com/v1/forecast.json', {
      params: {
        key: process.env.WEATHERAPI_KEY,
        q: cityName,
        days,
        aqi: includeAqi ? 'yes' : 'no',
        alerts: includeAlerts ? 'yes' : 'no'
      },
      timeout: 10000
    });

    const current = data.current;
    const aqiInfo = current.air_quality || {};
    const aqiValue = aqiInfo['us-epa-index'] ?? null;
    const aqiCategoryMap = {
      1: 'Good',
      2: 'Moderate',
      3: 'Unhealthy for Sensitive Groups',
      4: 'Unhealthy',
      5: 'Very Unhealthy',
      6: 'Hazardous'
    };

    return {
      weather: {
        temp: current.temp_c,
        feelslike: current.feelslike_c,
        humidity: current.humidity,
        wind_kph: current.wind_kph,
        pressure_mb: current.pressure_mb,
        description: current.condition.text,
        icon: current.condition.icon,
        uv_index: current.uv,
        visibility_km: current.vis_km,
        timestamp: new Date(current.last_updated)
      },
      aqi: {
        value: aqiValue,
        category: aqiValue ? aqiCategoryMap[aqiValue] : 'Unknown',
        pm2_5: aqiInfo.pm2_5,
        pm10: aqiInfo.pm10,
        co: aqiInfo.co,
        no2: aqiInfo.no2,
        o3: aqiInfo.o3,
        so2: aqiInfo.so2,
        timestamp: new Date()
      },
      success: true
    };
  } catch (e) {
    console.error(`WeatherAPI fetch error for ${cityName}:`, e.message);
    return {
      weather: null,
      aqi: unknownAqi(),
      success: false,
      error: e.message
    };
  }
};

const getPopulation = async (cityName) => {
  const apiKey = process.env.BAMWOR_API_KEY;
  if (!apiKey) {
    console.error('BAMWOR_API_KEY missing in .env');
    return null;
  }

  const cacheKey = cityName.toLowerCase();
  const cached = populationCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.population;
  }

  try {
    const { data } = await axios.get('https://bamwor.com/api/v1/search', {
      params: {
        q: cityName,
        type: 'city'
      },
      headers: { 'X-API-Key': apiKey },
      timeout: 10000
    });

    if (!Array.isArray(data?.data) || data.data.length === 0) {
      console.warn(`No population data found for ${cityName}`);
      return null;
    }

    const cityData = data.data.find((city) => (
      city.names && Object.values(city.names).some((name) => name.toLowerCase() === cityName.toLowerCase())
    )) || data.data[0];

    const population = cityData?.population;
    if (typeof population !== 'number' || population <= 0) {
      console.warn(`No population data found for ${cityName}`);
      return null;
    }

    populationCache.set(cacheKey, {
      population,
      timestamp: Date.now(),
      cityId: cityData.id,
      countryCode: cityData.country_code,
      coordinates: cityData.coordinates
    });

    return population;
  } catch (err) {
    if (err.response?.status === 429) console.error(`Rate limit exceeded for ${cityName}`);
    else if (err.response?.status === 401) console.error('Invalid API key for Bamwor');
    else console.error(`Population fetch error for ${cityName}:`, err.message);
    return null;
  }
};

const buildCityPayload = async (city, days = 7) => {
  const [weatherResult, populationResult] = await Promise.all([
    getWeatherAndAQI(city.name, days),
    getPopulation(city.name)
  ]);

  return {
    cityId: city.id,
    cityName: city.name,
    country: city.country,
    lat: city.lat,
    lng: city.lng,
    currency: city.currency,
    population: populationResult ?? city.population ?? null,
    weather: weatherResult.weather,
    aqi: weatherResult.aqi,
    createdAt: new Date()
  };
};

const fetchAllCityData = async () => {
  const selectedCities = cities.slice(0, 10);
  return Promise.all(selectedCities.map((city) => buildCityPayload(city)));
};

const fetchSingleCityData = async (name) => {
  const city = findConfiguredCity(name);
  if (!city) return null;
  return buildCityPayload(city);
};

const fetchAllCityDataWithHistory = async (days) => {
  const selectedCities = cities.slice(0, 10);
  return Promise.all(selectedCities.map((city) => buildCityPayload(city, days)));
};

const fetchCityHistory = async (name, days = 7) => {
  const city = findConfiguredCity(name);
  if (!city) return null;

  const safeDays = Math.min(Math.max(Number.parseInt(days, 10) || 7, 1), 15);
  const from = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  return CitySnapshot
    .find({
      cityId: city.id,
      createdAt: { $gte: from }
    })
    .sort({ createdAt: 1 })
    .lean();
};

const fetchAndStoreAll = async () => {
  const data = await fetchAllCityData();
  await CitySnapshot.insertMany(data, { ordered: false });
  return data;
};

const clearPopulationCache = () => {
  populationCache.clear();
};

const getCacheStats = () => ({
  populationCacheSize: populationCache.size,
  cachedCities: Array.from(populationCache.keys())
});

module.exports = {
  fetchAllCityData,
  fetchSingleCityData,
  fetchAllCityDataWithHistory,
  fetchCityHistory,
  fetchAndStoreAll,
  getWeatherAndAQI,
  getPopulation,
  clearPopulationCache,
  getCacheStats
};
