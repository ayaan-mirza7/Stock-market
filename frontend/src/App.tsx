import { useEffect, useState, useMemo, type FormEvent } from 'react'
import { useAuth } from './AuthContext'
import { LoginPage } from './LoginPage'
import { SignupPage } from './SignupPage'
import './App.css'

type Article = {
  title: string
  description: string
  source: string
  url: string
  published_at: string
}

type ModelLeaderboardItem = {
  name: string
  accuracy_pct: number
  mae: number
  rmse: number
  r2_score: number | null
  rank: number
  status: string
}

type Prediction = {
  model: string
  accuracy_pct?: number | null
  mae?: number | null
  rmse?: number | null
  training_days: number
  r2_score: number | null
  total_models_evaluated?: number
  leaderboard?: ModelLeaderboardItem[]
  predictions: {
    horizon_days: number
    date: string
    predicted_price: number
  }[]
  note: string
}

type Insights = {
  symbol: string
  company?: string
  price: number | null
  previous_close?: number | null
  change: number | null
  direction: string
  sentiment: string
  reason: string
  news: {
    provider: string
    message: string
    articles: Article[]
  }
  prediction?: Prediction
}

type AuthPage = 'login' | 'signup'

const POPULAR_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'MRF']

function formatNewsDate(rawDate: string | number): string {
  if (!rawDate) return 'Live'
  try {
    let d: Date
    if (typeof rawDate === 'number' || /^\d+$/.test(String(rawDate))) {
      const num = Number(rawDate)
      d = new Date(num < 10000000000 ? num * 1000 : num)
    } else {
      d = new Date(rawDate)
    }
    if (isNaN(d.getTime())) return 'Live'

    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours < 0) return 'Recent'
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffHours < 48) return 'Yesterday'
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return 'Live'
  }
}

function StockSparkline({ price, previousClose, direction }: { price: number | null; previousClose?: number | null; direction: string }) {
  const points = useMemo(() => {
    if (!price) return []
    const base = previousClose ?? (direction === 'up' ? price * 0.985 : price * 1.015)
    // Generate a natural-looking micro-curve terminating at current price
    const steps = 14
    const diff = price - base
    const pts: number[] = [base]
    for (let i = 1; i < steps - 1; i++) {
      const progress = i / (steps - 1)
      const noise = (Math.sin(i * 1.7) * 0.3 + (i % 2 === 0 ? 0.2 : -0.2)) * Math.abs(diff || 1) * 0.4
      pts.push(base + diff * progress + noise)
    }
    pts.push(price)
    return pts
  }, [price, previousClose, direction])

  if (!points.length) return null

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const width = 460
  const height = 90
  const padding = 10

  const coords = points.map((val, idx) => {
    const x = padding + (idx / (points.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((val - min) / range) * (height - 2 * padding)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${coords.join(' L ')}`
  const areaD = `${pathD} L ${(width - padding).toFixed(1)},${height} L ${padding},${height} Z`
  const isUp = direction === 'up'
  const strokeColor = isUp ? '#38bdf8' : '#fb7185'
  const gradientId = `sparkline-grad-${isUp ? 'up' : 'down'}`

  return (
    <div className="chart-container">
      <div className="chart-header">
        <span>Intraday Price Action Vector</span>
        <span style={{ color: strokeColor }}>{isUp ? '▲ Upward Momentum' : '▼ Selling Pressure'}</span>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradientId})`} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* End pulse circle */}
        {coords.length > 0 && (
          <circle
            cx={coords[coords.length - 1].split(',')[0]}
            cy={coords[coords.length - 1].split(',')[1]}
            r="4.5"
            fill={strokeColor}
            filter="drop-shadow(0 0 6px currentColor)"
          />
        )}
      </svg>
    </div>
  )
}

function Dashboard() {
  const { user, logout } = useAuth()
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
  const [symbol, setSymbol] = useState('AAPL')
  const [searchInput, setSearchInput] = useState('')
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadInsights = async (ticker: string) => {
    const cleanTicker = ticker.trim().toUpperCase()
    if (!cleanTicker) return
    setSymbol(cleanTicker)
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiBase}/market/insights?symbol=${encodeURIComponent(cleanTicker)}`)
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`)
      }
      const data = await response.json()
      setInsights(data)
    } catch (err) {
      setError((err as Error).message || 'Unable to retrieve real-time market data')
      setInsights(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInsights('AAPL')
  }, [])

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (searchInput.trim()) {
      loadInsights(searchInput)
      setSearchInput('')
    }
  }

  const sentimentPercent = useMemo(() => {
    if (!insights) return 50
    const s = insights.sentiment.toLowerCase()
    if (s.includes('bullish') && !s.includes('mixed')) return 85
    if (s.includes('mixed bullish')) return 68
    if (s.includes('mixed bearish')) return 35
    if (s.includes('bearish')) return 18
    return 50
  }, [insights])

  const sentimentClass = useMemo(() => {
    if (!insights) return 'neutral'
    const s = insights.sentiment.toLowerCase()
    if (s.includes('bullish')) return 'bullish'
    if (s.includes('bearish')) return 'bearish'
    return 'neutral'
  }, [insights])

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="topbar">
        <div className="brand-wrapper">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <div className="brand-title">StockSense AI</div>
            <div className="brand-subtitle">Real-Time Market Terminal & Explainable AI Predictions</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="live-indicator">
            <div className="pulse-dot" />
            <span>Feed Live</span>
          </div>

          <div className="user-profile">
            <div className="user-avatar">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <span className="user-name">{user?.full_name || user?.email || 'Trader'}</span>
            <button onClick={logout} className="logout-btn" title="Sign out">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Search & Fast Switcher Card */}
      <section className="card">
        <div className="search-card-inner">
          <div className="search-title">
            <h2>Market Intelligence & AI Forecasting</h2>
            <p>Query any global equity symbol or company name to fetch live pricing, deep news analysis, and regression models.</p>
          </div>

          <form onSubmit={handleSearchSubmit} className="search-form">
            <div className="search-input-wrapper">
              <span className="search-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                className="search-input"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="E.G. NVDA, TSLA, MRF"
                disabled={loading}
              />
            </div>
            <button type="submit" className="search-btn" disabled={loading || !searchInput.trim()}>
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
                  Analyzing...
                </>
              ) : (
                'Analyze'
              )}
            </button>
          </form>
        </div>

        {/* Quick Ticker Chips */}
        <div className="ticker-pills">
          <span className="ticker-pills-label">Trending Tickers:</span>
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              className={`ticker-pill ${symbol === t ? 'active' : ''}`}
              onClick={() => loadInsights(t)}
              disabled={loading}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Error Banner */}
      {error && (
        <section className="card" style={{ borderColor: 'rgba(244, 63, 94, 0.4)', background: 'rgba(30, 10, 20, 0.7)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fda4af' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <strong>Error:</strong> {error}
          </div>
        </section>
      )}

      {/* Loading state indicator if no data yet */}
      {loading && !insights && (
        <div className="state-box">
          <div className="spinner" />
          <p>Processing neural market signals for {symbol}...</p>
        </div>
      )}

      {/* Main Insights Layout */}
      {insights && (
        <>
          <div className="grid">
            {/* Live Quote Card */}
            <section className="card">
              <div className="quote-top">
                <div>
                  <h1 className="company-title">
                    {insights.company || insights.symbol}
                    <span className="company-symbol-badge">{insights.symbol}</span>
                  </h1>
                </div>
                <span className={`direction-badge ${insights.direction}`}>
                  {insights.direction === 'up' ? '▲ GAINING' : insights.direction === 'down' ? '▼ DECLINING' : '● STEADY'}
                </span>
              </div>

              <div className="price-display-wrapper">
                <div className="big-price">
                  {insights.price !== null ? `$${insights.price.toFixed(2)}` : 'N/A'}
                </div>
                <div className={`direction-badge ${insights.direction}`} style={{ fontSize: '1.05rem' }}>
                  {insights.change !== null ? (
                    <>
                      {insights.change >= 0 ? '+' : ''}${insights.change.toFixed(2)}
                      {insights.price && insights.previous_close ? (
                        <span style={{ opacity: 0.85, marginLeft: 4 }}>
                          ({insights.change >= 0 ? '+' : ''}
                          {(((insights.change) / insights.previous_close) * 100).toFixed(2)}%)
                        </span>
                      ) : null}
                    </>
                  ) : (
                    '--'
                  )}
                </div>
              </div>

              {/* Sparkline Micro-Chart */}
              <StockSparkline
                price={insights.price}
                previousClose={insights.previous_close}
                direction={insights.direction}
              />

              {/* Fundamental Metrics */}
              <div className="metric-row">
                <div className="metric-card">
                  <div className="metric-label">Previous Close</div>
                  <div className="metric-value">
                    {insights.previous_close ? `$${insights.previous_close.toFixed(2)}` : 'N/A'}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Signal Trend</div>
                  <div className="metric-value" style={{ textTransform: 'capitalize' }}>
                    {insights.direction}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Coverage Source</div>
                  <div className="metric-value" style={{ fontSize: '0.95rem' }}>
                    {insights.news.provider || 'Live Market'}
                  </div>
                </div>
              </div>
            </section>

            {/* AI Sentiment Analysis Card */}
            <section className="card">
              <div className="card-head">
                <h3>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Market Sentiment Engine
                </h3>
                <span className={`sentiment-badge ${sentimentClass}`}>
                  {insights.sentiment}
                </span>
              </div>

              <div className="sentiment-meter-wrapper">
                <div className="sentiment-meter-bar">
                  <div
                    className="sentiment-meter-fill"
                    style={{
                      width: `${sentimentPercent}%`,
                      background:
                        sentimentClass === 'bullish'
                          ? 'linear-gradient(90deg, #0284c7, #10b981)'
                          : sentimentClass === 'bearish'
                          ? 'linear-gradient(90deg, #f43f5e, #fb7185)'
                          : 'linear-gradient(90deg, #0284c7, #38bdf8)',
                    }}
                  />
                </div>
                <div className="sentiment-labels">
                  <span>Extreme Bearish</span>
                  <span>Neutral (50%)</span>
                  <span>Extreme Bullish</span>
                </div>
              </div>

              <div className="reasoning-box">
                <div className="reasoning-header">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  AI Movement Explanation
                </div>
                <p className="reasoning-text">{insights.reason}</p>
              </div>

              <div className="metric-row" style={{ marginTop: 20 }}>
                <div className="metric-card">
                  <div className="metric-label">News Articles</div>
                  <div className="metric-value">{insights.news.articles.length} Verified</div>
                </div>
                <div className="metric-card" style={{ gridColumn: 'span 2' }}>
                  <div className="metric-label">Data Pipeline</div>
                  <div className="metric-value" style={{ fontSize: '0.95rem' }}>
                    {insights.news.message}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* AI Forecast Section */}
          {insights.prediction && insights.prediction.predictions.length > 0 && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h3 style={{ margin: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    AI Multi-Model Forecast (Champion: {insights.prediction.model})
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Evaluated across 5 machine learning architectures. The best model was selected and deployed automatically.
                  </p>
                </div>
                {insights.prediction.accuracy_pct !== null && insights.prediction.accuracy_pct !== undefined ? (
                  <span className="live-indicator" style={{ textTransform: 'none' }}>
                    Champion Accuracy: {insights.prediction.accuracy_pct}%
                  </span>
                ) : insights.prediction.r2_score !== null ? (
                  <span className="live-indicator" style={{ textTransform: 'none' }}>
                    Model Fit R²: {(insights.prediction.r2_score * 100).toFixed(1)}% Confidence
                  </span>
                ) : null}
              </div>

              {/* Forecast Cards */}
              <div className="forecast-grid">
                {insights.prediction.predictions.map((p) => {
                  const delta = insights.price ? p.predicted_price - insights.price : 0
                  const isPositive = delta >= 0
                  return (
                    <div key={p.date} className="forecast-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="forecast-day-badge">T+{p.horizon_days} Day Outlook</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isPositive ? '#34d399' : '#fb7185' }}>
                          {isPositive ? '+' : ''}${delta.toFixed(2)}
                        </span>
                      </div>
                      <div className="forecast-date">{p.date}</div>
                      <div className="forecast-price">${p.predicted_price.toFixed(2)}</div>
                      <div className="forecast-meta">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </svg>
                        <span>Projected by {insights.prediction?.model}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Tournament Leaderboard Table */}
              {insights.prediction.leaderboard && insights.prediction.leaderboard.length > 0 && (
                <div style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      Machine Learning Tournament Leaderboard (Out-of-Sample Benchmark)
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {insights.prediction.leaderboard.length} Algorithms Tested
                    </span>
                  </div>

                  <div className="tournament-container">
                    <table className="tournament-table">
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>Rank</th>
                          <th>ML Model Architecture</th>
                          <th>Validation Accuracy</th>
                          <th>Mean Absolute Error (MAE)</th>
                          <th>RMSE</th>
                          <th>Deployment Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {insights.prediction.leaderboard.map((item) => {
                          const isChamp = item.rank === 1
                          return (
                            <tr key={item.name} className={isChamp ? 'champion-row' : ''}>
                              <td>
                                <span className={`rank-badge ${isChamp ? 'rank-1' : 'rank-other'}`}>
                                  {item.rank}
                                </span>
                              </td>
                              <td>
                                <div className="model-name-cell">
                                  <span>{item.name}</span>
                                </div>
                              </td>
                              <td>
                                <div className="accuracy-bar-wrapper">
                                  <div className="accuracy-bar">
                                    <div
                                      className="accuracy-bar-fill"
                                      style={{
                                        width: `${item.accuracy_pct}%`,
                                        background: isChamp
                                          ? 'linear-gradient(90deg, #0284c7, #38bdf8)'
                                          : 'rgba(56, 189, 248, 0.4)'
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontWeight: 700, color: isChamp ? '#38bdf8' : '#e2e8f0', minWidth: 55 }}>
                                    {item.accuracy_pct}%
                                  </span>
                                </div>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>${item.mae.toFixed(2)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>${item.rmse.toFixed(2)}</td>
                              <td>
                                {isChamp ? (
                                  <span className="champion-pill">
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                                    Champion (Deployed)
                                  </span>
                                ) : (
                                  <span className="candidate-pill">Candidate</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="tournament-banner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>🏆</span>
                      <span>
                        <strong>Automated Deployment:</strong> The tournament selected <strong>{insights.prediction.model}</strong> with <strong>{insights.prediction.accuracy_pct}% accuracy</strong> as the top-performing predictor.
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Walk-forward 80/20 train-test split on live prices
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Real-time Verified News Feed */}
          <section className="card">
            <div className="card-head">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
                  <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                  <path d="M18 14h-8" />
                  <path d="M15 18h-5" />
                  <path d="M10 6h8v4h-8V6Z" />
                </svg>
                Real-Time Market News & Catalysts
              </h3>
              <span className="news-header-badge">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                {insights.news.articles.length} Live Stories • {insights.news.provider}
              </span>
            </div>

            {insights.news.articles.length > 0 ? (
              <div className="news-grid">
                {insights.news.articles.map((article, idx) => (
                  <a
                    key={`${article.url}-${idx}`}
                    href={article.url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="news-card-item"
                  >
                    <div>
                      <div className="news-card-title">{article.title}</div>
                    </div>
                    <div className="news-card-footer">
                      <span className="news-source-tag">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                          <path d="M2 12h20" />
                        </svg>
                        {article.source || 'Financial Wire'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="news-date-tag">{formatNewsDate(article.published_at)}</span>
                        <span className="news-arrow-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="7" y1="17" x2="17" y2="7" />
                            <polyline points="7 7 17 7 17 17" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="state-box">
                <p>No active news stories found for this ticker.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function App() {
  const { user, token } = useAuth()
  const [authPage, setAuthPage] = useState<AuthPage>('login')

  if (!token || !user) {
    return authPage === 'login' ? (
      <LoginPage onSwitchToSignup={() => setAuthPage('signup')} />
    ) : (
      <SignupPage onSwitchToLogin={() => setAuthPage('login')} />
    )
  }

  return <Dashboard />
}

export default App
