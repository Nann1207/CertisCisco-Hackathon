import httpx
from typing import Any, Dict, List

SEA_LION_URL = "https://api.sea-lion.ai/v1/chat/completions"

async def generate_incident_report(
    api_key: str,
    model: str,
    predicted_threat: str,
    cctv_meta: Dict[str, Any],
    yolo_objects: List[Dict[str, Any]],
    frame_data_urls: List[str],
    max_completion_tokens: int = 220,
) -> str:
    """
    Sends text + (optional) image data URLs to SeaLion chat completions.

    Note: Many chat APIs accept multi-modal content as:
      {"type":"text","text":"..."} and {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}
    If SeaLion’s endpoint is text-only for your key/model, we degrade gracefully by sending only text.
    """
    system_text = (
        "You are a security incident analyst for a mall CCTV command center. "
        "Write a concise, professional incident report. Include: what happened, key cues, uncertainty, "
        "recommended immediate actions, and a short summary for SMS/dispatch."
    )

    user_text = {
        "predicted_threat": predicted_threat,
        "cctv": cctv_meta,
        "objects_detected": yolo_objects,
        "notes": "Frames are extracted from CCTV clip. YOLO detections may include false positives.",
    }

    
    content = [{"type": "text", "text": f"{system_text}\n\nContext:\n{user_text}"}]
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
        return data["choices"][0]["message"]["content"]
    except Exception:
        return str(data)