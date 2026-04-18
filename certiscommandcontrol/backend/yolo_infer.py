from typing import List, Dict, Any
import cv2
from ultralytics import YOLO

class YOLOContext:
    def __init__(self, weights: str = "yolov8n.pt"):
        self.model = YOLO(weights)

    def scan_video(self, video_path: str, frame_skip: int = 45, conf: float = 0.35, imgsz: int = 640, max_scans: int = 12):
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []

        out = []
        i = 0
        scans = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            i += 1
            if i % frame_skip != 0:
                continue
            scans += 1
            if scans > max_scans:
                break

            results = self.model.predict(frame, imgsz=imgsz, conf=conf, verbose=False, device="cpu")
            r = results[0]
            if r.boxes is None or len(r.boxes) == 0:
                continue

            names = r.names
            for b in r.boxes[:10]:
                cls_id = int(b.cls[0].item())
                if isinstance(names, dict):
                    label = names.get(cls_id, str(cls_id))
                elif isinstance(names, (list, tuple)) and 0 <= cls_id < len(names):
                    label = str(names[cls_id])
                else:
                    label = str(cls_id)
                c = float(b.conf[0].item())
                out.append({"label": label, "conf": c, "frame": i})
        cap.release()

        # dedupe-ish: keep top confidence per label
        out.sort(key=lambda x: x["conf"], reverse=True)
        return out[:12]
