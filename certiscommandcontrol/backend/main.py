import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Any, Dict, List

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from postgrest.exceptions import APIError

from settings import Settings
from supabase_client import get_supabase_client, get_supabase_service_client
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
SUPERVISOR_ROLE_PRIORITY = {
    "senior security officer": 0,
    "security supervisor": 1,
}
SERVICE_SUPABASE_CLIENT = None


def normalize_text(v: Any) -> str:
    return str(v or "").strip().lower()


def build_employee_display_name(employee: Optional[Dict[str, Any]]) -> str:
    if not employee:
        return "—"
    first_name = str(employee.get("first_name") or "").strip()
    last_name = str(employee.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    if full_name:
        return full_name
    return str(employee.get("emp_id") or employee.get("id") or "—")


def location_matches(shift_location: Any, location_candidates: set[str]) -> bool:
    shift_loc = normalize_text(shift_location)
    if not location_candidates:
        return True
    if not shift_loc:
        return False
    for candidate in location_candidates:
        if not candidate:
            continue
        if shift_loc == candidate or shift_loc in candidate or candidate in shift_loc:
            return True
    return False


def supervisor_priority(role: Any) -> int:
    return SUPERVISOR_ROLE_PRIORITY.get(normalize_text(role), 99)


def choose_supervisor_from_shift_group(
    shifts: List[Dict[str, Any]],
    location_candidates: set[str],
    supervisors_by_id: Dict[str, Dict[str, Any]],
) -> tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    if not shifts:
        return None, None

    matched = [s for s in shifts if location_matches(s.get("location"), location_candidates)]
    if not matched:
        matched = shifts

    ranked_candidates: List[tuple[int, Dict[str, Any], Dict[str, Any]]] = []
    for s in matched:
        sup = supervisors_by_id.get(s.get("supervisor_id"))
        if sup:
            ranked_candidates.append((supervisor_priority(sup.get("role")), sup, s))
    if not ranked_candidates:
        return None, None

    ranked_candidates.sort(key=lambda item: item[0])
    _, supervisor, shift = ranked_candidates[0]
    return supervisor, shift


def api_error_payload(error: Exception) -> Dict[str, Any]:
    if callable(getattr(error, "json", None)):
        try:
            payload = error.json()
            if isinstance(payload, dict):
                return payload
        except Exception:
            pass
    return {"message": str(error)}


def api_error_code(error: Exception) -> str:
    return str(api_error_payload(error).get("code") or "")


def get_service_client():
    global SERVICE_SUPABASE_CLIENT
    if SERVICE_SUPABASE_CLIENT is not None:
        return SERVICE_SUPABASE_CLIENT
    service_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
    if not service_key:
        return None
    SERVICE_SUPABASE_CLIENT = get_supabase_service_client(settings.SUPABASE_URL, service_key)
    return SERVICE_SUPABASE_CLIENT


def insert_incident_with_fallback(user_client, incident_payload: Dict[str, Any], tile_id: str):
    try:
        return (
            user_client.table("incidents")
            .insert(incident_payload)
            .execute()
        ).data or []
    except APIError as e:
        if api_error_code(e) != "42501":
            raise
        service_client = get_service_client()
        if not service_client:
            logger.warning(
                "incident insert denied by RLS for tile_id=%s and no SUPABASE_SERVICE_ROLE_KEY is configured",
                tile_id,
            )
            raise
        logger.warning("incident insert denied by RLS for tile_id=%s; retrying with service role", tile_id)
        return (
            service_client.table("incidents")
            .insert(incident_payload)
            .execute()
        ).data or []


def update_incident_with_fallback(user_client, incident_id: str, updates: Dict[str, Any]):
    try:
        return (
            user_client.table("incidents")
            .update(updates)
            .eq("incident_id", incident_id)
            .execute()
        ).data or []
    except APIError as e:
        if api_error_code(e) != "42501":
            raise
        service_client = get_service_client()
        if not service_client:
            raise
        logger.warning("incident update denied by RLS for incident_id=%s; retrying with service role", incident_id)
        return (
            service_client.table("incidents")
            .update(updates)
            .eq("incident_id", incident_id)
            .execute()
        ).data or []


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
    now_iso = datetime.now(timezone.utc).isoformat()

    active_shifts = (
        sb.table("shifts")
        .select("shift_id,supervisor_id,shift_date,shift_start,shift_end,location")
        .lte("shift_start", now_iso)
        .gte("shift_end", now_iso)
        .not_.is_("supervisor_id", "null")
        .execute()
    ).data or []

    upcoming_shifts = (
        sb.table("shifts")
        .select("shift_id,supervisor_id,shift_date,shift_start,shift_end,location")
        .gte("shift_start", now_iso)
        .not_.is_("supervisor_id", "null")
        .order("shift_start", desc=False)
        .limit(50)
        .execute()
    ).data or []

    recent_shifts = (
        sb.table("shifts")
        .select("shift_id,supervisor_id,shift_date,shift_start,shift_end,location")
        .lte("shift_end", now_iso)
        .not_.is_("supervisor_id", "null")
        .order("shift_end", desc=True)
        .limit(50)
        .execute()
    ).data or []

    location_candidates = {
        normalize_text(cctv_row.get("main_location")),
        normalize_text(cctv_row.get("location_name")),
        normalize_text(cctv_row.get("location")),
    }
    location_candidates.discard("")

    combined_shifts = active_shifts + upcoming_shifts + recent_shifts
    supervisor_ids = list({s.get("supervisor_id") for s in combined_shifts if s.get("supervisor_id")})
    if not supervisor_ids:
        return select_fallback_supervisor(sb), None

    employees = (
        sb.table("employees")
        .select("id,emp_id,first_name,last_name,role,phone")
        .in_("id", supervisor_ids)
        .execute()
    ).data or []

    supervisors_by_id = {
        e["id"]: e
        for e in employees
        if normalize_text(e.get("role")) in ALLOWED_SUPERVISOR_ROLES
    }
    if not supervisors_by_id:
        return select_fallback_supervisor(sb), None

    for group in (active_shifts, upcoming_shifts, recent_shifts):
        supervisor, shift = choose_supervisor_from_shift_group(group, location_candidates, supervisors_by_id)
        if supervisor:
            return supervisor, shift

    return select_fallback_supervisor(sb), None


def select_fallback_supervisor(sb) -> Optional[Dict[str, Any]]:
    rows = (
        sb.table("employees")
        .select("id,emp_id,first_name,last_name,role,phone")
        .in_("role", ["Senior Security Officer", "Security Supervisor"])
        .execute()
    ).data or []
    if not rows:
        return None
    rows.sort(key=lambda row: supervisor_priority(row.get("role")))
    return rows[0]


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


class IncidentConfirmPayload(BaseModel):
    incident_id: Optional[str] = None
    confirmed: bool = True
    corrected_threat: Optional[str] = None
    edited_description: Optional[str] = None
    tile_id: Optional[str] = None
    predicted_threat: Optional[str] = None
    cctv_name: Optional[str] = None
    location_name: Optional[str] = None
    coverage: Optional[str] = None
    frame_urls: List[str] = Field(default_factory=list)
    yolo_objects: List[Dict[str, Any]] = Field(default_factory=list)
    supervisor_id: Optional[str] = None
    shift_id: Optional[str] = None


@app.post("/incident/confirm")
async def confirm_incident(
    payload: IncidentConfirmPayload,
    authorization: Optional[str] = Header(default=None),
):
    user_jwt = require_auth(authorization)
    sb = get_supabase_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY, user_jwt)

    incident_id = str(payload.incident_id or "").strip() or None
    edited_description = (payload.edited_description or "").strip()
    corrected_threat = (payload.corrected_threat or "").strip()

    if not incident_id:
        source_cctvid = (payload.tile_id or payload.cctv_name or "").strip()
        cam_data = None
        if source_cctvid:
            try:
                cam_rows = (
                    sb.table("cctv_cameras")
                    .select("id,cctvid,location,coverage,latitude,longitude,location_name,main_location")
                    .eq("cctvid", source_cctvid)
                    .limit(1)
                    .execute()
                ).data or []
                if not cam_rows:
                    cam_rows = (
                        sb.table("cctv_cameras")
                        .select("id,cctvid,location,coverage,latitude,longitude,location_name,main_location")
                        .eq("id", source_cctvid)
                        .limit(1)
                        .execute()
                    ).data or []
                cam_data = cam_rows[0] if cam_rows else None
            except APIError as e:
                logger.warning("camera lookup failed during confirm create: %s", e)

        predicted_for_insert = corrected_threat or (payload.predicted_threat or "").strip() or "Suspicious Person"
        cctvid = (cam_data or {}).get("cctvid") or source_cctvid or None
        frames = payload.frame_urls[:4]

        incident_payload = {
            "incident_name": build_incident_name(predicted_for_insert, cctvid or "CCTV"),
            "incident_category": threat_to_incident_category(predicted_for_insert),
            "location_name": (cam_data or {}).get("location_name")
            or (cam_data or {}).get("main_location")
            or payload.location_name
            or "Unknown",
            "location_unit_no": (cam_data or {}).get("location"),
            "location_description": (cam_data or {}).get("coverage") or payload.coverage,
            "latitude": (cam_data or {}).get("latitude"),
            "longitude": (cam_data or {}).get("longitude"),
            "cctv_image_1": frames[0] if len(frames) > 0 else None,
            "cctv_image_2": frames[1] if len(frames) > 1 else None,
            "cctv_image_3": frames[2] if len(frames) > 2 else None,
            "prediction_correct": bool(payload.confirmed),
            "active_status": bool(payload.confirmed),
            "cctv_camera_id": (cam_data or {}).get("id"),
            "cctvid": cctvid,
            "shift_id": payload.shift_id,
            "supervisor_id": payload.supervisor_id,
            "predicted_threat": predicted_for_insert,
            "threat_confidence": None,
            "threat_detected": bool(payload.confirmed),
            "ai_assessment": edited_description or None,
            "yolo_objects": payload.yolo_objects or [],
        }
        try:
            created = insert_incident_with_fallback(sb, incident_payload, source_cctvid or "confirm")
            if created:
                incident_id = created[0].get("incident_id")
        except APIError as e:
            raise HTTPException(
                status_code=500,
                detail={"error": "Failed to create incident", "supabase": api_error_payload(e)},
            )

        if not incident_id:
            raise HTTPException(status_code=500, detail="Incident create succeeded but no incident_id returned")

    updates: Dict[str, Any] = {
        "prediction_correct": bool(payload.confirmed),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if edited_description:
        updates["ai_assessment"] = edited_description

    if corrected_threat:
        updates["predicted_threat"] = corrected_threat

    if not payload.confirmed:
        updates["threat_detected"] = False
        updates["active_status"] = False

    try:
        updated = update_incident_with_fallback(sb, incident_id, updates)
    except APIError as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to update incident", "supabase": api_error_payload(e)},
        )

    if not updated:
        raise HTTPException(status_code=404, detail=f"Incident not found: {incident_id}")

    return {"ok": True, "incident_id": incident_id, "prediction_correct": bool(payload.confirmed)}


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
        sso_data = {
            "id": matched_supervisor.get("id"),
            "name": build_employee_display_name(matched_supervisor),
            "role": matched_supervisor.get("role", "Senior Security Officer"),
            "phone": matched_supervisor.get("phone", "—"),
            "shift_id": matched_shift.get("shift_id") if matched_shift else None,
        }
    else:
        sso_data = {"id": None, "name": "—", "role": "Senior Security Officer", "phone": "—", "shift_id": None}

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

    return {
        "tile_id": tile_id,
        "saved_to": out_path,
        # Incident rows are intentionally created only during /incident/confirm.
        "incident_id": None,
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
            "role": sso_data.get("role", "Senior Security Officer"),
            "phone": sso_data.get("phone", "—"),
        },
        "frames": frames[:4],
    }
