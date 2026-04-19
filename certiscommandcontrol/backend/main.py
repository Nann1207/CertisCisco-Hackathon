import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Any, Dict, List

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

ALLOWED_SUPERVISOR_ROLES = {"security supervisor", "senior security officer"}


def normalize_text(v: Any) -> str:
    return str(v or "").strip().lower()


def threat_to_incident_category(predicted_threat: str) -> str:
    t = normalize_text(predicted_threat)
    if t in {"arson", "explosion"}:
        return "Fire & Evacuation"
    if t in {"robbery", "burglary", "shoplifting", "stealing"}:
        return "Robbery"
    if t in {"abuse", "assault", "fighting", "shooting", "vandalism"}:
        return "Violence"
    if t in {"roadaccidents"}:
        return "Medical"
    if t in {"arrest"}:
        return "Suspicious Person"
    return "Suspicious Person"


def build_incident_name(predicted_threat: str, cctvid: str) -> str:
    label = (predicted_threat or "incident").replace("_", " ").strip().title()
    return f"{label} detected on {cctvid}"


def select_active_supervisor(
    sb,
    cctv_row: Dict[str, Any],
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    today_iso = now_utc.date().isoformat()

    shifts = (
        sb.table("shifts")
        .select("shift_id,supervisor_id,shift_date,shift_start,shift_end,location")
        .eq("shift_date", today_iso)
        .lte("shift_start", now_iso)
        .gte("shift_end", now_iso)
        .not_.is_("supervisor_id", "null")
        .execute()
    ).data or []

    location_candidates = {
        normalize_text(cctv_row.get("main_location")),
        normalize_text(cctv_row.get("location_name")),
        normalize_text(cctv_row.get("location")),
    }
    location_candidates.discard("")

    matched_shifts = []
    for s in shifts:
        shift_loc = normalize_text(s.get("location"))
        if not location_candidates or shift_loc in location_candidates:
            matched_shifts.append(s)

    if not matched_shifts:
        return None, None

    supervisor_ids = list({s.get("supervisor_id") for s in matched_shifts if s.get("supervisor_id")})
    if not supervisor_ids:
        return None, None

    employees = (
        sb.table("employees")
        .select("id,first_name,last_name,role,phone")
        .in_("id", supervisor_ids)
        .execute()
    ).data or []

    sup_by_id = {
        e["id"]: e
        for e in employees
        if normalize_text(e.get("role")) in ALLOWED_SUPERVISOR_ROLES
    }
    if not sup_by_id:
        return None, None

    for s in matched_shifts:
        sup = sup_by_id.get(s.get("supervisor_id"))
        if sup:
            return sup, s

    return None, None


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
            .select("id,cctvid,location,coverage,latitude,longitude,location_name,main_location")
            .eq("cctvid", tile_id)
            .limit(1)
            .execute()
        ).data or []

        # Backward-compatible fallback if tile_id is an actual UUID.
        if not cam_rows:
            cam_rows = (
                sb.table("cctv_cameras")
                .select("id,cctvid,location,coverage,latitude,longitude,location_name,main_location")
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

    matched_supervisor = None
    matched_shift = None
    try:
        matched_supervisor, matched_shift = select_active_supervisor(sb, cam_data)
    except APIError as e:
        logger.warning("active supervisor lookup failed: %s", e)

    if matched_supervisor:
        first_name = str(matched_supervisor.get("first_name") or "").strip()
        last_name = str(matched_supervisor.get("last_name") or "").strip()
        full_name = f"{first_name} {last_name}".strip() or "—"
        sso_data = {
            "id": matched_supervisor.get("id"),
            "name": full_name,
            "role": matched_supervisor.get("role", "Security Supervisor"),
            "phone": matched_supervisor.get("phone", "—"),
            "shift_id": matched_shift.get("shift_id") if matched_shift else None,
        }
    else:
        sso_data = {"id": None, "name": "—", "role": "Security Supervisor", "phone": "—", "shift_id": None}

    cctv_meta = {
        "cctvName": cam_data.get("cctvid") or tile_id.upper(),
        "location": cam_data.get("location_name") or cam_data.get("main_location") or cam_data.get("location") or "—",
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
        confidence=confidence,
        threat_detected=threat_detected,
        topk_predictions=pred["topk"],
        cctv_meta=cctv_meta,
        yolo_objects=yolo_objects,
        frame_data_urls=frames,
        max_completion_tokens=420,
    )

    logger.info(
        "predict result tile_id=%s predicted_threat=%s confidence=%.4f threat_detected=%s yolo_objects=%d",
        tile_id,
        predicted_threat,
        confidence,
        threat_detected,
        len(yolo_objects),
    )

    incident_id = None
    if threat_detected:
        incident_payload = {
            "incident_name": build_incident_name(predicted_threat, cam_data.get("cctvid") or tile_id.upper()),
            "incident_category": threat_to_incident_category(predicted_threat),
            "location_name": cam_data.get("location_name") or cam_data.get("main_location") or cam_data.get("location") or "Unknown",
            "location_unit_no": cam_data.get("location"),
            "location_description": cam_data.get("coverage"),
            "latitude": cam_data.get("latitude"),
            "longitude": cam_data.get("longitude"),
            "cctv_image_1": frames[0] if len(frames) > 0 else None,
            "cctv_image_2": frames[1] if len(frames) > 1 else None,
            "cctv_image_3": frames[2] if len(frames) > 2 else None,
            "prediction_correct": None,
            "active_status": True,
            "cctv_camera_id": cam_data.get("id"),
            "cctvid": cam_data.get("cctvid"),
            "shift_id": matched_shift.get("shift_id") if matched_shift else None,
            "supervisor_id": matched_supervisor.get("id") if matched_supervisor else None,
            "predicted_threat": predicted_threat,
            "threat_confidence": confidence,
            "threat_detected": threat_detected,
            "ai_assessment": ai_description,
            "yolo_objects": yolo_objects,
        }
        try:
            created = (
                sb.table("incidents")
                .insert(incident_payload)
                .execute()
            ).data or []
            if created:
                incident_id = created[0].get("incident_id")
                logger.info("incident created incident_id=%s tile_id=%s", incident_id, tile_id)
        except APIError as e:
            logger.warning("incident insert failed tile_id=%s error=%s", tile_id, e)

    return {
        "tile_id": tile_id,
        "saved_to": out_path,
        "incident_id": incident_id,
        "threat_detected": threat_detected,
        "predicted_threat": predicted_threat,
        "confidence": confidence,
        "topk": pred["topk"],
        "ai_description": ai_description,
        "yolo_objects": yolo_objects,
        "cctv_meta": cctv_meta,
        "sso": {
            "id": sso_data.get("id"),
            "shift_id": sso_data.get("shift_id"),
            "name": sso_data.get("name", "—"),
            "role": sso_data.get("role", "Security Supervisor"),
            "phone": sso_data.get("phone", "—"),
        },
        "frames": frames[:4],
    }
