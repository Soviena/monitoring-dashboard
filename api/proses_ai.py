import asyncio
import random

from fastapi import FastAPI

app = FastAPI()

LABELS = ["AMAN", "BAHAYA"]


async def run_model_rf(input_text: str) -> dict:
    """Simulated Random Forest inference — no real model, fixed 300ms latency."""
    await asyncio.sleep(0.3)
    if random.random() < 0.05:
        raise RuntimeError("Random Forest model timed out")
    return {
        "model": "Random Forest",
        "prediction": random.choice(LABELS),
        "confidence": round(random.uniform(0.70, 0.99), 4),
    }


async def run_model_svm(input_text: str) -> dict:
    """Simulated SVM inference — no real model, fixed 500ms latency."""
    await asyncio.sleep(0.5)
    if random.random() < 0.05:
        raise RuntimeError("SVM model timed out")
    return {
        "model": "SVM",
        "prediction": random.choice(LABELS),
        "confidence": round(random.uniform(0.70, 0.99), 4),
    }


@app.get("/api/proses_ai")
async def proses_ai(input: str = ""):
    if not input.strip():
        return {"status": "error", "message": "query parameter 'input' is required", "result": []}

    try:
        result_rf, result_svm = await asyncio.gather(
            run_model_rf(input),
            run_model_svm(input),
        )
    except Exception as exc:
        return {"status": "error", "message": str(exc), "result": []}

    return {"status": "success", "input": input, "result": [result_rf, result_svm]}
