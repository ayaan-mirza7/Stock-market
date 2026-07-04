import { useEffect, useState } from 'react'
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

type Prediction = {
  model: string
  training_days: number
  r2_score: number | null
  predictions: {
    horizon_days: number
    date: string
    predicted_price: number
  }[]
  note: string
}

type Insights = {
  symbol: string
  price: number | null
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

function Dashboard() {
  const { logout } = useAuth()
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
  const [symbol, setSymbol] = useState('AAPL')
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadInsights = async (ticker = 'AAPL') => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${apiBase}/market/insights?symbol=${encodeURIComponent(ticker)}`)
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`)
      }
      const data = await response.json()
      setInsights(data)
    } catch (err) {
      setError((err as Error).message || 'Unable to load insights')
      setInsights(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInsights('AAPL')
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">StockSense AI</div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8' }}>
            Live stock insights with news-driven explanations
          </p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <span className="badge">Realtime • News • Explainable</span>
          <button
            onClick={logout}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="row">
          <div>
            <h2 style={{ margin: 0 }}>Analyze a company</h2>
            <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
              Enter a ticker symbol to get live price, sentiment, and news-based reason.
            </p>
          </div>
          <div className="symbol-form">
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="Enter ticker e.g. AAPL"
            />
            <button onClick={() => loadInsights(symbol)} disabled={loading || !symbol.trim()}>
              {loading ? 'Loading...' : 'Analyze'}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="card">
          <strong style={{ color: '#fb7185' }}>Error:</strong> {error}
        </section>
      ) : null}

      {insights ? (
        <div className="grid">
          <section className="card">
            <div className="row">
              <h3 style={{ margin: 0 }}>Live Quote</h3>
              <span className="chip">{insights.direction.toUpperCase()}</span>
            </div>
            <div className="metric-row" style={{ marginTop: 18 }}>
              <div className="metric">
                <div className="label">Symbol</div>
                <div className="value">{insights.symbol}</div>
              </div>
              <div className="metric">
                <div className="label">Price</div>
                <div className="value">{insights.price !== null ? `$${insights.price.toFixed(2)}` : 'N/A'}</div>
              </div>
              <div className="metric">
                <div className="label">Change</div>
                <div className="value">
                  {insights.change !== null ? `${insights.change >= 0 ? '+' : ''}${insights.change.toFixed(2)}` : 'N/A'}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0 }}>Market Sentiment</h3>
            <div className="metric-row" style={{ marginTop: 18 }}>
              <div className="metric">
                <div className="label">Signal</div>
                <div className="value">{insights.sentiment}</div>
              </div>
              <div className="metric">
                <div className="label">News provider</div>
                <div className="value">{insights.news.provider}</div>
              </div>
            </div>
            <p style={{ marginTop: 18, color: '#cbd5e1' }}>{insights.reason}</p>
          </section>
        </div>
      ) : null}

      {insights?.prediction ? (
        <section className="card">
          <div className="row">
            <h3 style={{ marginTop: 0 }}>AI Price Forecast</h3>
          </div>
          <div className="list" style={{ marginTop: 18 }}>
            {insights.prediction.predictions.map((item) => (
              <div key={item.date} className="list-item">
                <div>
                  <strong>{item.date}</strong>
                  <div style={{ color: '#94a3b8', marginTop: 4 }}>{item.horizon_days} day forecast</div>
                </div>
                <div style={{ fontWeight: 700 }}>${item.predicted_price.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {insights ? (
        <div className="grid" style={{ marginTop: 20 }}>
          <section className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="row">
              <h3 style={{ margin: 0 }}>Latest News</h3>
              <span className="chip">{insights.news.message}</span>
            </div>
            <div className="list" style={{ marginTop: 14 }}>
              {insights.news.articles.length > 0 ? (
                insights.news.articles.map((article) => (
                  <a key={article.url} className="list-item news-link" href={article.url} target="_blank" rel="noreferrer">
                    <div>
                      <strong>{article.title}</strong>
                      <div style={{ color: '#94a3b8', marginTop: 4 }}>{article.source}</div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{new Date(article.published_at).toLocaleDateString()}</div>
                  </a>
                ))
              ) : (
                <div className="list-item" style={{ justifyContent: 'center' }}>
                  No news available. Set NEWS_API_KEY in the backend environment.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
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
