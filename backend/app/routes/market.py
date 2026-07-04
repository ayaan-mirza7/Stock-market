from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List
import os
import requests
from datetime import datetime, timedelta

import numpy as np

try:
    import yfinance as yf
except ImportError:  # pragma: no cover - optional dependency
    yf = None

try:
    from sklearn.linear_model import LinearRegression
except ImportError:
    LinearRegression = None

router = APIRouter(prefix="/api/market", tags=["market"])
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

POSITIVE_KEYWORDS = [
    "beats", "upgrade", "profit", "growth", "strong", "record", "expansion", "partnership", "buy", "acquisition", "surge",
]
NEGATIVE_KEYWORDS = [
    "misses", "downgrade", "loss", "weak", "decline", "lawsuit", "regulatory", "recall", "sell", "cut", "drop",
]


def ensure_yfinance() -> None:
    if yf is None:
        raise HTTPException(status_code=503, detail="yfinance is not installed. Please install it in backend requirements.")


def yahoo_search(query: str) -> Dict[str, Any]:
    query = query.strip()
    if not query:
        return {"symbol": "", "company": "", "news": []}

    try:
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        params = {"q": query, "quotesCount": 5, "newsCount": 6}
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return {"symbol": query, "company": query, "news": []}

    quotes = payload.get("quotes", [])
    news_items = payload.get("news", [])
    symbol = quotes[0].get("symbol") if quotes else query
    company = quotes[0].get("longname") or quotes[0].get("shortname") or query
    if company.strip().upper() == symbol.strip().upper():
        company = query

    return {"symbol": symbol.upper(), "company": company, "news": news_items}


def normalize_history(symbol: str) -> List[Dict[str, Any]]:
    ensure_yfinance()
    ticker = yf.Ticker(symbol)
    data = ticker.history(period="5d", interval="1h")
    if data.empty:
        return []
    return data.reset_index().to_dict(orient="records")


def parse_yahoo_news(raw_news: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    articles = []
    for item in raw_news[:6]:
        title = item.get("title") or item.get("headline")
        if not title:
            continue
        articles.append({
            "title": title,
            "description": item.get("summary", ""),
            "source": item.get("publisher", "") or item.get("source", ""),
            "url": item.get("link", "") or item.get("url", ""),
            "published_at": item.get("providerPublishTime", ""),
        })
    return articles


def fetch_news(symbol: str, query: str) -> Dict[str, Any]:
    if NEWS_API_KEY:
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": f"{query} stock OR {symbol} stock",
            "apiKey": NEWS_API_KEY,
            "language": "en",
            "pageSize": 6,
            "sortBy": "relevancy",
        }
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            payload = response.json()
            articles = []
            for item in payload.get("articles", []):
                articles.append({
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "source": item.get("source", {}).get("name", ""),
                    "url": item.get("url", ""),
                    "published_at": item.get("publishedAt", ""),
                })
            if articles:
                return {"provider": "newsapi.org", "message": payload.get("status", "ok"), "articles": articles}
        except Exception:
            pass

    fallback = yahoo_search(query)
    return {"provider": "yahoo", "message": "fallback live news from Yahoo Finance", "articles": parse_yahoo_news(fallback.get("news", []))}


def fetch_history_prices(symbol: str, days: int = 60) -> List[Dict[str, Any]]:
    if not symbol:
        return []
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        params = {"interval": "1d", "range": f"{days}d"}
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        payload = response.json()
        results = payload.get("chart", {}).get("result", [])
        if not results:
            return []
        result = results[0]
        timestamps = result.get("timestamp", [])
        indicators = result.get("indicators", {}).get("quote", [])
        if not timestamps or not indicators:
            return []
        closes = indicators[0].get("close", [])
        prices = []
        for ts, close in zip(timestamps, closes):
            if close is None:
                continue
            prices.append({"date": datetime.utcfromtimestamp(ts).date(), "close": float(close)})
        return prices
    except Exception:
        return []


def train_live_price_model(symbol: str, days: int = 60, horizon_days: int = 3) -> Dict[str, Any]:
    history_prices = fetch_history_prices(symbol, days)
    if len(history_prices) < 10:
        return {
            "model": "none",
            "training_days": len(history_prices),
            "r2_score": None,
            "predictions": [],
            "note": "Not enough historical data to train a model.",
        }

    df = history_prices
    start_date = df[0]["date"]
    X = np.array([[(row["date"] - start_date).days] for row in df])
    y = np.array([row["close"] for row in df])

    model_type = "LinearRegression" if LinearRegression is not None else "PolynomialRegression"
    score = None
    predictions = []

    if LinearRegression is not None:
        model = LinearRegression()
        model.fit(X, y)
        score = float(model.score(X, y))
        last_day = int(X[-1][0])
        for horizon in range(1, horizon_days + 1):
            future_day = np.array([[last_day + horizon]])
            predicted = float(model.predict(future_day)[0])
            predicted = round(predicted, 2)
            prediction_date = (start_date + timedelta(days=last_day + horizon)).isoformat()
            predictions.append({"horizon_days": horizon, "date": prediction_date, "predicted_price": predicted})
    else:
        coeffs = np.polyfit(X.flatten(), y, 2)
        poly = np.poly1d(coeffs)
        last_day = int(X[-1][0])
        for horizon in range(1, horizon_days + 1):
            predicted = round(float(poly(last_day + horizon)), 2)
            prediction_date = (start_date + timedelta(days=last_day + horizon)).isoformat()
            predictions.append({"horizon_days": horizon, "date": prediction_date, "predicted_price": predicted})

    return {
        "model": model_type,
        "training_days": len(df),
        "r2_score": round(score, 4) if score is not None else None,
        "predictions": predictions,
        "note": f"Model trained on live daily close prices from the last {len(df)} days.",
    }


def analyze_headlines(articles: List[Dict[str, Any]], change: float) -> Dict[str, str]:
    text = " ".join([article.get("title", "") for article in articles]).lower()
    score = sum(1 for keyword in POSITIVE_KEYWORDS if keyword in text) - sum(1 for keyword in NEGATIVE_KEYWORDS if keyword in text)
    sentiment = "Neutral"
    if score >= 2:
        sentiment = "Bullish"
    elif score <= -2:
        sentiment = "Bearish"
    elif change is not None and change > 0:
        sentiment = "Mixed Bullish"
    elif change is not None and change < 0:
        sentiment = "Mixed Bearish"

    reason = "The latest news headlines are not available."
    if articles:
        headline = articles[0].get("title", "")
        if score > 1:
            reason = f"The latest news is positive and may be driving the move: {headline}"
        elif score < -1:
            reason = f"The latest news is negative and may be driving the move: {headline}"
        else:
            reason = f"Recent news headlines mention the company: {headline}"

    if not articles:
        if change is not None:
            if change > 0:
                reason = "The stock is moving higher today based on market momentum."
            elif change < 0:
                reason = "The stock is moving lower today based on selling pressure."
            else:
                reason = "The stock is trading flat with no strong move."

    return {"sentiment": sentiment, "reason": reason}


def resolve_company_query(symbol: str) -> Dict[str, str]:
    query = symbol.strip()
    if not query:
        return {"symbol": "", "company": ""}

    search = yahoo_search(query)
    company = search["company"]
    if not company and yf is not None:
        try:
            ticker = yf.Ticker(search["symbol"])
            info = getattr(ticker, "info", {}) or {}
            company = info.get("longName") or info.get("shortName") or search["symbol"]
        except Exception:
            company = search["symbol"]

    return {"symbol": search["symbol"], "company": company}


def fetch_quote_from_yahoo(symbol: str) -> Dict[str, Any]:
    if not symbol:
        return {}
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        params = {"interval": "2m", "range": "2d"}
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        payload = response.json()
        results = payload.get("chart", {}).get("result", [])
        if not results:
            return {}
        meta = results[0].get("meta", {})
        price = meta.get("regularMarketPrice") or meta.get("previousClose")
        prev_price = meta.get("previousClose")
        if price is None or prev_price is None:
            quote = results[0].get("indicators", {}).get("quote", [])
            if quote and quote[0].get("close"):
                close_values = [v for v in quote[0].get("close", []) if v is not None]
                if close_values:
                    price = close_values[-1]
                    prev_price = close_values[-2] if len(close_values) > 1 else price
        if price is None or prev_price is None:
            return {}
        price = round(float(price), 2)
        prev_price = round(float(prev_price), 2)
        change = round(price - prev_price, 2)
        direction = "up" if change > 0 else "down" if change < 0 else "flat"
        return {"price": price, "previous_close": prev_price, "change": change, "direction": direction}
    except Exception:
        return {}


def get_quote_from_yfinance(symbol: str) -> Dict[str, Any]:
    try:
        ticker = yf.Ticker(symbol)
        data = ticker.history(period="2d", interval="1m")
        if data.empty:
            data = ticker.history(period="5d", interval="1d")
        if not data.empty:
            latest = data.iloc[-1]
            previous = data.iloc[-2] if len(data) > 1 else latest
            price = round(float(latest["Close"]), 2)
            prev_price = round(float(previous["Close"]), 2)
            change = round(price - prev_price, 2)
            direction = "up" if change > 0 else "down" if change < 0 else "flat"
            return {
                "price": price,
                "previous_close": prev_price,
                "change": change,
                "direction": direction,
            }
    except Exception:
        pass
    return {}


@router.get("/quote")
def get_quote(symbol: str = "AAPL") -> Dict[str, Any]:
    resolved = resolve_company_query(symbol)
    quote_data = fetch_quote_from_yahoo(resolved["symbol"])
    if not quote_data and yf is not None:
        quote_data = get_quote_from_yfinance(resolved["symbol"])

    if not quote_data:
        return {"symbol": resolved["symbol"], "company": resolved["company"], "price": None, "change": None, "direction": "unknown"}

    return {
        "symbol": resolved["symbol"],
        "company": resolved["company"],
        **quote_data,
    }


@router.get("/history")
def get_history(symbol: str = "AAPL") -> Dict[str, Any]:
    resolved = resolve_company_query(symbol)
    return {"symbol": resolved["symbol"], "company": resolved["company"], "records": normalize_history(resolved["symbol"]) }


@router.get("/insights")
def get_insights(symbol: str = "AAPL") -> Dict[str, Any]:
    resolved = resolve_company_query(symbol)
    quote = get_quote(symbol)
    news = fetch_news(resolved["symbol"], resolved["company"])
    analysis = analyze_headlines(news.get("articles", []), quote.get("change", 0.0))

    prediction = train_live_price_model(resolved["symbol"], days=60, horizon_days=3)
    return {
        "symbol": quote["symbol"],
        "company": quote.get("company", resolved["company"]),
        "price": quote["price"],
        "change": quote["change"],
        "direction": quote["direction"],
        "sentiment": analysis["sentiment"],
        "reason": analysis["reason"],
        "news": news,
        "prediction": prediction,
    }
