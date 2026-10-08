import asyncio
import random
import time

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

    start = time.perf_counter()
    try:
        result_rf, result_svm = await asyncio.gather(
            run_model_rf(input),
            run_model_svm(input),
        )
    except Exception as exc:
        wait_time_ms = round((time.perf_counter() - start) * 1000, 2)
        return {"status": "error", "message": str(exc), "result": [], "wait_time_ms": wait_time_ms}

    wait_time_ms = round((time.perf_counter() - start) * 1000, 2)
    return {
        "status": "success",
        "input": input,
        "result": [result_rf, result_svm],
        "wait_time_ms": wait_time_ms,
    }
