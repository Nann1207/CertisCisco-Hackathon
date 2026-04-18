import os
import uuid
import logging
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from postgrest.exceptions import APIError

from settings import Settings
from supabase_client import get_supabase_client
from x3d_infer import build_model, predict_multiclip
from yolo_infer import YOLOContext
from vision_utils import extract_frames_bgr, bgr_to_data_url_jpeg
from sealion import generate_incident_report

settings = Settings()
logger = logging.getLogger("uvicorn.error")

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.MODEL_DIR, exist_ok=True)

app = FastAPI(title="Certic C2 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def require_auth(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return authorization.split(" ", 1)[1].strip()

# Load models once at startup (CPU)
import torch
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
X3D = build_model(settings.X3D_MODEL_NAME, settings.X3D_CHECKPOINT, device=DEVICE)
YOLO = YOLOContext(weights="yolov8n.pt")

@app.get("/health")
def health():
    return {"ok": True, "model": settings.X3D_MODEL_NAME}

@app.post("/predict")
async def predict(
    tile_id: str = Form(...),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None),
):
    user_jwt = require_auth(authorization)

    # Save upload
    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    vid_id = str(uuid.uuid4())
    out_path = os.path.join(settings.UPLOAD_DIR, f"{vid_id}_{tile_id}{ext}")
    with open(out_path, "wb") as f:
        f.write(await file.read())

    # Supabase: fetch CCTV meta + SSO info (NO HARDCODE)
    sb = get_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, user_jwt)

    try:
        # Preferred lookup for your schema where tile_id matches cctv_cameras.cctvid (e.g. "cctv1")
        cam_rows = (
            sb.table("cctv_cameras")
            .select("id,cctvid,location,coverage")
            .eq("cctvid", tile_id)
            .limit(1)
            .execute()
        ).data or []

        # Backward-compatible fallback if tile_id is an actual UUID.
        if not cam_rows:
            cam_rows = (
                sb.table("cctv_cameras")
                .select("id,cctvid,location,coverage")
                .eq("id", tile_id)
                .limit(1)
                .execute()
            ).data or []
    except APIError as e:
        detail = e.json() if callable(getattr(e, "json", None)) else {"message": str(e)}
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to query cctv_cameras. Verify SUPABASE_URL/keys and that table exists in this project.",
                "supabase": detail,
            },
        )

    cam_data = cam_rows[0] if cam_rows else None
    if not cam_data:
        raise HTTPException(status_code=400, detail=f"No CCTV metadata found for tile_id={tile_id}")

    # Your current schema does not include sso_id/sso_roster.
    sso_data = {"name": "—", "role": "Senior Security Officer", "phone": "—"}

    cctv_meta = {
        "cctvName": cam_data.get("cctvid") or tile_id.upper(),
        "location": cam_data.get("location") or "—",
        "coverage": cam_data.get("coverage") or "—",
    }

    # X3D prediction (multi-clip)
    pred = predict_multiclip(
        X3D,
        video_path=out_path,
        clip_len=settings.CLIP_LEN,
        size=settings.SIZE,
        topk=settings.TOPK,
    )

    predicted_threat = pred["predicted"]
    confidence = float(pred["confidence"])

    threat_detected = (predicted_threat.lower() != "normal") and (confidence >= settings.THREAT_THRESHOLD)

    # YOLO context (even if false positives; per your request)
    yolo_objects = YOLO.scan_video(out_path)

    # Evidence frames (3-4)
    frames = []
    for _, fr in extract_frames_bgr(out_path, num_frames=4):
        url = bgr_to_data_url_jpeg(fr)
        if url:
            frames.append(url)

    # AI report via SEA-LION
    ai_description = await generate_incident_report(
        api_key=settings.SEA_LION_API_KEY,
        model=settings.SEA_LION_MODEL,
        predicted_threat=predicted_threat,
        cctv_meta=cctv_meta,
        yolo_objects=yolo_objects,
        frame_data_urls=frames,
        max_completion_tokens=220,
    )

    logger.info(
        "predict result tile_id=%s predicted_threat=%s confidence=%.4f threat_detected=%s yolo_objects=%d",
        tile_id,
        predicted_threat,
        confidence,
        threat_detected,
        len(yolo_objects),
    )

    return {
        "tile_id": tile_id,
        "saved_to": out_path,
        "threat_detected": threat_detected,
        "predicted_threat": predicted_threat,
        "confidence": confidence,
        "topk": pred["topk"],
        "ai_description": ai_description,
        "yolo_objects": yolo_objects,
        "cctv_meta": cctv_meta,
        "sso": {
            "name": sso_data.get("name", "—"),
            "role": sso_data.get("role", "Senior Security Officer"),
            "phone": sso_data.get("phone", "—"),
        },
        "frames": frames[:4],
    }
