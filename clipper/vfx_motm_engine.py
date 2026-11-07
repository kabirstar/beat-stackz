"""
vfx_motm_engine.py — Laughtodabank-Style 10-Effect VFX Compositing Engine (Tailored for "BRINKS")
Implements all 10 VFX families documented in `clipper/MUSIC_VIDEO_VFX_PLAYBOOK.md` for Clipper Studio,
powered by Temporal Neural Alpha Matting (`RVM-ResNet50` + `U2-Net Human Seg` + `IS-Net` ONNX models)
and adapted to the "BRINKS" theme (Bank Vaults overflowing with $100 bills & gold bars, Armored Brinks
Heist Trucks, and Raining $100 Bills):
  - VFX-01 (`motm_bleach_pop`): Bleach-Bypass Silver Monochrome + Selective Color Pop (Red/Gold/Emerald-Green/Blue)
  - VFX-02 (`motm_sky_cosmos`): Camera-Tracked Raining $100 Bills & Giant Bank Vault Wheel Sky Replacement
  - VFX-03 (`motm_lunar_env`): Neural Alpha-Matted Full-Body Roto Swap into Bank Vault & Armored Brinks Truck
  - VFX-04 (`motm_doorway_portal`): Architectural Window/Archway Portal into Bank Vault & Armored Brinks Truck
  - VFX-05 (`motm_roto_clone`): Multi-Take Neural Roto-Clone Double/Triple Performance (100% Solid Foreground)
  - VFX-06 (`motm_fg_hands`): Twin Oversized Foreground Hand Cutouts with Premultiplied Shallow-DoF Lens Defocus
  - VFX-07 (`motm_motion_echo`): Neural Subject-Isolated Step-Printing Motion Echo Trail
  - VFX-08 (`motm_ink_corrupt`): Neural Hoodie-Isolated Glossy Black-Ink / Ferrofluid Fabric Corruption
  - VFX-09A (`motm_diamond_grillz`): Macro Gold Grillz / Saxophone Crystalline Diamond Prism Glints
  - VFX-09B (`motm_eagle_shoulder`): Shoulder-Contour Tracked Bald Eagle with Selective Gold Beak
  - VFX-10A (`motm_dutch_flash`): 24fps Kinetic Dutch-Angle Whip-Zoom + 2-Frame White Exposure Flash
  - VFX-10B (`motm_nasa_card`): "BRINKS // ARMORED VAULT" Security Shield Emblem Overlay + Bleach Grade
"""

from __future__ import annotations

import math
import os
import subprocess
from collections import deque
from typing import List, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort


MOTM_VFX_LABELS = {
    "motm_nasa_card": "VFX-10B: 'BRINKS // ARMORED VAULT' Security Emblem + Bleach Grade",
    "motm_sky_cosmos": "VFX-02: Tracked Raining $100 Bills & Bank Vault Sky Replacement",
    "motm_bleach_pop": "VFX-01: Bleach-Bypass Monochrome + Selective Red/Gold/Green Pop",
    "motm_diamond_grillz": "VFX-09A: Crystalline Diamond Prism & Starburst Glints",
    "motm_motion_echo": "VFX-07: Subject-Isolated Step-Print Motion Echo Trail",
    "motm_dutch_flash": "VFX-10A: Dutch-Angle Whip-Zoom + 2-Frame White Shutter Flash",
    "motm_lunar_env": "VFX-03: Bank Vault & Armored Brinks Truck Neural Roto Environment Swap",
    "motm_roto_clone": "VFX-05: Synced Multi-Take Neural Roto-Clone Performance",
    "motm_eagle_shoulder": "VFX-09B: Tracked Perched Bald Eagle Surreal Prop",
    "motm_fg_hands": "VFX-06: Oversized Foreground Hand Cutout Frame-In",
    "motm_ink_corrupt": "VFX-08: Glossy Black-Ink Ferrofluid Hoodie Corruption",
    "motm_doorway_portal": "VFX-04: Architectural Window Portal to Bank Vault & Brinks Truck",
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSET_DIR = os.path.join(BASE_DIR, "assets", "motm")
MODEL_DIR = os.path.join(BASE_DIR, "assets", "models")

_SESS_RVM50: Optional[ort.InferenceSession] = None
_SESS_U2NET: Optional[ort.InferenceSession] = None


def _get_onnx_sessions() -> Tuple[Optional[ort.InferenceSession], Optional[ort.InferenceSession]]:
    """Lazy-initialize singleton ONNX Runtime sessions for RVM-ResNet50 and U2-Net Human Seg."""
    global _SESS_RVM50, _SESS_U2NET
    if _SESS_RVM50 is None:
        rvm_path = os.path.join(MODEL_DIR, "rvm_resnet50_fp32.onnx")
        if not os.path.exists(rvm_path):
            rvm_path = os.path.join(MODEL_DIR, "rvm_mobilenetv3_fp32.onnx")
        if os.path.exists(rvm_path):
            _SESS_RVM50 = ort.InferenceSession(rvm_path, providers=["CPUExecutionProvider"])
    if _SESS_U2NET is None:
        u2_path = os.path.join(MODEL_DIR, "u2net_human_seg.onnx")
        if os.path.exists(u2_path):
            _SESS_U2NET = ort.InferenceSession(u2_path, providers=["CPUExecutionProvider"])
    return _SESS_RVM50, _SESS_U2NET


def _init_rvm_rec() -> List[np.ndarray]:
    """Initialize the 4 temporal recurrent hidden state tensors for Robust Video Matting."""
    return [np.zeros([1, 1, 1, 1], dtype=np.float32) for _ in range(4)]


def _neural_human_matte(
    frame_bgr: np.ndarray,
    rvm_rec: Optional[List[np.ndarray]] = None,
) -> Tuple[np.ndarray, np.ndarray, List[np.ndarray]]:
    """
    Compute a pixel-accurate, temporally coherent neural human alpha matte (`0.0 .. 1.0` float32)
    and de-spilled foreground BGR (`0.0 .. 255.0` float32) using:
      1. ByteDance Robust Video Matting (`RVM-ResNet50`) with temporal recurrent states `r1..r4`
      2. `U2-Net Human Segmentation` ensemble reinforcement for dark curly hair & clothing
      3. Alpha contrast tightening (`[0.42 .. 0.82] -> [0.0 .. 1.0]`) to eliminate smoky edge halos
      4. Morphological interior color decontamination on the 3px boundary band
    """
    h, w = frame_bgr.shape[:2]
    sess_rvm, sess_u2 = _get_onnx_sessions()
    if rvm_rec is None:
        rvm_rec = _init_rvm_rec()

    img_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    if sess_rvm is not None:
        src = np.transpose(img_rgb, (2, 0, 1))[None, ...]
        ds = np.array([0.25], dtype=np.float32)
        fgr, pha, r1o, r2o, r3o, r4o = sess_rvm.run(
            None,
            {
                "src": src,
                "r1i": rvm_rec[0],
                "r2i": rvm_rec[1],
                "r3i": rvm_rec[2],
                "r4i": rvm_rec[3],
                "downsample_ratio": ds,
            },
        )
        rvm_rec = [r1o, r2o, r3o, r4o]
        a_rvm = pha[0, 0]
        fgr_bgr = cv2.cvtColor(np.transpose(fgr[0], (1, 2, 0)), cv2.COLOR_RGB2BGR) * 255.0
    else:
        a_rvm = np.zeros((h, w), dtype=np.float32)
        fgr_bgr = frame_bgr.astype(np.float32)

    if sess_u2 is not None:
        img_u2 = cv2.resize(img_rgb, (320, 320), interpolation=cv2.INTER_LINEAR)
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        inp_u2 = np.transpose((img_u2 - mean) / std, (2, 0, 1))[None, ...]
        pred_u2 = sess_u2.run(None, {"input.1": inp_u2})[0][0, 0]
        pred_u2 = (pred_u2 - pred_u2.min()) / (pred_u2.max() - pred_u2.min() + 1e-8)
        a_u2 = cv2.resize(pred_u2, (w, h), interpolation=cv2.INTER_CUBIC)
    else:
        a_u2 = a_rvm

    a_raw = 0.65 * a_rvm + 0.35 * a_u2
    a_tight = np.clip((a_raw - 0.42) / 0.40, 0.0, 1.0)
    a_smooth = cv2.GaussianBlur(a_tight, (5, 5), 0)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    eroded_fg = cv2.erode(fgr_bgr.astype(np.uint8), kernel, iterations=1).astype(np.float32)
    edge_band = (a_smooth > 0.02) & (a_smooth < 0.86)
    clean_fg = fgr_bgr.copy()
    clean_fg[edge_band] = 0.55 * fgr_bgr[edge_band] + 0.45 * eroded_fg[edge_band]

    return a_smooth, clean_fg, rvm_rec


def _bleach_bypass_selective(frame_bgr: np.ndarray, vivid_boost: float = 1.42) -> np.ndarray:
    """
    VFX-01: High-contrast silver bleach-bypass base with selective HSV color preservation
    for reds (Balenciaga logo, taillights), golds (saxophone, grillz, gold bullion),
    emerald greens ($100 bills), and Brinks navy/cyan accents.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    x = np.arange(256, dtype=np.float32) / 255.0
    s_curve = np.clip(255.0 / (1.0 + np.exp(-7.5 * (x - 0.48))), 0, 255).astype(np.uint8)
    silver = cv2.LUT(gray, s_curve)
    silver_3ch = cv2.cvtColor(silver, cv2.COLOR_GRAY2BGR)
    bleached = cv2.addWeighted(frame_bgr, 0.22, silver_3ch, 0.78, 2.0)

    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mask_red1 = cv2.inRange(hsv, (0, 85, 65), (13, 255, 255))
    mask_red2 = cv2.inRange(hsv, (166, 85, 65), (180, 255, 255))
    mask_gold = cv2.inRange(hsv, (14, 85, 75), (37, 255, 255))
    mask_green = cv2.inRange(hsv, (38, 55, 55), (86, 255, 255))
    mask_cyan = cv2.inRange(hsv, (92, 85, 70), (132, 255, 255))

    vivid_mask = cv2.bitwise_or(
        cv2.bitwise_or(mask_red1, mask_red2),
        cv2.bitwise_or(mask_gold, cv2.bitwise_or(mask_green, mask_cyan)),
    )
    vivid_alpha = cv2.GaussianBlur(vivid_mask, (9, 9), 0)[:, :, None].astype(np.float32) / 255.0

    hsv_boost = hsv.astype(np.float32)
    hsv_boost[:, :, 1] = np.clip(hsv_boost[:, :, 1] * vivid_boost, 0, 255)
    vivid_bgr = cv2.cvtColor(hsv_boost.astype(np.uint8), cv2.COLOR_HSV2BGR)

    out = bleached.astype(np.float32) * (1.0 - vivid_alpha) + vivid_bgr.astype(np.float32) * vivid_alpha
    return np.clip(out, 0, 255).astype(np.uint8)


def _load_plate(filename: str, w: int, h: int) -> np.ndarray:
    """Load and resize a 16:9 BGR plate from `assets/motm/`."""
    p = os.path.join(ASSET_DIR, filename)
    if os.path.exists(p):
        img = cv2.imread(p)
        if img is not None:
            return cv2.resize(img, (w, h), interpolation=cv2.INTER_CUBIC)
    return np.zeros((h, w, 3), dtype=np.uint8)


def _load_rgba_asset(filename: str) -> Optional[np.ndarray]:
    """Load a 4-channel BGRA cutout asset from `assets/motm/`."""
    p = os.path.join(ASSET_DIR, filename)
    if os.path.exists(p):
        img = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        if img is not None and img.ndim == 3 and img.shape[2] == 4:
            return img
    return None


def _find_shoulder_anchor(frame_bgr: np.ndarray, alpha: np.ndarray) -> Tuple[int, int, int]:
    """
    Locate the CENTRAL main performer's face/neck and exact screen-left shoulder contour
    `(shoulder_x, shoulder_y, head_w)` using central skin detection + neural human alpha matte (`alpha > 0.5`).
    Guarantees the eagle always perches on the main artist's shoulder (never on a side co-star or clipped at top).
    """
    h, w = alpha.shape[:2]
    ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
    yy, xx = np.mgrid[0:h, 0:w]
    central_face = (
        (xx > int(w * 0.36))
        & (xx < int(w * 0.72))
        & (yy > int(h * 0.06))
        & (yy < int(h * 0.45))
        & (alpha > 0.5)
        & (ycrcb[:, :, 1] >= 135)
        & (ycrcb[:, :, 1] <= 176)
    )
    f_ys, f_xs = np.where(central_face)
    if len(f_xs) > 120:
        cx = int(np.median(f_xs))
        cy = int(np.median(f_ys))
        head_w = int(np.clip(np.std(f_xs) * 3.2, h * 0.11, h * 0.17))
    else:
        cx, cy, head_w = int(w * 0.54), int(h * 0.22), int(h * 0.14)

    sh_col = int(np.clip(cx - head_w * 0.95, w * 0.28, w * 0.68))
    probe_y0 = int(np.clip(cy + head_w * 0.55, h * 0.28, h * 0.55))
    col_slice = alpha[probe_y0 : int(h * 0.78), max(0, sh_col - 8) : min(w, sh_col + 8)]
    sh_ys = np.where(np.mean(col_slice, axis=1) > 0.45)[0]
    if len(sh_ys) > 0:
        sh_y = int(probe_y0 + sh_ys[0])
    else:
        sh_y = int(cy + head_w * 1.15)

    sh_y = int(np.clip(sh_y, h * 0.36, h * 0.58))
    return sh_col, sh_y, head_w


def _composite_rgba_eagle(
    canvas_bgr: np.ndarray,
    eagle_rgba: Optional[np.ndarray],
    anchor_x: int,
    anchor_y: int,
    target_height: int = 185,
    frame_idx: int = 0,
) -> np.ndarray:
    """
    VFX-09B: Composite the 1024x1024 IS-Net segmented Bald Eagle (`eagle_rgba.png`)
    perched on the performer's shoulder contour with bleach-bypass silver plumage + golden beak,
    soft contact shadow on the shoulder fabric, and subtle breathing motion.
    """
    if eagle_rgba is None:
        return canvas_bgr

    out = canvas_bgr.copy()
    h, w = out.shape[:2]
    eh, ew = eagle_rgba.shape[:2]
    scale = float(target_height) / float(max(1, eh))
    tw, th = max(32, int(round(ew * scale))), max(32, int(round(eh * scale)))
    resized = cv2.resize(eagle_rgba, (tw, th), interpolation=cv2.INTER_AREA)

    eagle_graded = _bleach_bypass_selective(resized[:, :, :3], vivid_boost=1.65)
    eagle_alpha = (resized[:, :, 3:4].astype(np.float32) / 255.0)

    bob_y = int(round(1.5 * math.sin(frame_idx * 0.20)))
    x0 = int(anchor_x - tw * 0.50)
    y0 = int(anchor_y - th * 0.90 + bob_y)

    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    cw = min(tw - sx0, w - dx0)
    ch = min(th - sy0, h - dy0)
    if cw <= 0 or ch <= 0:
        return out

    sh_y0 = min(h - 1, max(0, y0 + int(th * 0.84)))
    sh_y1 = min(h, sh_y0 + 18)
    sh_x0 = min(w - 1, max(0, x0 + int(tw * 0.25)))
    sh_x1 = min(w, x0 + int(tw * 0.75))
    if sh_y1 > sh_y0 and sh_x1 > sh_x0:
        out[sh_y0:sh_y1, sh_x0:sh_x1] = (out[sh_y0:sh_y1, sh_x0:sh_x1].astype(np.float32) * 0.68).astype(np.uint8)

    patch_bgr = eagle_graded[sy0 : sy0 + ch, sx0 : sx0 + cw].astype(np.float32)
    patch_a = eagle_alpha[sy0 : sy0 + ch, sx0 : sx0 + cw]
    roi = out[dy0 : dy0 + ch, dx0 : dx0 + cw].astype(np.float32)
    out[dy0 : dy0 + ch, dx0 : dx0 + cw] = np.clip(roi * (1.0 - patch_a) + patch_bgr * patch_a, 0, 255).astype(np.uint8)
    return out


def _composite_framing_hands(
    base_bgr: np.ndarray,
    fg_hands_rgba: Optional[np.ndarray],
    cum_dx: float,
    cum_dy: float,
    frame_idx: int,
) -> np.ndarray:
    """
    VFX-06: Composite the IS-Net segmented foreground framing hands (`fg_hands_rgba.png`)
    into the lower-left and lower-right outer corners using premultiplied alpha optical
    bokeh (`GaussianBlur`) so there is ZERO white/grey edge halo around the fingers.
    """
    if fg_hands_rgba is None:
        return base_bgr

    h, w = base_bgr.shape[:2]
    hh, hw = fg_hands_rgba.shape[:2]
    mid_x = hw // 2

    graded_full_rgb = _bleach_bypass_selective(fg_hands_rgba[:, :, :3], vivid_boost=1.35)
    clean_rgba = np.dstack([graded_full_rgb, fg_hands_rgba[:, :, 3]])

    premult_bgr = np.zeros((h, w, 3), dtype=np.float32)
    canvas_a = np.zeros((h, w), dtype=np.float32)

    target_hand_w = int(w * 0.36)
    target_hand_h = int(target_hand_w * (hh / float(max(1, mid_x))))

    sway_x = int(round(cum_dx * 0.30 + 5.0 * math.sin(frame_idx * 0.15)))
    sway_y = int(round(cum_dy * 0.22 + 4.0 * math.cos(frame_idx * 0.13)))

    lh = cv2.resize(clean_rgba[:, :mid_x], (target_hand_w, target_hand_h), interpolation=cv2.INTER_AREA)
    rh = cv2.resize(clean_rgba[:, mid_x:], (target_hand_w, target_hand_h), interpolation=cv2.INTER_AREA)

    for hand_rgba, x_pos in ((lh, -int(w * 0.04) + sway_x), (rh, w - target_hand_w + int(w * 0.04) - sway_x)):
        y_pos = h - target_hand_h + int(h * 0.08) + sway_y
        sx0, sy0 = max(0, -x_pos), max(0, -y_pos)
        dx0, dy0 = max(0, x_pos), max(0, y_pos)
        cw = min(target_hand_w - sx0, w - dx0)
        ch = min(target_hand_h - sy0, h - dy0)
        if cw > 0 and ch > 0:
            sub_rgb = hand_rgba[sy0 : sy0 + ch, sx0 : sx0 + cw, :3].astype(np.float32)
            sub_a = hand_rgba[sy0 : sy0 + ch, sx0 : sx0 + cw, 3].astype(np.float32) / 255.0
            premult_bgr[dy0 : dy0 + ch, dx0 : dx0 + cw] = sub_rgb * sub_a[:, :, None]
            canvas_a[dy0 : dy0 + ch, dx0 : dx0 + cw] = sub_a

    blurred_premult = cv2.GaussianBlur(premult_bgr, (21, 21), 5.0)
    blurred_a = cv2.GaussianBlur(canvas_a, (21, 21), 5.0)[:, :, None]

    return np.clip(base_bgr.astype(np.float32) * (1.0 - blurred_a) + blurred_premult, 0, 255).astype(np.uint8)


def _draw_brinks_vault_badge(frame_bgr: np.ndarray, frame_idx: int, total_frames: int) -> np.ndarray:
    """
    VFX-10B: Overlay the 'BRINKS // ARMORED VAULT' Security Shield & Rotating Steel Vault Wheel Emblem
    with navy-blue armor core, silver vault spokes, crimson vector chevron, and crisp title typography.
    """
    out = _bleach_bypass_selective(frame_bgr, vivid_boost=1.48)
    h, w = out.shape[:2]

    overlay = out.copy()
    cx, cy = int(w * 0.22), int(h * 0.26)
    rad = int(min(w, h) * 0.115)

    cv2.circle(overlay, (cx, cy), rad + 6, (195, 202, 210), -1, lineType=cv2.LINE_AA)
    cv2.circle(overlay, (cx, cy), rad, (145, 48, 12), -1, lineType=cv2.LINE_AA)
    cv2.circle(overlay, (cx, cy), int(rad * 0.78), (215, 222, 230), 2, lineType=cv2.LINE_AA)

    rot_rad = frame_idx * 0.04
    for sp in range(6):
        ang = rot_rad + sp * (math.pi / 3.0)
        x1 = int(cx + math.cos(ang) * (rad * 0.22))
        y1 = int(cy + math.sin(ang) * (rad * 0.22))
        x2 = int(cx + math.cos(ang) * (rad * 0.76))
        y2 = int(cy + math.sin(ang) * (rad * 0.76))
        cv2.line(overlay, (x1, y1), (x2, y2), (210, 218, 225), 2, lineType=cv2.LINE_AA)

    wing1 = np.array([
        [cx - int(rad * 1.30), cy + int(rad * 0.45)],
        [cx + int(rad * 0.15), cy - int(rad * 0.18)],
        [cx + int(rad * 1.25), cy - int(rad * 0.72)],
        [cx + int(rad * 0.08), cy - int(rad * 0.02)],
    ], dtype=np.int32)
    cv2.fillPoly(overlay, [wing1], (28, 28, 235), lineType=cv2.LINE_AA)

    cv2.putText(overlay, "BRINKS", (cx - int(rad * 0.82), cy + int(rad * 0.14)), cv2.FONT_HERSHEY_COMPLEX, 1.15, (255, 255, 255), 3, cv2.LINE_AA)
    cv2.putText(overlay, "BRINKS // ARMORED VAULT", (cx + rad + 22, cy - 6), cv2.FONT_HERSHEY_COMPLEX, 0.68, (245, 245, 248), 2, cv2.LINE_AA)
    cv2.putText(overlay, "$100 HEIST EDITION", (cx + rad + 22, cy + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (135, 235, 155), 2, cv2.LINE_AA)

    return cv2.addWeighted(overlay, 0.92, out, 0.08, 0)


def render_motm_vfx_segment(
    ffmpeg_bin: str,
    seg,
    seg_out: str,
    target_w: int,
    target_h: int,
    fps: int,
    exact_frames: int,
    clone_clip_filepath: Optional[str] = None,
    clone_clip_in: float = 0.0,
) -> bool:
    """
    Render a timeline segment with one of the 10 Laughtodabank-style VFX families tailored for 'BRINKS'
    at `target_w x target_h`, `fps`, and `exact_frames`, encoding via Apple Silicon `h264_videotoolbox`.
    """
    effect = getattr(seg, "effect", "none") or "none"
    if not effect.startswith("motm_"):
        return False

    cap = cv2.VideoCapture(seg.clip_filepath)
    if not cap.isOpened():
        return False
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(seg.clip_in)) * 1000.0)

    cap_clone = None
    if effect == "motm_roto_clone" and clone_clip_filepath and os.path.exists(clone_clip_filepath):
        cap_clone = cv2.VideoCapture(clone_clip_filepath)
        if cap_clone.isOpened():
            cap_clone.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(clone_clip_in)) * 1000.0)

    work_w, work_h = 1280, 720
    money_sky_big = _load_plate("brinks_money_sky_plate.jpg", int(work_w * 1.35), int(work_h * 1.35))
    bank_vault_plate = _load_plate("brinks_bank_vault_plate.jpg", work_w, work_h)
    brinks_truck_plate = _load_plate("brinks_truck_heist_plate.jpg", work_w, work_h)

    seg_idx = int(getattr(seg, "index", 0) or 0)
    use_truck_plate = seg_idx in (30, 31, 54, 55, 56, 63, 64, 66, 68, 79)
    active_heist_stage = brinks_truck_plate if use_truck_plate else bank_vault_plate
    active_heist_stage_dof = cv2.GaussianBlur(active_heist_stage, (5, 5), 1.2)

    eagle_rgba = _load_rgba_asset("eagle_rgba.png")
    fg_hands_rgba = _load_rgba_asset("fg_hands_rgba.png")

    hw_cmd = [
        ffmpeg_bin,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{target_w}x{target_h}",
        "-r", str(fps),
        "-i", "-",
        "-an",
        "-vf", "format=yuv420p,setsar=1",
        "-frames:v", str(exact_frames),
        "-c:v", "h264_videotoolbox",
        "-b:v", "12M",
        "-r", str(fps),
        seg_out,
    ]
    proc = subprocess.Popen(hw_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None

    echo_history: deque = deque(maxlen=9)
    prev_gray: Optional[np.ndarray] = None
    cum_dx, cum_dy = 0.0, 0.0
    last_valid = np.zeros((work_h, work_w, 3), dtype=np.uint8)

    rvm_rec_main = _init_rvm_rec()
    rvm_rec_clone = _init_rvm_rec()

    yy, xx = np.mgrid[0:work_h, 0:work_w].astype(np.float32)
    clip_fname = os.path.basename(getattr(seg, "clip_filepath", "") or "")

    for f_idx in range(exact_frames):
        ok, raw = cap.read()
        if not ok or raw is None:
            frame = last_valid.copy()
        else:
            ih, iw = raw.shape[:2]
            scale_f = max(work_w / float(iw), work_h / float(ih))
            rw, rh = int(round(iw * scale_f)), int(round(ih * scale_f))
            resized = cv2.resize(raw, (rw, rh), interpolation=cv2.INTER_LINEAR)
            x0, y0 = (rw - work_w) // 2, (rh - work_h) // 2
            frame = resized[y0 : y0 + work_h, x0 : x0 + work_w].copy()
            last_valid = frame.copy()

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if prev_gray is not None:
            flow = cv2.calcOpticalFlowFarneback(
                cv2.resize(prev_gray, (320, 180)),
                cv2.resize(gray, (320, 180)),
                None, 0.5, 2, 15, 2, 5, 1.1, 0
            )
            cum_dx = float(np.clip(cum_dx + np.median(flow[..., 0]) * 4.0, -160.0, 160.0))
            cum_dy = float(np.clip(cum_dy + np.median(flow[..., 1]) * 4.0, -90.0, 90.0))
        prev_gray = gray

        # -----------------------------------------------------------------
        # Dispatch each of the 10 'BRINKS' VFX Families
        # -----------------------------------------------------------------
        if effect == "motm_bleach_pop":
            out_frame = _bleach_bypass_selective(frame, vivid_boost=1.45)

        elif effect == "motm_nasa_card":
            out_frame = _draw_brinks_vault_badge(frame, f_idx, exact_frames)

        elif effect == "motm_sky_cosmos":
            base = _bleach_bypass_selective(frame)
            human_a, _, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

            if "3602" in clip_fname:
                roof_line_y = work_h * 0.52 - (xx - work_w * 0.36) * 0.56
                sky_zone = (yy < roof_line_y) & (xx < work_w * 0.58) & (hsv[:, :, 2] < 50)
            else:
                sky_zone = (yy < work_h * 0.72) & (hsv[:, :, 2] < 55)

            sky_u8 = (sky_zone.astype(np.float32) * (1.0 - np.clip(human_a * 1.15, 0.0, 1.0)) * 255.0).astype(np.uint8)
            sky_alpha = cv2.GaussianBlur(sky_u8, (11, 11), 0)[:, :, None].astype(np.float32) / 255.0

            ox = int(np.clip(work_w * 0.17 - cum_dx, 0, money_sky_big.shape[1] - work_w))
            oy = int(np.clip(work_h * 0.04 - cum_dy, 0, money_sky_big.shape[0] - work_h))
            tracked_sky = money_sky_big[oy : oy + work_h, ox : ox + work_w]
            out_frame = np.clip(base.astype(np.float32) * (1.0 - sky_alpha) + tracked_sky.astype(np.float32) * sky_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_lunar_env":
            human_a, clean_fg_bgr, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            graded_fg = _bleach_bypass_selective(clean_fg_bgr.astype(np.uint8), vivid_boost=1.42).astype(np.float32)
            subj_alpha = human_a[:, :, None]

            M_stage = np.float32([[1.04, 0, -work_w * 0.02 - cum_dx * 0.35], [0, 1.04, -work_h * 0.02 - cum_dy * 0.25]])
            stage_t = cv2.warpAffine(active_heist_stage_dof, M_stage, (work_w, work_h), borderMode=cv2.BORDER_REFLECT).astype(np.float32)

            stage_blur = cv2.GaussianBlur(stage_t, (21, 21), 0)
            rim_mask = ((human_a > 0.05) & (human_a < 0.85)).astype(np.float32)[:, :, None]
            lit_fg = graded_fg * (1.0 - rim_mask * 0.18) + stage_blur * (rim_mask * 0.18)

            out_frame = np.clip(stage_t * (1.0 - subj_alpha) + lit_fg * subj_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_doorway_portal":
            base = _bleach_bypass_selective(frame)
            human_a, _, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            # Soft radial/feathered window zone on the right behind the artist so there are zero hard rectangular edges
            zone_mask = np.zeros((work_h, work_w), dtype=np.float32)
            cv2.rectangle(
                zone_mask,
                (int(work_w * 0.65), int(work_h * 0.34)),
                (int(work_w * 0.92), int(work_h * 0.76)),
                1.0,
                -1,
            )
            zone_soft = cv2.GaussianBlur(zone_mask, (65, 65), 22.0)
            dark_luma = np.clip((68.0 - hsv[:, :, 2].astype(np.float32)) / 26.0, 0.0, 1.0)
            portal_f = zone_soft * dark_luma * (1.0 - np.clip(human_a * 1.15, 0.0, 1.0))
            portal_alpha = cv2.GaussianBlur(portal_f, (15, 15), 5.0)[:, :, None]

            M_par = np.float32([[0.48, 0, work_w * 0.52 - cum_dx * 0.25], [0, 0.48, work_h * 0.32 - cum_dy * 0.25]])
            inner_world = cv2.warpAffine(active_heist_stage, M_par, (work_w, work_h), borderMode=cv2.BORDER_REFLECT)
            out_frame = np.clip(base.astype(np.float32) * (1.0 - portal_alpha) + inner_world.astype(np.float32) * portal_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_roto_clone":
            base = _bleach_bypass_selective(frame)
            fg_main_a, clean_main_bgr, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            graded_main_fg = _bleach_bypass_selective(clean_main_bgr.astype(np.uint8)).astype(np.float32)

            clone_src = frame
            if cap_clone is not None and cap_clone.isOpened():
                ok_c, raw_c = cap_clone.read()
                if ok_c and raw_c is not None:
                    clone_src = cv2.resize(raw_c, (work_w, work_h))
            c_alpha, clean_clone_bgr, rvm_rec_clone = _neural_human_matte(clone_src, rvm_rec_clone)
            graded_clone_fg = _bleach_bypass_selective(clean_clone_bgr.astype(np.uint8)).astype(np.float32)

            canvas = base.astype(np.float32).copy()
            # Keep scale=1.0 and dy=0 so the clone spans the full vertical frame with zero top/bottom horizontal cut lines!
            for dx_shift in (-work_w * 0.26, work_w * 0.26):
                M_shift = np.float32([[1.0, 0, dx_shift], [0, 1.0, 0.0]])
                s_fg = cv2.warpAffine(graded_clone_fg, M_shift, (work_w, work_h), borderMode=cv2.BORDER_CONSTANT)
                s_a = cv2.warpAffine(c_alpha, M_shift, (work_w, work_h), borderMode=cv2.BORDER_CONSTANT)[:, :, None]
                canvas = canvas * (1.0 - s_a) + s_fg * s_a

            # Composite the primary performer 100% solid ON TOP of the flanking clones
            main_a_3 = fg_main_a[:, :, None]
            out_frame = np.clip(canvas * (1.0 - main_a_3) + graded_main_fg * main_a_3, 0, 255).astype(np.uint8)

        elif effect == "motm_fg_hands":
            base = _bleach_bypass_selective(frame)
            out_frame = _composite_framing_hands(base, fg_hands_rgba, cum_dx, cum_dy, f_idx)

        elif effect == "motm_motion_echo":
            base = _bleach_bypass_selective(frame)
            human_a, clean_fg_bgr, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            graded_fg = _bleach_bypass_selective(clean_fg_bgr.astype(np.uint8)).astype(np.float32)
            subj_alpha = human_a[:, :, None]
            echo_history.append((graded_fg, subj_alpha))
            canvas = base.astype(np.float32).copy()
            for tap_idx, (step, weight, shift_px) in enumerate(((5, 0.42, 138), (3, 0.58, 92), (1, 0.75, 46))):
                if len(echo_history) > step:
                    old_f, old_a = echo_history[-1 - step]
                    old_f_s = np.roll(old_f, shift_px, axis=1).copy()
                    old_f_s[:, :, 0] = np.clip(old_f_s[:, :, 0] * 1.18 + 22.0, 0, 255)
                    old_f_s[:, :, 1] = np.clip(old_f_s[:, :, 1] * 1.08 + 12.0, 0, 255)
                    old_a_s = np.roll(old_a, shift_px, axis=1) * weight
                    canvas = canvas * (1.0 - old_a_s) + old_f_s * old_a_s
            canvas = canvas * (1.0 - subj_alpha) + graded_fg * subj_alpha
            out_frame = np.clip(canvas, 0, 255).astype(np.uint8)

        elif effect == "motm_ink_corrupt":
            base = _bleach_bypass_selective(frame)
            human_a, _, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            luma = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
            cloth_mask = (human_a > 0.65) & (yy > work_h * 0.28) & (luma > 95.0) & (luma < 230.0)

            t_phase = f_idx * 0.18
            ink_field = (
                np.sin((xx + cum_dx) * 0.032 + t_phase) * np.cos((yy + cum_dy) * 0.038 - t_phase * 1.3)
                + 0.55 * np.sin(xx * 0.085 - yy * 0.07 + t_phase * 2.1)
            )
            ink_patches = (ink_field > 0.32) & cloth_mask
            ink_u8 = (ink_patches.astype(np.uint8) * 255)
            ink_alpha = cv2.GaussianBlur(ink_u8, (7, 7), 0)[:, :, None].astype(np.float32) / 255.0

            ink_rim = cv2.Canny(ink_u8, 60, 160)
            ink_rim_b = cv2.GaussianBlur(ink_rim, (3, 3), 0)[:, :, None].astype(np.float32)

            corrupted = base.astype(np.float32) * (1.0 - ink_alpha * 0.92) + ink_rim_b * 0.85
            out_frame = np.clip(corrupted, 0, 255).astype(np.uint8)

        elif effect == "motm_diamond_grillz":
            base = _bleach_bypass_selective(frame, vivid_boost=1.65)
            comp = base.astype(np.float32).copy()
            roi_y0, roi_y1 = int(work_h * 0.32), int(work_h * 0.68)
            roi_x0, roi_x1 = int(work_w * 0.34), int(work_w * 0.66)
            roi_bgr = base[roi_y0:roi_y1, roi_x0:roi_x1]
            roi_hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
            glint_score = roi_hsv[:, :, 2].astype(np.float32) + roi_hsv[:, :, 1].astype(np.float32) * 0.65
            peaks = []
            temp_score = glint_score.copy()
            for _ in range(3):
                min_v, max_v, min_l, max_l = cv2.minMaxLoc(temp_score)
                if max_v < 110.0:
                    break
                px, py = max_l[0] + roi_x0, max_l[1] + roi_y0
                peaks.append((px, py, max_v))
                cv2.circle(temp_score, max_l, 32, 0.0, -1)

            overlay_glint = np.zeros_like(comp)
            for idx_p, (px, py, val) in enumerate(peaks):
                arm_main = int(34 + 10 * math.sin(f_idx * 0.45 + idx_p * 1.3))
                arm_diag = int(arm_main * 0.55)
                cv2.circle(overlay_glint, (px, py), 5, (255, 235, 185), -1, lineType=cv2.LINE_AA)
                cv2.circle(overlay_glint, (px, py), 2, (255, 255, 255), -1, lineType=cv2.LINE_AA)
                cv2.line(overlay_glint, (px - int(arm_main * 1.35), py), (px + int(arm_main * 1.35), py), (255, 240, 200), 1, lineType=cv2.LINE_AA)
                cv2.line(overlay_glint, (px, py - arm_main), (px, py + arm_main), (255, 248, 225), 1, lineType=cv2.LINE_AA)
                cv2.line(overlay_glint, (px - arm_diag, py - arm_diag), (px + arm_diag, py + arm_diag), (230, 215, 255), 1, lineType=cv2.LINE_AA)
                cv2.line(overlay_glint, (px - arm_diag, py + arm_diag), (px + arm_diag, py - arm_diag), (215, 245, 255), 1, lineType=cv2.LINE_AA)

            overlay_soft = cv2.GaussianBlur(overlay_glint, (7, 7), 0)
            out_frame = np.clip(comp + overlay_glint * 0.90 + overlay_soft * 0.55, 0, 255).astype(np.uint8)

        elif effect == "motm_eagle_shoulder":
            base = _bleach_bypass_selective(frame)
            human_a, _, rvm_rec_main = _neural_human_matte(frame, rvm_rec_main)
            sh_x, sh_y, _ = _find_shoulder_anchor(frame, human_a)
            out_frame = _composite_rgba_eagle(base, eagle_rgba, sh_x, sh_y, target_height=185, frame_idx=f_idx)

        elif effect == "motm_dutch_flash":
            base = _bleach_bypass_selective(frame)
            decay = math.exp(-f_idx / max(4.0, fps * 0.28))
            angle_deg = 13.5 * decay * (1 if (seg.index % 2 == 0) else -1)
            zoom = 1.06 + 0.14 * decay
            M_rot = cv2.getRotationMatrix2D((work_w * 0.5, work_h * 0.5), angle_deg, zoom)
            out_frame = cv2.warpAffine(base, M_rot, (work_w, work_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

            if f_idx < 2:
                flash_w = 0.78 if f_idx == 0 else 0.42
                white = np.full_like(out_frame, 252)
                out_frame = cv2.addWeighted(out_frame, 1.0 - flash_w, white, flash_w, 0)

        else:
            out_frame = _bleach_bypass_selective(frame)

        if (target_w, target_h) != (work_w, work_h):
            out_frame = cv2.resize(out_frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

        proc.stdin.write(out_frame.tobytes())

    proc.stdin.close()
    proc.wait()
    cap.release()
    if cap_clone is not None:
        cap_clone.release()

    return os.path.exists(seg_out) and os.path.getsize(seg_out) > 1024
