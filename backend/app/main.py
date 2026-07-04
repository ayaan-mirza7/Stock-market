from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import health, market, portfolio, auth

app = FastAPI(title="StockSense AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(portfolio.router)
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"message": "StockSense AI backend is running"}
