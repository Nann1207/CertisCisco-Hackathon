import base64
from typing import List, Tuple, Optional
import cv2

def extract_frames_bgr(
    video_path: str,
    num_frames: int = 4,
    start_ratio: float = 0.15,
    end_ratio: float = 0.85,
) -> List[Tuple[int, "cv2.Mat"]]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        cap.release()
        return []

    # pick evenly spaced frames within [start_ratio, end_ratio]
    a = int(total * start_ratio)
    b = int(total * end_ratio)
    if b <= a:
        a, b = 0, total - 1

    idxs = []
    if num_frames <= 1:
        idxs = [(a + b) // 2]
    else:
        for i in range(num_frames):
            t = i / (num_frames - 1)
            idxs.append(int(a + t * (b - a)))

    out = []
    for fi in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, frame = cap.read()
        if ok and frame is not None:
            out.append((fi, frame))
    cap.release()
    return out

def bgr_to_data_url_jpeg(frame_bgr, quality: int = 85) -> Optional[str]:
    ok, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None
    b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"