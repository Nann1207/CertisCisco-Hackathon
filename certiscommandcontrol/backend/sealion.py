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
    """

    # 🔥 STRONGER SYSTEM PROMPT
    system_text = (
        "You are a senior mall security command centre analyst issuing real-time instructions to ground officers. "
        "Your role is to interpret CCTV observations and provide clear, direct, and actionable guidance. "
        "Focus only on what is visible and operationally relevant. "
        "Do NOT mention AI systems, models, confidence scores, or technical analysis. "
        "Do NOT be repetitive or verbose. Avoid unnecessary uncertainty language. "
        "Do NOT speculate beyond the evidence. "
        "Write in a concise, command-style tone suitable for radio communication."
    )

    # Sort and limit detections
    top_objects = sorted(
        yolo_objects,
        key=lambda o: float(o.get("conf", 0.0)),
        reverse=True
    )[:12]

    # 🔥 IMPROVED CONTEXT (with your added rule)
    context_text = (
        "CCTV incident context:\n"
        f"- Camera: {cctv_meta.get('cctvName', 'Unknown')}\n"
        f"- Location: {cctv_meta.get('location', 'Unknown')}\n"
        f"- Coverage: {cctv_meta.get('coverage', 'Unknown')}\n"
        f"- Detected scenario: {predicted_threat}\n"
        f"- Additional classification signals: {topk_predictions}\n"
        f"- YOLO detections (sorted by relevance): {top_objects}\n"
        "Note: Focus on the most relevant detections only. Ignore low-importance objects like furniture unless directly related to the situation. "
        "Frames are sampled; rely on consistent visual indicators."
    )

    # 🔥 STRONGER INSTRUCTIONS
    instruction_text = (
        "Generate a structured incident report for responding officers.\n\n"

        "Use these exact section headers:\n"
        "1) Situation Summary\n"
        "2) Key Observations\n"
        "3) Immediate Actions \n"
        "4) Follow-up Actions \n"
        "5) Officer Safety Notes\n"
        "6) Dispatch Message\n\n"

        "Guidelines:\n"
        "- Be clear, specific, and operational.\n"
        "- Use short, direct, command-style sentences.\n"
        "- Describe individuals using observable traits only (clothing, movement, position).\n"
        "- Include location context and direction of movement.\n"
        "- Focus on what officers need to DO immediately.\n"
        "- Do NOT mention confidence levels, probabilities, or system limitations.\n"
        "- Avoid unnecessary uncertainty language.\n"
        "- If no clear threat is visible, state 'No immediate threat observed' and provide monitoring instructions.\n"
        "- Keep all sections concise and actionable.\n\n"

        "Output must be plain text only. No markdown, no bullet symbols."
    )

    # Combine content
    content = [
        {
            "type": "text",
            "text": f"{system_text}\n\n{context_text}\n\n{instruction_text}"
        }
    ]

    # Attach up to 4 frames
    for url in frame_data_urls[:4]:
        content.append({
            "type": "image_url",
            "image_url": {"url": url}
        })

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

    # Parse response
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