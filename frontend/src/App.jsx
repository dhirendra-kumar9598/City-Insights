import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
const POLL_INTERVAL = 30000

const FALLBACK_RATES_TO_INR = {
  INR: 1,
  USD: 83.4,
  GBP: 105.2,
  JPY: 0.56,
  EUR: 90.4,
  AUD: 55.1,
  AED: 22.7,
  EGP: 1.75,
  BRL: 16.2,
  RUB: 0.91
}

const CITY_METADATA = {
  new_york: { country: 'United States', lat: 40.7128, lng: -74.006, currency: 'USD' },
  london: { country: 'United Kingdom', lat: 51.5074, lng: -0.1278, currency: 'GBP' },
  tokyo: { country: 'Japan', lat: 35.6762, lng: 139.6503, currency: 'JPY' },
  paris: { country: 'France', lat: 48.8566, lng: 2.3522, currency: 'EUR' },
  sydney: { country: 'Australia', lat: -33.8688, lng: 151.2093, currency: 'AUD' },
  dubai: { country: 'United Arab Emirates', lat: 25.2048, lng: 55.2708, currency: 'AED' },
  mumbai: { country: 'India', lat: 19.076, lng: 72.8777, currency: 'INR' },
  cairo: { country: 'Egypt', lat: 30.0444, lng: 31.2357, currency: 'EGP' },
  rio: { country: 'Brazil', lat: -22.9068, lng: -43.1729, currency: 'BRL' },
  moscow: { country: 'Russia', lat: 55.7558, lng: 37.6173, currency: 'RUB' }
}

const AQI_STYLES = {
  1: { label: 'Good', color: '#16a34a' },
  2: { label: 'Moderate', color: '#ca8a04' },
  3: { label: 'Sensitive', color: '#ea580c' },
  4: { label: 'Unhealthy', color: '#dc2626' },
  5: { label: 'Very Unhealthy', color: '#9333ea' },
  6: { label: 'Hazardous', color: '#7f1d1d' }
}

const formatNumber = (value, options = {}) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Unavailable'
  return new Intl.NumberFormat('en-IN', options).format(value)
}

const formatDate = (value) => {
  if (!value) return 'Unavailable'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

const getMarkerPosition = ({ lat, lng }) => ({
  left: `${((lng + 180) / 360) * 100}%`,
  top: `${((90 - lat) / 180) * 100}%`
})

const getAqiStyle = (value) => AQI_STYLES[value] || { label: 'Unknown', color: '#64748b' }

const getTempRotation = (temp) => {
  if (typeof temp !== 'number') return -120
  const clamped = Math.max(-10, Math.min(45, temp))
  return -120 + ((clamped + 10) / 55) * 240
}

const normalizeIconUrl = (url) => {
  if (!url) return ''
  return url.startsWith('//') ? `https:${url}` : url
}

const buildHistoryFallback = (city) => {
  if (!city) return []
  return [{
    createdAt: city.createdAt,
    weather: city.weather,
    aqi: city.aqi
  }]
}

const getTrendPoints = (history, metric) => history
  .map((item) => ({
    label: new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    value: metric === 'aqi' ? item.aqi?.value : item.weather?.temp
  }))
  .filter((point) => typeof point.value === 'number')

function MetricRow({ label, value }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value}</td>
    </tr>
  )
}

function TemperatureGauge({ temp, feelslike }) {
  return (
    <div className="temperature-gauge" aria-label="Temperature gauge">
      <div className="gauge-arc">
        <span className="gauge-needle" style={{ transform: `rotate(${getTempRotation(temp)}deg)` }} />
      </div>
      <strong>{typeof temp === 'number' ? `${Math.round(temp)} C` : '--'}</strong>
      <span>Feels like {typeof feelslike === 'number' ? `${Math.round(feelslike)} C` : '--'}</span>
    </div>
  )
}

function CityMarker({ city, isSelected, onSelect }) {
  const aqi = getAqiStyle(city.aqi?.value)

  return (
    <button
      type="button"
      className={`city-marker ${isSelected ? 'selected' : ''}`}
      style={{ ...getMarkerPosition(city), '--marker-color': aqi.color }}
      onClick={() => onSelect(city.cityId)}
      aria-label={`Show ${city.cityName}`}
    >
      <span className="marker-dot" />
      <span className="marker-label">{city.cityName}</span>
    </button>
  )
}

function TrendChart({ history }) {
  const tempPoints = getTrendPoints(history, 'temp')
  const aqiPoints = getTrendPoints(history, 'aqi')
  const points = tempPoints.length > 1 ? tempPoints : aqiPoints

  if (points.length < 2) {
    return (
      <div className="trend-empty">
        Trend graph will expand as stored snapshots accumulate.
      </div>
    )
  }

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const path = points.map((point, index) => {
    const x = 24 + (index / (points.length - 1)) * 312
    const y = 132 - ((point.value - min) / range) * 92
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  return (
    <div className="trend-chart" aria-label="Historical trend graph">
      <svg viewBox="0 0 360 160" role="img">
        <path className="trend-grid" d="M24 40 H336 M24 86 H336 M24 132 H336" />
        <path className="trend-line" d={path} />
        {points.map((point, index) => {
          const x = 24 + (index / (points.length - 1)) * 312
          const y = 132 - ((point.value - min) / range) * 92
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="4" />
        })}
      </svg>
      <div className="trend-labels">
        <span>{points[0].label}</span>
        <strong>{tempPoints.length > 1 ? 'Temperature trend' : 'AQI trend'}</strong>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  )
}

function CityDetails({ city, rates, onClose, history, historyDays, onHistoryDaysChange, historyLoading }) {
  if (!city) return null

  const weather = city.weather || {}
  const aqi = city.aqi || {}
  const aqiStyle = getAqiStyle(aqi.value)
  const currencyRate = rates[city.currency] || FALLBACK_RATES_TO_INR[city.currency]
  const rateIsLive = Boolean(rates[city.currency])

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="city-modal" role="dialog" aria-modal="true" aria-label={`${city.cityName} details`}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">{city.country}</p>
            <h2>{city.cityName}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
            x
          </button>
        </div>

        <div className="modal-content">
          <div className="modal-main">
            <div className="weather-summary">
              <TemperatureGauge temp={weather.temp} feelslike={weather.feelslike} />
              <div className="condition-block">
                {weather.icon ? <img src={normalizeIconUrl(weather.icon)} alt="" /> : null}
                <strong>{weather.description || 'Condition unavailable'}</strong>
                <span>Updated {formatDate(weather.timestamp || city.createdAt)}</span>
              </div>
            </div>

            <div className="aqi-band" style={{ '--aqi-color': aqiStyle.color }}>
              <span>AQI</span>
              <strong>{aqi.value || '--'}</strong>
              <em>{aqi.category || aqiStyle.label}</em>
            </div>

            <div className="history-block">
              <div className="history-header">
                <div>
                  <h3>Past trend</h3>
                  <p>{historyLoading ? 'Loading stored snapshots...' : `${history.length} stored snapshot${history.length === 1 ? '' : 's'}`}</p>
                </div>
                <div className="segmented-control" aria-label="History range">
                  {[7, 10, 15].map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={historyDays === day ? 'active' : ''}
                      onClick={() => onHistoryDaysChange(day)}
                    >
                      {day}d
                    </button>
                  ))}
                </div>
              </div>
              <TrendChart history={history} />
            </div>
          </div>

          <div className="modal-side">
            <table className="metrics-table">
              <tbody>
                <MetricRow label="Population" value={formatNumber(city.population)} />
                <MetricRow label="Humidity" value={weather.humidity ? `${weather.humidity}%` : 'Unavailable'} />
                <MetricRow label="Wind" value={weather.wind_kph ? `${weather.wind_kph} kph` : 'Unavailable'} />
                <MetricRow label="Pressure" value={weather.pressure_mb ? `${weather.pressure_mb} mb` : 'Unavailable'} />
                <MetricRow label="Visibility" value={weather.visibility_km ? `${weather.visibility_km} km` : 'Unavailable'} />
                <MetricRow label="UV index" value={weather.uv_index ?? 'Unavailable'} />
                <MetricRow label="PM2.5" value={aqi.pm2_5 ? `${aqi.pm2_5.toFixed(1)} ug/m3` : 'Unavailable'} />
                <MetricRow label="PM10" value={aqi.pm10 ? `${aqi.pm10.toFixed(1)} ug/m3` : 'Unavailable'} />
                <MetricRow label="CO" value={aqi.co ? `${aqi.co.toFixed(1)} ug/m3` : 'Unavailable'} />
                <MetricRow label="NO2" value={aqi.no2 ? `${aqi.no2.toFixed(1)} ug/m3` : 'Unavailable'} />
                <MetricRow label="O3" value={aqi.o3 ? `${aqi.o3.toFixed(1)} ug/m3` : 'Unavailable'} />
                <MetricRow label="SO2" value={aqi.so2 ? `${aqi.so2.toFixed(1)} ug/m3` : 'Unavailable'} />
              </tbody>
            </table>

            <div className="currency-card">
              <span>{rateIsLive ? 'Live currency' : 'Currency fallback'}</span>
              <strong>1 {city.currency} = {currencyRate ? formatNumber(currencyRate, { maximumFractionDigits: 2 }) : '--'} INR</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [cities, setCities] = useState([])
  const [selectedCityId, setSelectedCityId] = useState(null)
  const [lastFetched, setLastFetched] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rates, setRates] = useState({})
  const [history, setHistory] = useState([])
  const [historyDays, setHistoryDays] = useState(7)
  const [historyLoading, setHistoryLoading] = useState(false)

  const selectedCity = useMemo(
    () => cities.find((city) => city.cityId === selectedCityId) || null,
    [cities, selectedCityId]
  )

  const fetchCities = useCallback(async () => {
    try {
      setError('')
      const response = await fetch(`${API_BASE_URL}/cities`)
      if (!response.ok) throw new Error(`Backend returned ${response.status}`)

      const data = await response.json()
      const cityList = (Array.isArray(data) ? data : data.value || []).map((city) => ({
        ...CITY_METADATA[city.cityId],
        ...city
      }))
      setCities(cityList)
      setLastFetched(new Date())
    } catch (err) {
      setError(err.message || 'Could not load city data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialFetchId = window.setTimeout(fetchCities, 0)
    const intervalId = window.setInterval(fetchCities, POLL_INTERVAL)
    return () => {
      window.clearTimeout(initialFetchId)
      window.clearInterval(intervalId)
    }
  }, [fetchCities])

  const fetchHistory = useCallback(async (city, days) => {
    if (!city) {
      setHistory([])
      return
    }

    setHistoryLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/cities/${encodeURIComponent(city.cityName)}/history?days=${days}`)
      if (!response.ok) throw new Error('History unavailable')
      const data = await response.json()
      const storedHistory = Array.isArray(data) ? data : []
      setHistory(storedHistory.length ? storedHistory : buildHistoryFallback(city))
    } catch {
      setHistory(buildHistoryFallback(city))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    const historyFetchId = window.setTimeout(() => fetchHistory(selectedCity, historyDays), 0)
    return () => window.clearTimeout(historyFetchId)
  }, [fetchHistory, selectedCity, historyDays])

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch('https://open.er-api.com/v6/latest/INR')
        if (!response.ok) return
        const data = await response.json()
        const nextRates = Object.fromEntries(
          Object.entries(data.rates || {}).map(([code, inrToCurrency]) => [code, 1 / inrToCurrency])
        )
        setRates({ ...nextRates, INR: 1 })
      } catch {
        setRates({})
      }
    }

    fetchRates()
  }, [])

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Global City Insights</p>
          <h1>Real-time city map</h1>
        </div>
        <div className="status-cluster">
          <span className={`status-pill ${error ? 'error' : 'ok'}`}>{error ? 'Backend issue' : 'Live data'}</span>
          <span>Refreshes every 30s</span>
          <span>{lastFetched ? `Last pull ${lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting'}</span>
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          <strong>Could not refresh data.</strong>
          <span>{error}</span>
          <button type="button" onClick={fetchCities}>Retry</button>
        </div>
      ) : null}

      <section className="dashboard-grid">
        <div className="map-panel">
          <div className="map-header">
            <div>
              <h2>World map</h2>
              <p>Click a city marker to inspect weather, AQI, population, and currency.</p>
            </div>
            <span>{cities.length || 0} cities</span>
          </div>

          <div className="world-map" role="img" aria-label="World map with city markers">
            <svg viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
              <rect className="ocean" width="1000" height="500" />
              <path className="land" d="M95 142 C145 92 235 92 282 126 C318 152 312 196 258 204 C214 210 193 246 141 229 C89 212 50 175 95 142 Z" />
              <path className="land" d="M257 267 C323 229 403 248 437 303 C474 364 392 421 314 393 C247 369 206 299 257 267 Z" />
              <path className="land" d="M472 126 C540 78 631 98 686 149 C733 192 705 245 627 230 C568 219 524 242 477 207 C438 178 431 154 472 126 Z" />
              <path className="land" d="M512 246 C587 211 678 232 724 298 C771 365 719 429 633 410 C561 394 502 310 512 246 Z" />
              <path className="land" d="M683 163 C770 107 889 121 945 188 C1000 252 905 300 823 270 C741 241 648 207 683 163 Z" />
              <path className="land" d="M760 335 C815 304 890 325 918 376 C941 418 884 447 818 429 C754 411 711 363 760 335 Z" />
              <path className="grid-line" d="M0 125 H1000 M0 250 H1000 M0 375 H1000 M250 0 V500 M500 0 V500 M750 0 V500" />
            </svg>

            {loading ? (
              <div className="loading-state">
                <span className="spinner" />
                Loading live city data
              </div>
            ) : null}

            {cities.map((city) => (
              <CityMarker
                key={city.cityId}
                city={city}
                isSelected={city.cityId === selectedCity?.cityId}
                onSelect={setSelectedCityId}
              />
            ))}
          </div>
        </div>
      </section>

      <CityDetails
        city={selectedCity}
        rates={rates}
        onClose={() => setSelectedCityId(null)}
        history={history}
        historyDays={historyDays}
        onHistoryDaysChange={setHistoryDays}
        historyLoading={historyLoading}
      />
    </main>
  )
}

export default App
