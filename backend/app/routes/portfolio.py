from fastapi import APIRouter

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

@router.get("")
def get_portfolio():
    return {
        "holdings": [
            {"symbol": "AAPL", "quantity": 10, "avg_cost": 185.0},
            {"symbol": "MSFT", "quantity": 5, "avg_cost": 410.0},
        ],
        "total_value": 6500.0,
    }
