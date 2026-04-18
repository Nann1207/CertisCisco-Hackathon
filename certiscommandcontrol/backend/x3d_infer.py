import numpy as np
import torch
import torch.nn as nn
import cv2
from typing import Dict, List, Tuple

from pytorchvideo.models.hub import x3d_s, x3d_xs

ALL_CLASSES = [
    "normal",
    "abuse", "arrest", "arson", "assault", "burglary", "explosion",
    "fighting", "roadaccidents", "robbery", "shooting", "shoplifting",
    "stealing", "vandalism",
]
class_to_id = {c: i for i, c in enumerate(ALL_CLASSES)}
id_to_class = {i: c for c, i in class_to_id.items()}

def kinetics_normalize(x_cthw: torch.Tensor) -> torch.Tensor:
    mean = torch.tensor([0.45, 0.45, 0.45]).view(3, 1, 1, 1)
    std  = torch.tensor([0.225, 0.225, 0.225]).view(3, 1, 1, 1)
    return (x_cthw - mean) / std

def replace_classifier_x3d(m, num_classes: int):
    if hasattr(m.blocks[-1], "proj") and isinstance(m.blocks[-1].proj, nn.Linear):
        in_f = m.blocks[-1].proj.in_features
        m.blocks[-1].proj = nn.Linear(in_f, num_classes)
        return
    linears = [(n, mod) for n, mod in m.named_modules() if isinstance(mod, nn.Linear)]
    last_name, last_lin = linears[-1]
    in_f = last_lin.in_features
    cur = m
    parts = last_name.split(".")
    for p in parts[:-1]:
        cur = getattr(cur, p)
    setattr(cur, parts[-1], nn.Linear(in_f, num_classes))

def build_model(model_name: str, checkpoint_path: str, device: str = "cpu"):
    if model_name == "x3d_s":
        model = x3d_s(pretrained=True)
    elif model_name == "x3d_xs":
        model = x3d_xs(pretrained=True)
    else:
        raise ValueError(f"Unsupported X3D_MODEL_NAME: {model_name}")

    replace_classifier_x3d(model, len(ALL_CLASSES))
    state = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(state)
    model.eval()
    model.to(device)
    return model

def read_all_frames_bgr(video_path: str) -> List[np.ndarray]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    return frames

def clip_tensor_from_frames(frames_bgr: List[np.ndarray], start: int, clip_len: int, size: int) -> torch.Tensor:
    # Collect clip_len frames (pad with last)
    clip = frames_bgr[start:start+clip_len]
    if len(clip) == 0:
        raise ValueError("No frames in video.")
    if len(clip) < clip_len:
        clip = clip + [clip[-1]] * (clip_len - len(clip))

    # Resize + BGR->RGB + float
    arr = []
    for fr in clip:
        fr = cv2.resize(fr, (size, size))
        fr = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
        arr.append(fr)
    arr = np.stack(arr, axis=0).astype(np.float32) / 255.0  # T,H,W,C
    arr = np.transpose(arr, (3, 0, 1, 2))                   # C,T,H,W
    x = torch.from_numpy(arr)
    x = kinetics_normalize(x)
    return x

@torch.no_grad()
def predict_multiclip(
    model,
    video_path: str,
    clip_len: int,
    size: int,
    topk: int = 5,
) -> Dict:
    frames = read_all_frames_bgr(video_path)
    total = len(frames)
    if total == 0:
        raise ValueError("Could not decode video frames.")

    if total <= clip_len:
        starts = [0]
    else:
        starts = [
            int(0.15 * (total - clip_len)),
            int(0.50 * (total - clip_len)),
            int(0.85 * (total - clip_len)),
        ]
        starts = [max(0, min(s, total - clip_len)) for s in starts]

    logits_sum = None
    for s in starts:
        x = clip_tensor_from_frames(frames, s, clip_len, size).unsqueeze(0)
        dev = next(model.parameters()).device
        x = x.to(dev)
        logits = model(x)
        logits_sum = logits if logits_sum is None else (logits_sum + logits)

    logits_avg = logits_sum / len(starts)
    probs = torch.softmax(logits_avg, dim=1)[0].cpu().numpy()

    top_idx = probs.argsort()[::-1][:topk]
    top = [{"label": id_to_class[int(i)], "prob": float(probs[int(i)])} for i in top_idx]
    pred = top[0]["label"]
    conf = top[0]["prob"]

    return {
        "predicted": pred,
        "confidence": conf,
        "topk": top,
    }
