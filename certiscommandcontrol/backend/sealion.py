import httpx
from typing import Any, Dict, List

SEA_LION_URL = "https://api.sea-lion.ai/v1/chat/completions"

async def generate_incident_report(
    api_key: str,
    model: str,
    predicted_threat: str,
    confidence: float,
    threat_detected: bool,
    topk_predictions: List[Dict[str, Any]],
    cctv_meta: Dict[str, Any],
    yolo_objects: List[Dict[str, Any]],
    frame_data_urls: List[str],
    max_completion_tokens: int = 420,
) -> str:
    """
    Sends text + (optional) image data URLs to SeaLion chat completions.

    Note: Many chat APIs accept multi-modal content as:
      {"type":"text","text":"..."} and {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}
    If SeaLion’s endpoint is text-only for your key/model, we degrade gracefully by sending only text.
    """
    system_text = (
        "You are a senior mall security command analyst creating guidance for officers on the ground. "
        "Be concise, operational, and safety-first. Use only provided evidence. "
        "If uncertain, explicitly say so. Do not invent facts, identities, or weapons."
    )

    top_objects = sorted(yolo_objects, key=lambda o: float(o.get("conf", 0.0)), reverse=True)[:12]
    context_text = (
        "CCTV incident context:\n"
        f"- Camera: {cctv_meta.get('cctvName', 'Unknown')}\n"
        f"- Location: {cctv_meta.get('location', 'Unknown')}\n"
        f"- Coverage: {cctv_meta.get('coverage', 'Unknown')}\n"
        f"- X3D predicted threat: {predicted_threat}\n"
        f"- X3D confidence: {confidence:.4f}\n"
        f"- threat_detected decision: {threat_detected}\n"
        f"- X3D top-k: {topk_predictions}\n"
        f"- YOLO detections (top by confidence): {top_objects}\n"
        "Note: frames are sampled; YOLO may include false positives."
    )

    instruction_text = (
        "Return plain text with these exact section headers:\n"
        "1) Situation Summary\n"
        "2) Observed Indicators\n"
        "3) Immediate Actions (0-2 min)\n"
        "4) Follow-up Actions (2-10 min)\n"
        "5) Officer Safety Notes\n"
        "6) Uncertainty / Data Gaps\n"
        "7) Dispatch Message (<=240 chars)\n"
        "Keep each section short and actionable."
    )

    content = [{"type": "text", "text": f"{system_text}\n\n{context_text}\n\n{instruction_text}"}]
    for url in frame_data_urls[:4]:
        content.append({"type": "image_url", "image_url": {"url": url}})

    payload = {
        "model": model,
        "max_completion_tokens": max_completion_tokens,
        "messages": [
            {"role": "user", "content": content}
        ],
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            SEA_LION_URL,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        r.raise_for_status()
        data = r.json()

    # OpenAI-style shape: choices[0].message.content
    try:
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            text_parts: List[str] = []
            for part in content:
                if isinstance(part, str):
                    text_parts.append(part)
                elif isinstance(part, dict):
                    t = part.get("text")
                    if isinstance(t, str) and t.strip():
                        text_parts.append(t)
            joined = "\n".join(text_parts).strip()
            if joined:
                return joined
        return str(content)
    except Exception:
        return str(data)
