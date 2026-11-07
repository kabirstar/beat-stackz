"""
vfx_motm_engine.py — Laughtodabank-Style 10-Effect VFX Compositing Engine (Tailored for "BRINKS")
Implements all 10 VFX families documented in `clipper/MUSIC_VIDEO_VFX_PLAYBOOK.md` for Clipper Studio,
adapted to the "BRINKS" theme (Bank Vaults overflowing with $100 bills & gold bars, Armored Brinks Heist Trucks,
and Raining $100 Bills instead of outer space):
  - VFX-01 (`motm_bleach_pop`): Bleach-Bypass Silver Monochrome + Selective Color Pop (Red/Gold/Emerald-Green/Blue)
  - VFX-02 (`motm_sky_cosmos`): Camera-Tracked Raining $100 Bills & Giant Bank Vault Wheel Sky Replacement
  - VFX-03 (`motm_lunar_env`): Full-Body Roto Environment Swap into Bank Vault (Cash/Gold) & Armored Brinks Truck
  - VFX-04 (`motm_doorway_portal`): Architectural Garage/Doorway Portal into Bank Vault & Armored Brinks Truck
  - VFX-05 (`motm_roto_clone`): Multi-Take Synced Roto-Clone Double Performance
  - VFX-06 (`motm_fg_hands`): Twin Oversized Foreground Hand Cutouts with Optical Lens Defocus
  - VFX-07 (`motm_motion_echo`): Subject-Isolated Step-Printing Motion Echo Trail
  - VFX-08 (`motm_ink_corrupt`): Optical-Flow Warped Glossy Black-Ink / Ferrofluid Fabric Corruption
  - VFX-09A (`motm_diamond_grillz`): Macro Gold Grillz / Saxophone Crystalline Diamond Prism Glints
  - VFX-09B (`motm_eagle_shoulder`): Anchor-Tracked Surreal Perched Bald Eagle with Selective Gold Beak
  - VFX-10A (`motm_dutch_flash`): 24fps Kinetic Dutch-Angle Whip-Zoom + 2-Frame White Exposure Flash
  - VFX-10B (`motm_nasa_card`): "BRINKS // ARMORED VAULT" Security Shield Emblem Overlay + Bleach Grade
"""

from __future__ import annotations

import math
import os
import subprocess
from collections import deque
from typing import Optional, Tuple

import cv2
import numpy as np


MOTM_VFX_LABELS = {
    "motm_nasa_card": "VFX-10B: 'BRINKS // ARMORED VAULT' Security Emblem + Bleach Grade",
    "motm_sky_cosmos": "VFX-02: Tracked Raining $100 Bills & Bank Vault Sky Replacement",
    "motm_bleach_pop": "VFX-01: Bleach-Bypass Monochrome + Selective Red/Gold/Green Pop",
    "motm_diamond_grillz": "VFX-09A: Crystalline Diamond Prism & Starburst Glints",
    "motm_motion_echo": "VFX-07: Subject-Isolated Step-Print Motion Echo Trail",
    "motm_dutch_flash": "VFX-10A: Dutch-Angle Whip-Zoom + 2-Frame White Shutter Flash",
    "motm_lunar_env": "VFX-03: Bank Vault & Armored Brinks Truck Roto Environment Swap",
    "motm_roto_clone": "VFX-05: Synced Multi-Take Roto-Clone Double Performance",
    "motm_eagle_shoulder": "VFX-09B: Tracked Perched Bald Eagle Surreal Prop",
    "motm_fg_hands": "VFX-06: Oversized Foreground Hand Cutout Frame-In",
    "motm_ink_corrupt": "VFX-08: Glossy Black-Ink Ferrofluid Hoodie Corruption",
    "motm_doorway_portal": "VFX-04: Architectural Garage Portal to Bank Vault & Brinks Truck",
}

ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "motm")


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


def _detect_performer_shield(frame_bgr: np.ndarray) -> Tuple[np.ndarray, int, int, int]:
    """
    Compute a solid protective mask (`0.0 .. 1.0` float32) covering the performer's:
      - Curly black hair halo above and around the face
      - Face & neck
      - Shoulders, torso, and arms
    Returns `(shield_float32, face_cx, face_cy, face_radius)`.
    Guarantees that background/sky replacements NEVER bleed over the performer's black hair or clothing.
    """
    h, w = frame_bgr.shape[:2]
    ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)

    yy, xx = np.mgrid[0:h, 0:w]
    central_zone = (xx > int(w * 0.32)) & (xx < int(w * 0.68)) & (yy > int(h * 0.12)) & (yy < int(h * 0.62))
    not_orange_wall = ~((hsv[:, :, 0] >= 8) & (hsv[:, :, 0] <= 26) & (hsv[:, :, 1] > 145))
    skin_mask = (
        central_zone
        & not_orange_wall
        & (ycrcb[:, :, 1] >= 136)
        & (ycrcb[:, :, 1] <= 176)
        & (ycrcb[:, :, 2] >= 82)
        & (ycrcb[:, :, 2] <= 126)
        & (hsv[:, :, 2] > 40)
    )

    # If performer is wearing the bright white Rolling Loud hoodie, anchor horizontal center to the hoodie's upper torso/hood!
    white_hoodie = central_zone & (hsv[:, :, 2] > 145) & (hsv[:, :, 1] < 75)
    wh_pts = np.argwhere(white_hoodie)
    skin_pts = np.argwhere(skin_mask)
    if len(wh_pts) > 2500:
        fcx = int(np.median(wh_pts[:, 1]))
        top_hood_y = int(np.percentile(wh_pts[:, 0], 12))
        fcy = int(max(h * 0.24, top_hood_y - h * 0.03))
        frad = int(h * 0.095)
    elif len(skin_pts) > 120:
        fcy = int(np.median(skin_pts[:, 0]))
        fcx = int(np.median(skin_pts[:, 1]))
        frad = int(np.clip(np.std(skin_pts[:, 0]) * 2.2, h * 0.095, h * 0.145))
    else:
        fcx, fcy, frad = int(w * 0.48), int(h * 0.36), int(h * 0.12)

    shield = np.zeros((h, w), dtype=np.uint8)
    # 1. Tight, contour-hugging Head + Curly Hair Halo
    hair_center = (fcx, int(fcy - frad * 0.14))
    hair_axes = (int(frad * 0.82), int(frad * 0.98))
    cv2.ellipse(shield, hair_center, hair_axes, 0, 0, 360, 255, -1)

    # 2. Tight Neck + Shoulders + Torso trapezoid down to bottom of frame
    sh_top_y = int(fcy + frad * 0.55)
    torso_pts = np.array([
        [fcx - int(frad * 1.25), sh_top_y],
        [fcx + int(frad * 1.25), sh_top_y],
        [fcx + int(frad * 1.55), h],
        [fcx - int(frad * 1.55), h],
    ], dtype=np.int32)
    cv2.fillPoly(shield, [torso_pts], 255)

    shield_f = cv2.GaussianBlur(shield, (15, 15), 0).astype(np.float32) / 255.0
    return np.clip(shield_f, 0.0, 1.0), fcx, fcy, frad


def _extract_subject_alpha(frame_bgr: np.ndarray) -> np.ndarray:
    """
    Extract a clean, solid foreground performer silhouette (`0.0 .. 1.0` float32)
    that keeps dark curly hair, warm skin, and graphic hoodie 100% opaque (`1.0`).
    """
    h, w = frame_bgr.shape[:2]
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    ycrcb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)

    shield_f, fcx, fcy, frad = _detect_performer_shield(frame_bgr)
    yy, xx = np.mgrid[0:h, 0:w]

    head_core = (((xx - fcx) / (frad * 0.85)) ** 2 + ((yy - (fcy - frad * 0.14)) / (frad * 1.02)) ** 2) <= 1.0
    not_orange_wall = ~((hsv[:, :, 0] >= 6) & (hsv[:, :, 0] <= 28) & (hsv[:, :, 1] > 110) & (hsv[:, :, 2] < 220))
    is_skin = not_orange_wall & (ycrcb[:, :, 1] >= 136) & (ycrcb[:, :, 1] <= 176) & (shield_f > 0.12)
    is_bright_hoodie = (hsv[:, :, 2] > 115) & (hsv[:, :, 1] < 95) & (shield_f > 0.12)
    is_torso_solid = (shield_f > 0.52)

    fg_raw = ((head_core | is_skin | is_bright_hoodie | is_torso_solid)).astype(np.uint8) * 255

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    closed = cv2.morphologyEx(fg_raw, cv2.MORPH_CLOSE, kernel, iterations=2)
    alpha = cv2.GaussianBlur(closed, (15, 15), 0).astype(np.float32) / 255.0
    return np.clip(alpha, 0.0, 1.0)


def _composite_rgba_eagle(
    canvas_bgr: np.ndarray,
    eagle_rgba: Optional[np.ndarray],
    anchor_x: int,
    anchor_y: int,
    scale: float = 0.62,
    frame_idx: int = 0,
) -> np.ndarray:
    """
    VFX-09B: Composite the real photographic Bald Eagle cutout (`eagle_rgba.png`)
    perched on the performer's shoulder/forearm with camera motion tracking & subtle breathing motion.
    """
    if eagle_rgba is None:
        return canvas_bgr

    out = canvas_bgr.copy()
    h, w = out.shape[:2]
    eh, ew = eagle_rgba.shape[:2]
    tw, th = max(32, int(round(ew * scale))), max(32, int(round(eh * scale)))
    resized = cv2.resize(eagle_rgba, (tw, th), interpolation=cv2.INTER_LINEAR)

    bob_y = int(round(2.0 * math.sin(frame_idx * 0.22)))
    x0 = int(anchor_x - tw * 0.52)
    y0 = int(anchor_y - th * 0.78 + bob_y)

    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    cw = min(tw - sx0, w - dx0)
    ch = min(th - sy0, h - dy0)
    if cw <= 0 or ch <= 0:
        return out

    patch_bgr = resized[sy0 : sy0 + ch, sx0 : sx0 + cw, :3].astype(np.float32)
    patch_a = (resized[sy0 : sy0 + ch, sx0 : sx0 + cw, 3:4].astype(np.float32) / 255.0) * 0.96
    roi = out[dy0 : dy0 + ch, dx0 : dx0 + cw].astype(np.float32)
    out[dy0 : dy0 + ch, dx0 : dx0 + cw] = np.clip(roi * (1.0 - patch_a) + patch_bgr * patch_a, 0, 255).astype(np.uint8)
    return out


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

    # Outer stainless-steel bank vault ring + navy-blue Brinks armored core
    cv2.circle(overlay, (cx, cy), rad + 6, (195, 202, 210), -1, lineType=cv2.LINE_AA)
    cv2.circle(overlay, (cx, cy), rad, (145, 48, 12), -1, lineType=cv2.LINE_AA)
    cv2.circle(overlay, (cx, cy), int(rad * 0.78), (215, 222, 230), 2, lineType=cv2.LINE_AA)

    # Rotating bank vault locking wheel spokes
    rot_rad = frame_idx * 0.04
    for sp in range(6):
        ang = rot_rad + sp * (math.pi / 3.0)
        x1 = int(cx + math.cos(ang) * (rad * 0.22))
        y1 = int(cy + math.sin(ang) * (rad * 0.22))
        x2 = int(cx + math.cos(ang) * (rad * 0.76))
        y2 = int(cy + math.sin(ang) * (rad * 0.76))
        cv2.line(overlay, (x1, y1), (x2, y2), (210, 218, 225), 2, lineType=cv2.LINE_AA)

    # Crimson Brinks Armored Security Vector Wing
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
    # Load Brinks-themed photorealistic plates:
    # 1. Raining $100 bills + giant bank vault wheel in the night sky
    money_sky_big = _load_plate("brinks_money_sky_plate.jpg", int(work_w * 1.35), int(work_h * 1.35))
    # 2. Bank vault overflowing with $100 bills & gold bars vs. Armored Brinks Heist Truck with open rear doors
    bank_vault_plate = _load_plate("brinks_bank_vault_plate.jpg", work_w, work_h)
    brinks_truck_plate = _load_plate("brinks_truck_heist_plate.jpg", work_w, work_h)

    # Choose between Armored Brinks Truck plate and Bank Vault plate based on segment index so both are showcased!
    seg_idx = int(getattr(seg, "index", 0) or 0)
    use_truck_plate = seg_idx in (30, 31, 55, 56, 63, 64, 68, 79)
    active_heist_stage = brinks_truck_plate if use_truck_plate else bank_vault_plate

    eagle_rgba = _load_rgba_asset("eagle_rgba.png")
    fg_hands_rgba = _load_rgba_asset("fg_hands_rgba.png")
    if fg_hands_rgba is not None:
        fg_hands_rgba = cv2.resize(fg_hands_rgba, (work_w, work_h), interpolation=cv2.INTER_LINEAR)

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

    yy, xx = np.mgrid[0:work_h, 0:work_w].astype(np.float32)

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
            shield_f, _, _, _ = _detect_performer_shield(frame)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            # Replace dark night sky above horizon (y < 0.54*h) strictly outside the performer's hair/head shield
            is_sky = (hsv[:, :, 2] < 52) & (yy < work_h * 0.54)
            sky_u8 = (is_sky.astype(np.float32) * (1.0 - np.clip(shield_f * 1.4, 0.0, 1.0)) * 255.0).astype(np.uint8)
            sky_alpha = cv2.GaussianBlur(sky_u8, (25, 25), 0)[:, :, None].astype(np.float32) / 255.0

            ox = int(np.clip(work_w * 0.17 - cum_dx, 0, money_sky_big.shape[1] - work_w))
            oy = int(np.clip(work_h * 0.04 - cum_dy, 0, money_sky_big.shape[0] - work_h))
            tracked_sky = money_sky_big[oy : oy + work_h, ox : ox + work_w]
            out_frame = np.clip(base.astype(np.float32) * (1.0 - sky_alpha) + tracked_sky.astype(np.float32) * sky_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_lunar_env":
            base = _bleach_bypass_selective(frame)
            subj_alpha = _extract_subject_alpha(frame)[:, :, None]
            # Transport performer into the Bank Vault or Armored Brinks Truck heist scene with camera-tracked parallax
            M_stage = np.float32([[1.04, 0, -work_w * 0.02 - cum_dx * 0.35], [0, 1.04, -work_h * 0.02 - cum_dy * 0.25]])
            stage_t = cv2.warpAffine(active_heist_stage, M_stage, (work_w, work_h), borderMode=cv2.BORDER_REFLECT)
            out_frame = np.clip(stage_t.astype(np.float32) * (1.0 - subj_alpha) + base.astype(np.float32) * subj_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_doorway_portal":
            base = _bleach_bypass_selective(frame)
            shield_f, _, _, _ = _detect_performer_shield(frame)
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            # Target the open architectural garage archway / night opening on the right behind the performer
            arch_opening = (xx > work_w * 0.64) & (xx < work_w * 0.93) & (yy > work_h * 0.32) & (yy < work_h * 0.78) & (hsv[:, :, 2] < 85)
            upper_sky = (xx > work_w * 0.75) & (yy < work_h * 0.42) & (hsv[:, :, 2] < 55)
            portal_raw = ((arch_opening | upper_sky).astype(np.float32) * (1.0 - np.clip(shield_f * 1.4, 0.0, 1.0)) * 255.0).astype(np.uint8)
            portal_alpha = (cv2.GaussianBlur(portal_raw, (17, 17), 0).astype(np.float32) / 255.0)[:, :, None]

            # Scale the Bank Vault / Brinks Truck so its open vault door sits right inside the archway window [0.64..0.93, 0.32..0.78]
            M_par = np.float32([[0.48, 0, work_w * 0.52 - cum_dx * 0.25], [0, 0.48, work_h * 0.32 - cum_dy * 0.25]])
            inner_world = cv2.warpAffine(active_heist_stage, M_par, (work_w, work_h), borderMode=cv2.BORDER_REFLECT)
            out_frame = np.clip(base.astype(np.float32) * (1.0 - portal_alpha) + inner_world.astype(np.float32) * portal_alpha, 0, 255).astype(np.uint8)

        elif effect == "motm_roto_clone":
            base = _bleach_bypass_selective(frame)
            clone_src = frame
            if cap_clone is not None and cap_clone.isOpened():
                ok_c, raw_c = cap_clone.read()
                if ok_c and raw_c is not None:
                    clone_src = cv2.resize(raw_c, (work_w, work_h))
            clone_bleached = _bleach_bypass_selective(clone_src)
            c_alpha = _extract_subject_alpha(clone_src)
            M_shift = np.float32([[0.92, 0, -work_w * 0.25], [0, 0.92, work_h * 0.05]])
            shifted_clone = cv2.warpAffine(clone_bleached, M_shift, (work_w, work_h), borderMode=cv2.BORDER_REFLECT)
            shifted_alpha = cv2.warpAffine(c_alpha, M_shift, (work_w, work_h), borderMode=cv2.BORDER_CONSTANT)[:, :, None] * 0.94
            fg_primary = _extract_subject_alpha(frame)[:, :, None]
            effective_clone_a = shifted_alpha * (1.0 - fg_primary * 0.65)
            out_frame = np.clip(base.astype(np.float32) * (1.0 - effective_clone_a) + shifted_clone.astype(np.float32) * effective_clone_a, 0, 255).astype(np.uint8)

        elif effect == "motm_fg_hands":
            base = _bleach_bypass_selective(frame)
            if fg_hands_rgba is not None:
                sway_x = int(round(cum_dx * 0.35 + 6.0 * math.sin(f_idx * 0.16)))
                sway_y = int(round(cum_dy * 0.25 + 4.0 * math.cos(f_idx * 0.14)))
                M_fg = np.float32([[1.04, 0, sway_x - work_w * 0.02], [0, 1.04, sway_y - work_h * 0.01]])
                warped_hands = cv2.warpAffine(fg_hands_rgba, M_fg, (work_w, work_h), borderMode=cv2.BORDER_CONSTANT)
                h_bgr = cv2.GaussianBlur(warped_hands[:, :, :3], (7, 7), 1.8).astype(np.float32)
                h_a = (warped_hands[:, :, 3:4].astype(np.float32) / 255.0) * 0.95
                out_frame = np.clip(base.astype(np.float32) * (1.0 - h_a) + h_bgr * h_a, 0, 255).astype(np.uint8)
            else:
                out_frame = base

        elif effect == "motm_motion_echo":
            base = _bleach_bypass_selective(frame)
            subj_alpha = _extract_subject_alpha(frame)[:, :, None]
            echo_history.append((base.astype(np.float32), subj_alpha))
            canvas = base.astype(np.float32).copy()
            for tap_idx, (step, weight, shift_px) in enumerate(((5, 0.34, 138), (3, 0.48, 92), (1, 0.64, 46))):
                if len(echo_history) > step:
                    old_f, old_a = echo_history[-1 - step]
                    old_f_s = np.roll(old_f, shift_px, axis=1).copy()
                    old_f_s[:, :, 0] = np.clip(old_f_s[:, :, 0] * 1.18 + 22.0, 0, 255)
                    old_f_s[:, :, 1] = np.clip(old_f_s[:, :, 1] * 1.08 + 12.0, 0, 255)
                    old_a_s = np.roll(old_a, shift_px, axis=1) * weight
                    canvas = canvas * (1.0 - old_a_s) + old_f_s * old_a_s
            canvas = canvas * (1.0 - subj_alpha * 0.85) + base.astype(np.float32) * (subj_alpha * 0.85)
            out_frame = np.clip(canvas, 0, 255).astype(np.uint8)

        elif effect == "motm_ink_corrupt":
            base = _bleach_bypass_selective(frame)
            subj_alpha = _extract_subject_alpha(frame)
            luma = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)
            # Restrict ferrofluid ink strictly to the performer's central hoodie/jacket (never on bright background walls)
            central_hoodie = (xx > work_w * 0.24) & (xx < work_w * 0.68) & (yy > work_h * 0.18)
            cloth_mask = central_hoodie & (subj_alpha > 0.42) & (luma > 88.0) & (luma < 225.0)

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
                # Crisp optical star-filter diamond glint (compact core + razor-thin anamorphic rays)
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
            _, fcx, fcy, frad = _detect_performer_shield(frame)
            shoulder_x = int(fcx - frad * 1.32)
            shoulder_y = int(fcy + frad * 1.65)
            out_frame = _composite_rgba_eagle(base, eagle_rgba, shoulder_x, shoulder_y, scale=0.64, frame_idx=f_idx)

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
