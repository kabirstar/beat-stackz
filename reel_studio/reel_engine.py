#!/usr/bin/env python3
"""
Reel Studio Engine v2.1 — Clean Regular Cuts, Cinematic Slow-Mo & One-Cut-Per-Clip Storyboard
- Uses each uploaded clip ONCE (no duplicate clip reuse by default)
- Regular Frame-Accurate Cuts (`transition="none"` by default — zero fade-to-black flashes!)
- Over-reads source video by +0.5s before `setpts` slow-motion and trims exact `out_dur` at output
  so slow-motion segments never run out of video frames or flash black at cut boundaries.
"""

from __future__ import annotations

import concurrent.futures
import dataclasses
from dataclasses import dataclass, field, asdict
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple, Callable

import static_ffmpeg
static_ffmpeg.add_paths()

import cv2
import librosa
import numpy as np
from faster_whisper import WhisperModel
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter, ImageEnhance
from scipy import ndimage

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}

_WHISPER_MODEL: Optional[WhisperModel] = None
_WHISPER_LOCK = threading.Lock()

CLIP_PALETTE = [
    "#f59e0b", "#ff2a85", "#06b6d4", "#10b981",
    "#8b5cf6", "#ef4444", "#eab308", "#3b82f6",
    "#14b8a6", "#ec4899", "#f97316", "#a855f7",
]

SPEED_MULTIPLIERS = {
    "1.0x": 1.0,
    "0.70x": 0.70,
    "0.55x": 0.55,
    "speed_ramp": 0.72,
    "1.25x": 1.25,
}


def ensure_ffmpeg() -> Tuple[str, str]:
    ffmpeg_bin = shutil.which("ffmpeg")
    ffprobe_bin = shutil.which("ffprobe")
    if ffmpeg_bin and ffprobe_bin:
        return ffmpeg_bin, ffprobe_bin
    static_ffmpeg.add_paths()
    ffmpeg_bin = shutil.which("ffmpeg")
    ffprobe_bin = shutil.which("ffprobe")
    if ffmpeg_bin and ffprobe_bin:
        return ffmpeg_bin, ffprobe_bin
    raise RuntimeError("ffmpeg/ffprobe not found.")


def get_whisper_model(model_size: str = "base.en") -> WhisperModel:
    global _WHISPER_MODEL
    if _WHISPER_MODEL is None:
        with _WHISPER_LOCK:
            if _WHISPER_MODEL is None:
                _WHISPER_MODEL = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=4,
                    num_workers=4,
                )
    return _WHISPER_MODEL


@dataclass
class SpeechSegment:
    text: str
    start: float
    end: float


@dataclass
class EventClip:
    clip_id: str
    filename: str
    filepath: str
    proxy_url: str
    thumb_url: str
    duration: float
    width: int
    height: int
    fps: float
    orientation: str  # "vertical", "horizontal", "square"
    has_audio: bool
    visual_curve: List[float]      # 4Hz visual motion + sharpness score
    audio_curve: List[float]       # 4Hz native audio excitement score
    combined_curve: List[float]    # 4Hz combined highlight energy score
    mean_visual: float
    mean_audio: float
    peak_score: float
    best_in_sec: float             # Primary highlight start
    best_out_sec: float            # Primary highlight end
    transcript_text: str = ""
    speech_segments: List[SpeechSegment] = field(default_factory=list)
    color: str = "#f59e0b"
    media_type: str = "video"      # "video" or "photo"


@dataclass
class StoryboardItem:
    id: str
    index: int
    clip_id: str
    clip_filename: str
    clip_filepath: str
    proxy_url: str
    thumb_url: str
    clip_duration: float
    clip_orientation: str
    in_sec: float
    out_sec: float
    # Speed & Slow-Motion controls
    speed_mode: str = "1.0x"       # "1.0x", "0.70x", "0.55x", "speed_ramp", "1.25x"
    # Audio controls (Default: Native Clip Audio ON at 100% so music can be layered on top)
    volume_pct: int = 100          # 0% to 200%
    muted: bool = False
    audio_fade_sec: float = 0.06   # Micro de-click audio fade at regular cut boundaries
    # Framing & visual controls
    fit_mode: str = "auto"         # "auto", "cover" (center fill), "blur_pad" (blurred backdrop)
    effect: str = "cinematic_film" # "none", "cinematic_film", "warm_temple", "ken_burns_in", "ken_burns_out", "photo_parallax_in", "photo_reveal_out", "photo_pan_drift", "photo_polaroid_gold", "punch_zoom", "cinema_glow"
    transition: str = "none"       # Always "none" (regular clean cut) unless user picks otherwise
    # Text & Title Overlay controls
    overlay_text: str = ""
    overlay_subtext: str = ""
    overlay_position: str = "bottom"
    overlay_style: str = "temple_gold"
    overlay_size: str = "medium"
    overlay_timing: str = "full"
    # Metadata
    highlight_score: float = 1.0
    note_tag: str = "peak_highlight"
    media_type: str = "video"      # "video" or "photo"
    # Scrapbook Photo Pop-Up Overlay on top of Video
    scrapbook_photo_id: str = ""
    scrapbook_photo_filepath: str = ""
    scrapbook_photo_url: str = ""
    scrapbook_photo_filename: str = ""
    scrapbook_style: str = "polaroid_tape"  # "polaroid_tape", "gold_foil", "vintage_print"
    scrapbook_tilt_deg: float = -3.0
    scrapbook_timing: str = "pop_after_1s"  # "pop_after_1s", "pop_early", "full"
    scrapbook_scale_pct: int = 76


@dataclass
class ReelProject:
    project_id: str
    title: str = "Temple & Event Highlight Reel"
    subtitle: str = ""
    aspect_ratio: str = "9:16"     # "9:16" (1080x1920) or "16:9" (1920x1080)
    default_fit_mode: str = "blur_pad"
    highlight_mode: str = "instagram_cinematic"
    global_title: str = ""
    global_subtitle: str = ""
    global_banner_mode: str = "intro_only"
    bg_music_filename: str = ""
    bg_music_filepath: str = ""
    bg_music_url: str = ""
    bg_music_enabled: bool = False
    bg_music_volume_pct: int = 100
    bg_music_ducking: bool = False
    clips: List[EventClip] = field(default_factory=list)
    storyboard: List[StoryboardItem] = field(default_factory=list)
    version: int = 1


def is_photo_file(filepath: str) -> bool:
    return Path(filepath).suffix.lower() in IMAGE_EXTS


def normalize_photo_image(src_image: str, proxy_dir: Path, clip_id: str) -> Tuple[str, int, int, str]:
    """
    Normalizes any photo (.jpg, .jpeg, .png, .heic, .heif, .webp) into an upright
    RGB high-res JPEG master (fixing EXIF rotation and converting iPhone HEIC via sips if needed),
    plus returns (master_jpg_path, width, height, orientation).
    """
    proxy_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(src_image).suffix.lower()
    work_path = src_image

    if ext in (".heic", ".heif"):
        heic_conv = str(proxy_dir / f"heic_{clip_id}.jpg")
        subprocess.run(
            ["/usr/bin/sips", "-s", "format", "jpeg", src_image, "--out", heic_conv],
            capture_output=True,
            check=False,
        )
        if os.path.exists(heic_conv) and os.path.getsize(heic_conv) > 512:
            work_path = heic_conv

    img = Image.open(work_path)
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    w, h = img.size
    max_dim = 2560
    if max(w, h) > max_dim:
        scale = max_dim / float(max(w, h))
        w = max(2, int(round(w * scale)) // 2 * 2)
        h = max(2, int(round(h * scale)) // 2 * 2)
        img = img.resize((w, h), Image.Resampling.LANCZOS)
    else:
        w = max(2, (w // 2) * 2)
        h = max(2, (h // 2) * 2)
        if (w, h) != img.size:
            img = img.resize((w, h), Image.Resampling.LANCZOS)

    master_jpg = proxy_dir / f"photo_master_{clip_id}.jpg"
    img.save(str(master_jpg), "JPEG", quality=95)

    if h > w * 1.08:
        orientation = "vertical"
    elif w > h * 1.08:
        orientation = "horizontal"
    else:
        orientation = "square"

    return str(master_jpg), w, h, orientation


def prepare_photo_stage_image(
    src_jpg: str,
    out_jpg: str,
    target_w: int = 1080,
    target_h: int = 1920,
    fit_mode: str = "blur_pad",
    effect: str = "photo_parallax_in",
) -> str:
    """
    Composes a photo onto a target_w x target_h (e.g., 1080x1920 9:16) canvas:
    - If `fit_mode == "blur_pad"` or `effect == "photo_polaroid_gold"` or the photo's aspect ratio
      is wider than 9:16 (such as iPhone 3:4 portrait photos or horizontal photos), places the
      100% uncropped photo inside a rounded Sacred Temple Gold frame with a soft drop-shadow over a
      softly blurred, warm-tinted ambient backdrop so zero faces/garlands/murtis are cut off!
    - If `fit_mode == "cover"` and not `photo_polaroid_gold`, center-fills the canvas full-bleed.
    """
    img = Image.open(src_jpg).convert("RGB")
    iw, ih = img.size
    target_ratio = target_w / float(target_h)
    img_ratio = iw / float(ih)

    needs_framed_backdrop = (
        effect == "photo_polaroid_gold"
        or (fit_mode != "cover" and abs(img_ratio - target_ratio) > 0.08)
    )

    if not needs_framed_backdrop:
        # Full-bleed cover
        scale = max(target_w / float(iw), target_h / float(ih))
        nw, nh = int(round(iw * scale)), int(round(ih * scale))
        resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
        x0 = max(0, (nw - target_w) // 2)
        y0 = max(0, (nh - target_h) // 2)
        cropped = resized.crop((x0, y0, x0 + target_w, y0 + target_h))
        cropped.save(out_jpg, "JPEG", quality=95)
        return out_jpg

    # 1. Create softly blurred, warm-darkened ambient backdrop filling target_w x target_h
    bg_scale = max(target_w / float(iw), target_h / float(ih))
    bg_w, bg_h = int(round(iw * bg_scale)), int(round(ih * bg_scale))
    bg = img.resize((bg_w, bg_h), Image.Resampling.LANCZOS)
    bx0 = max(0, (bg_w - target_w) // 2)
    by0 = max(0, (bg_h - target_h) // 2)
    bg = bg.crop((bx0, by0, bx0 + target_w, by0 + target_h))
    bg = bg.filter(ImageFilter.GaussianBlur(radius=36))
    bg = ImageEnhance.Brightness(bg).enhance(0.55)
    bg = ImageEnhance.Color(bg).enhance(1.22)

    canvas = bg.convert("RGBA")

    # 2. Scale foreground photo so 100% of its width/height fits comfortably with a sleek margin
    max_fg_w = int(target_w * (0.91 if effect == "photo_polaroid_gold" else 0.95))
    max_fg_h = int(target_h * (0.82 if effect == "photo_polaroid_gold" else 0.88))
    fg_scale = min(max_fg_w / float(iw), max_fg_h / float(ih))
    fg_w = max(2, int(round(iw * fg_scale)))
    fg_h = max(2, int(round(ih * fg_scale)))
    fg = img.resize((fg_w, fg_h), Image.Resampling.LANCZOS).convert("RGBA")

    radius = int(28 * (target_w / 1080.0))
    mask = Image.new("L", (fg_w, fg_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, fg_w - 1, fg_h - 1], radius=radius, fill=255)

    fx = (target_w - fg_w) // 2
    fy = (target_h - fg_h) // 2

    # 3. Soft ambient drop shadow
    shadow_pad = 36
    sh_img = Image.new("RGBA", (fg_w + shadow_pad * 2, fg_h + shadow_pad * 2), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sh_img)
    sh_draw.rounded_rectangle(
        [shadow_pad, shadow_pad + 8, shadow_pad + fg_w, shadow_pad + fg_h + 8],
        radius=radius,
        fill=(0, 0, 0, 175),
    )
    sh_img = sh_img.filter(ImageFilter.GaussianBlur(radius=16))
    canvas.alpha_composite(sh_img, (fx - shadow_pad, fy - shadow_pad))

    # 4. Composite rounded foreground photo + Sacred Temple Gold border
    fg_rounded = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
    fg_rounded.paste(fg, (0, 0), mask)
    canvas.alpha_composite(fg_rounded, (fx, fy))

    border_draw = ImageDraw.Draw(canvas)
    border_w = max(2, int(4 * (target_w / 1080.0)) if effect == "photo_polaroid_gold" else int(2.5 * (target_w / 1080.0)))
    border_draw.rounded_rectangle(
        [fx, fy, fx + fg_w - 1, fy + fg_h - 1],
        radius=radius,
        outline=(245, 158, 11, 235),
        width=border_w,
    )

    canvas.convert("RGB").save(out_jpg, "JPEG", quality=95)
    return out_jpg


def ensure_photo_proxy_and_thumb(
    master_jpg: str,
    proxy_dir: Path,
    clip_id: str,
    duration: float = 6.0,
) -> Tuple[str, str]:
    """
    Generates a 6.0s 30fps 9:16 MP4 proxy from a photo so the Dual-Deck browser player
    can play, scrub, and transition between photos and videos with zero black flash!
    """
    ffmpeg_bin, _ = ensure_ffmpeg()
    proxy_dir.mkdir(parents=True, exist_ok=True)
    stat = os.stat(master_jpg)
    sig = hashlib.md5(f"{master_jpg}:{stat.st_size}:{stat.st_mtime}:v2".encode()).hexdigest()[:10]
    proxy_name = f"proxy_photo_{clip_id}_{sig}.mp4"
    proxy_path = proxy_dir / proxy_name

    thumb_name = f"thumb_photo_{clip_id}.jpg"
    thumb_path = proxy_dir / thumb_name
    if not thumb_path.exists():
        img = Image.open(master_jpg)
        img.thumbnail((540, 540), Image.Resampling.LANCZOS)
        img.save(str(thumb_path), "JPEG", quality=88)

    if proxy_path.exists() and proxy_path.stat().st_size > 1024:
        return proxy_name, thumb_name

    stage_916_jpg = str(proxy_dir / f"stage_photo_{clip_id}.jpg")
    prepare_photo_stage_image(master_jpg, stage_916_jpg, target_w=720, target_h=1280, fit_mode="blur_pad", effect="photo_parallax_in")

    vf = (
        "scale=806:1434,"
        f"crop=720:1280:x='(iw-ow)/2':y='(ih-oh)/2 - (ih-oh)*0.22*(t/{duration:.2f})',"
        "format=yuv420p"
    )
    cmd = [
        ffmpeg_bin, "-y",
        "-loop", "1",
        "-t", f"{duration:.2f}",
        "-i", stage_916_jpg,
        "-f", "lavfi", "-t", f"{duration:.2f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", vf,
        "-r", "30",
        "-c:v", "h264_videotoolbox",
        "-b:v", "2800k",
        "-g", "15",
        "-c:a", "aac",
        "-b:a", "96k",
        "-shortest",
        "-movflags", "+faststart",
        str(proxy_path),
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0 or not proxy_path.exists():
        sw_cmd = [
            ffmpeg_bin, "-y",
            "-loop", "1",
            "-t", f"{duration:.2f}",
            "-i", stage_916_jpg,
            "-f", "lavfi", "-t", f"{duration:.2f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", vf,
            "-r", "30",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "22",
            "-g", "15",
            "-c:a", "aac",
            "-b:a", "96k",
            "-shortest",
            "-movflags", "+faststart",
            str(proxy_path),
        ]
        subprocess.run(sw_cmd, capture_output=True, check=True)

    return proxy_name, thumb_name


def get_effective_segment_duration(item: StoryboardItem) -> float:
    src_dur = max(0.25, float(item.out_sec - item.in_sec))
    mult = SPEED_MULTIPLIERS.get(item.speed_mode or "1.0x", 1.0)
    return round(src_dur / mult, 3)


def probe_video(filepath: str) -> Dict[str, Any]:
    _, ffprobe_bin = ensure_ffmpeg()
    width, height = 1920, 1080
    fps = 30.0
    duration = 0.0
    has_audio = False
    rotation = 0

    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration:stream=index,codec_type,width,height,r_frame_rate,tags:stream_side_data=rotation",
            "-of", "json",
            filepath,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode == 0:
            info = json.loads(res.stdout)
            fmt_dur = float(info.get("format", {}).get("duration", 0) or 0)
            if fmt_dur > 0:
                duration = fmt_dur

            for st in info.get("streams", []):
                ctype = st.get("codec_type")
                if ctype == "video":
                    w = int(st.get("width") or 0)
                    h = int(st.get("height") or 0)
                    if w > 0 and h > 0:
                        width, height = w, h
                    r_fps = st.get("r_frame_rate", "30/1")
                    if "/" in str(r_fps):
                        num, den = str(r_fps).split("/", 1)
                        if float(den) > 0:
                            fps = float(num) / float(den)
                    elif r_fps:
                        fps = float(r_fps)

                    tags = st.get("tags") or {}
                    if "rotate" in tags:
                        try:
                            rotation = int(float(tags["rotate"]))
                        except Exception:
                            pass
                    for sd in st.get("side_data_list") or []:
                        if "rotation" in sd:
                            try:
                                rotation = int(float(sd["rotation"]))
                            except Exception:
                                pass
                elif ctype == "audio":
                    has_audio = True
    except Exception:
        pass

    if duration <= 0:
        cap = cv2.VideoCapture(filepath)
        if cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or width)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or height)
            if fps > 0 and frame_count > 0:
                duration = frame_count / fps
            cap.release()

    if abs(rotation) in (90, 270):
        width, height = height, width

    if height > width * 1.08:
        orientation = "vertical"
    elif width > height * 1.08:
        orientation = "horizontal"
    else:
        orientation = "square"

    return {
        "duration": max(0.1, float(duration)),
        "width": int(width),
        "height": int(height),
        "fps": float(min(60.0, max(15.0, fps))),
        "orientation": orientation,
        "has_audio": bool(has_audio),
    }


def ensure_browser_proxy(src_video: str, proxy_dir: Path, clip_id: str, has_audio: bool = True) -> str:
    ffmpeg_bin, _ = ensure_ffmpeg()
    proxy_dir.mkdir(parents=True, exist_ok=True)
    stat = os.stat(src_video)
    sig = hashlib.md5(f"{src_video}:{stat.st_size}:{stat.st_mtime}".encode()).hexdigest()[:10]
    out_name = f"proxy_{clip_id}_{sig}.mp4"
    out_path = proxy_dir / out_name

    if out_path.exists() and out_path.stat().st_size > 1024:
        return out_name

    vf = "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)',format=yuv420p"

    if has_audio:
        hw_cmd = [
            ffmpeg_bin, "-y",
            "-i", src_video,
            "-vf", vf,
            "-c:v", "h264_videotoolbox",
            "-b:v", "2800k",
            "-g", "15",
            "-c:a", "aac",
            "-b:a", "160k",
            "-ac", "2",
            "-ar", "44100",
            "-movflags", "+faststart",
            str(out_path),
        ]
    else:
        hw_cmd = [
            ffmpeg_bin, "-y",
            "-i", src_video,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", vf,
            "-c:v", "h264_videotoolbox",
            "-b:v", "2800k",
            "-g", "15",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            "-movflags", "+faststart",
            str(out_path),
        ]

    res = subprocess.run(hw_cmd, capture_output=True)
    if res.returncode == 0 and out_path.exists() and out_path.stat().st_size > 1024:
        return out_name

    sw_cmd = [
        ffmpeg_bin, "-y",
        "-i", src_video,
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "24",
        "-g", "15",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        str(out_path),
    ]
    subprocess.run(sw_cmd, capture_output=True, check=True)
    return out_name


def ensure_clip_thumbnail(src_video: str, proxy_dir: Path, clip_id: str, timestamp_sec: float) -> str:
    ffmpeg_bin, _ = ensure_ffmpeg()
    proxy_dir.mkdir(parents=True, exist_ok=True)
    ts_tag = int(round(timestamp_sec * 10))
    out_name = f"thumb_{clip_id}_{ts_tag}.jpg"
    out_path = proxy_dir / out_name
    if out_path.exists() and out_path.stat().st_size > 512:
        return out_name

    cmd = [
        ffmpeg_bin, "-y",
        "-ss", f"{max(0.0, timestamp_sec):.3f}",
        "-i", src_video,
        "-frames:v", "1",
        "-vf", "scale='if(gt(iw,ih),480,-2)':'if(gt(iw,ih),-2,480)',format=yuvj420p",
        "-q:v", "4",
        str(out_path),
    ]
    subprocess.run(cmd, capture_output=True, check=False)
    return out_name


def extract_audio_to_wav(media_path: str, out_wav: str, sr: int = 16000) -> bool:
    ffmpeg_bin, _ = ensure_ffmpeg()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", media_path,
        "-vn",
        "-ac", "1",
        "-ar", str(sr),
        "-f", "wav",
        out_wav,
    ]
    res = subprocess.run(cmd, capture_output=True, check=False)
    return res.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1024


def analyze_video_visuals_4hz(filepath: str, duration: float, sample_hz: float = 4.0) -> List[float]:
    if duration <= 0:
        return [1.0]

    ffmpeg_bin, _ = ensure_ffmpeg()
    w, h = 160, 90
    frame_bytes = w * h

    cmd = [
        ffmpeg_bin,
        "-v", "error",
        "-i", filepath,
        "-vf", f"fps={sample_hz},scale={w}:{h}",
        "-f", "rawvideo",
        "-pix_fmt", "gray",
        "-",
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, check=False)
        raw = res.stdout
        n_frames = len(raw) // frame_bytes
        if n_frames < 1:
            return [1.0]

        frames = np.frombuffer(raw[: n_frames * frame_bytes], dtype=np.uint8).reshape((n_frames, h, w))
        energy_curve: List[float] = []
        prev_gray = None

        # Precompute center crop bounds (focus on the subject in the middle 70% of the frame)
        cy0, cy1 = int(h * 0.15), int(h * 0.85)
        cx0, cx1 = int(w * 0.15), int(w * 0.85)

        raw_sharp = []
        raw_diff = []
        raw_contrast = []
        for idx in range(n_frames):
            gray = frames[idx]
            center = gray[cy0:cy1, cx0:cx1]
            sh_val = float(cv2.Laplacian(center, cv2.CV_64F).var())
            ct_val = float(np.std(center))
            if prev_gray is not None:
                df_val = float(np.mean(cv2.absdiff(gray, prev_gray)))
            else:
                df_val = 4.0
            prev_gray = gray
            raw_sharp.append(sh_val)
            raw_diff.append(df_val)
            raw_contrast.append(ct_val)

        med_sharp = float(np.median(raw_sharp)) + 1e-5
        p85_sharp = float(np.percentile(raw_sharp, 85)) + 1e-5

        for idx in range(n_frames):
            sh_val = raw_sharp[idx]
            df_val = raw_diff[idx]
            ct_val = raw_contrast[idx]

            # 1. Subject Focus / Sharpness score (normalized to clip's own optical clarity)
            sharp_score = min(sh_val / max(180.0, p85_sharp * 0.85), 1.65)
            contrast_score = min(ct_val / 52.0, 1.35)

            # 2. Purposeful Ceremonial Action vs. Whip-Pan / Camera-Shake Penalty:
            # Sweet spot for human/ritual motion at 4Hz is diff in [2.5 .. 13.5].
            # If diff > 16.0 (camera jerk / walking blur / putting phone down), penalize heavily!
            if df_val <= 13.5:
                motion_score = 0.45 + 0.95 * (df_val / 13.5)
            else:
                whip_excess = (df_val - 13.5) / 12.0
                motion_score = max(0.15, 1.40 - 0.95 * whip_excess)

            # If frame is motion-blurred compared to the rest of the clip, penalize
            blur_penalty = 1.0 if sh_val >= med_sharp * 0.68 else 0.55

            score = blur_penalty * (0.46 * sharp_score + 0.36 * motion_score + 0.18 * contrast_score)
            energy_curve.append(round(float(score), 4))

        return energy_curve if energy_curve else [1.0]
    except Exception:
        return [1.0]


def analyze_audio_excitement_4hz(wav_path: str, duration: float, sr: int = 16000, sample_hz: float = 4.0) -> List[float]:
    n_bins = max(1, int(math.ceil(duration * sample_hz)))
    if not os.path.exists(wav_path):
        return [0.5] * n_bins

    try:
        y, _ = librosa.load(wav_path, sr=sr, mono=True)
        if len(y) < sr * 0.15:
            return [0.5] * n_bins

        hop_length = int(sr / sample_hz)
        rms = librosa.feature.rms(y=y, frame_length=hop_length * 2, hop_length=hop_length)[0]
        p95 = float(np.percentile(rms, 95)) + 1e-6
        rms_norm = np.clip(rms / p95, 0.0, 1.8)

        fine_hop = 512
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=fine_hop)
        onset_p95 = float(np.percentile(onset_env, 95)) + 1e-6
        onset_norm = np.clip(onset_env / onset_p95, 0.0, 2.0)

        curve: List[float] = []
        for i in range(n_bins):
            r_val = float(rms_norm[min(i, len(rms_norm) - 1)]) if len(rms_norm) > 0 else 0.5
            t0 = i / sample_hz
            t1 = (i + 1) / sample_hz
            f0 = int(t0 * sr / fine_hop)
            f1 = max(f0 + 1, int(t1 * sr / fine_hop))
            o_slice = onset_norm[f0:min(f1, len(onset_norm))]
            o_val = float(np.mean(o_slice)) if len(o_slice) > 0 else 0.4
            combined_a = 0.58 * r_val + 0.42 * o_val
            curve.append(round(float(combined_a), 4))

        return curve if curve else [0.5] * n_bins
    except Exception:
        return [0.5] * n_bins


def transcribe_clip_speech(wav_path: str) -> Tuple[str, List[SpeechSegment]]:
    if not os.path.exists(wav_path):
        return "", []
    try:
        model = get_whisper_model("base.en")
        segments_gen, _ = model.transcribe(
            wav_path,
            word_timestamps=False,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=350),
            condition_on_previous_text=False,
        )
        segs: List[SpeechSegment] = []
        texts: List[str] = []
        for s in segments_gen:
            txt = (s.text or "").strip()
            if len(txt) >= 2:
                segs.append(
                    SpeechSegment(
                        text=txt,
                        start=round(float(s.start), 2),
                        end=round(float(s.end), 2),
                    )
                )
                texts.append(txt)
        full_text = " ".join(texts).strip()
        return full_text, segs
    except Exception:
        return "", []


def suggest_highlight_window(
    duration: float,
    combined_curve: List[float],
    speech_segments: List[SpeechSegment],
    mode: str = "dynamic_35",
    sample_hz: float = 4.0,
) -> Tuple[float, float, float, str]:
    if duration <= 1.2 or mode == "full":
        mean_s = float(np.mean(combined_curve)) if combined_curve else 1.0
        return 0.0, round(duration, 2), round(mean_s, 3), "full_clip"

    if mode == "speech_aware" and speech_segments:
        best_sp = max(speech_segments, key=lambda s: (s.end - s.start))
        s_in = max(0.0, best_sp.start - 0.25)
        s_out = min(duration, max(s_in + 2.2, best_sp.end + 0.35))
        if s_out - s_in > 7.5:
            s_out = s_in + 7.5
        i0 = max(0, int(s_in * sample_hz))
        i1 = max(i0 + 1, int(math.ceil(s_out * sample_hz)))
        sub = combined_curve[i0:min(i1, len(combined_curve))]
        score = float(np.mean(sub)) if sub else 1.0
        return round(s_in, 2), round(s_out, 2), round(score, 3), "spoken_moment"

    target_map = {
        "fast_25": 2.5,
        "instagram_cinematic": 3.4,
        "dynamic_35": 3.5,
        "cinematic_50": 5.0,
        "speech_aware": 3.5,
    }
    target_dur = target_map.get(mode, 3.5)

    if duration <= target_dur + 0.35:
        pad = 0.1 if duration > 1.8 else 0.0
        mean_s = float(np.mean(combined_curve)) if combined_curve else 1.0
        return round(pad, 2), round(duration - pad, 2), round(mean_s, 3), "peak_highlight"

    # Guard against phone-raise at the very start and phone-lower at the very end of recording
    if duration > 15.0:
        start_guard = max(1.4, min(6.0, duration * 0.08))
        end_guard = max(1.8, min(6.0, duration * 0.06))
    elif duration > target_dur + 1.2:
        start_guard = 0.6
        end_guard = 0.8
    else:
        start_guard = 0.2
        end_guard = 0.2

    min_in = start_guard
    max_in = max(min_in, duration - end_guard - target_dur)

    best_in = min_in
    best_score = -1.0
    step = 1.0 / sample_hz
    t = min_in
    while t <= max_in + 0.01:
        i0 = max(0, int(round(t * sample_hz)))
        i1 = max(i0 + 1, int(round((t + target_dur) * sample_hz)))
        sub = combined_curve[i0:min(i1, len(combined_curve))]
        if sub:
            arr = np.asarray(sub, dtype=np.float32)
            # Reward sustained clarity & action while penalizing erratic spikes/drops inside the cut
            w_score = 0.64 * float(np.mean(arr)) + 0.22 * float(np.percentile(arr, 25)) + 0.14 * float(np.max(arr)) - 0.18 * float(np.std(arr))
        else:
            w_score = 0.5
        if w_score > best_score:
            best_score = w_score
            best_in = t
        t += step

    best_out = min(duration, best_in + target_dur)
    return round(best_in, 2), round(best_out, 2), round(max(0.1, best_score), 3), "peak_highlight"


def build_cinematic_instagram_storyboard(
    clips: List[EventClip],
    proxy_dir: Path,
    mode: str = "instagram_cinematic",
    default_fit_mode: str = "blur_pad",
) -> List[StoryboardItem]:
    """
    Builds a Cinematic Instagram Storyboard where:
    - Each video clip is used ONCE (no duplicate clips) with 100% regular clean cuts (`transition="none"`).
    - Uploaded still photos (`photo_clips`) flash/pop up ON TOP of the playing video cuts like
      physical Scrapbook / Polaroid prints (`scrapbook_photo_id`, warm ivory Polaroid border,
      gold washi tape, 3D drop shadow, organic tilt angle, and camera shutter pop)!
    - All cuts default to `muted=True, volume_pct=0` for a Balaji song over the entire reel.
    """
    if not clips:
        return []

    video_clips = [c for c in clips if getattr(c, "media_type", "video") != "photo"]
    photo_clips = [c for c in clips if getattr(c, "media_type", "video") == "photo"]

    if not video_clips:
        video_clips = list(photo_clips)
        photo_clips = []

    n_v = len(video_clips)
    n_p = len(photo_clips)

    # Map each photo to a video cut index so photos flash up on top of the playing videos!
    # E.g. for 5 videos and 3 photos -> attach photos to video cuts #0 (or #1), #2, #4
    photo_by_v_idx: Dict[int, EventClip] = {}
    if n_p > 0 and n_v > 0:
        if n_p == 3 and n_v >= 5:
            target_v_indices = [0, 2, n_v - 1]
        else:
            target_v_indices = [
                min(n_v - 1, int(round(i * (n_v - 1) / float(max(1, n_p - 1)))))
                for i in range(min(n_p, n_v))
            ]
        for p_i, v_i in enumerate(target_v_indices):
            if p_i < n_p:
                photo_by_v_idx[v_i] = photo_clips[p_i]

    tilt_angles = [-3.2, 2.8, -1.8, 3.0, -2.5]
    scrap_styles = ["polaroid_tape", "polaroid_tape", "gold_foil"]
    sb_items: List[StoryboardItem] = []

    for idx, clip in enumerate(video_clips):
        is_photo = getattr(clip, "media_type", "video") == "photo"
        in_s, out_s, h_score, note_tag = suggest_highlight_window(
            duration=clip.duration,
            combined_curve=clip.combined_curve,
            speech_segments=clip.speech_segments,
            mode=mode,
        )
        base_dur = out_s - in_s

        attached_photo = photo_by_v_idx.get(idx)
        min_needed_dur = 3.5 if attached_photo else 2.8

        if mode == "full":
            speed_mode = "1.0x"
            effect = "cinematic_film"
        elif idx == 0:
            speed_mode = "speed_ramp"
            out_s = round(min(clip.duration - 0.1, in_s + max(min_needed_dur, min(base_dur, 3.2))), 2)
            effect = "cinematic_film"
            note_tag = "hook_scrapbook" if attached_photo else "hook_shot"
        elif idx % 2 == 1:
            speed_mode = "0.70x"
            out_s = round(min(clip.duration - 0.1, in_s + max(2.7, min(base_dur, 2.8))), 2)
            effect = "warm_temple"
            note_tag = "slowmo_hero"
        else:
            speed_mode = "1.0x"
            out_s = round(min(clip.duration - 0.1, in_s + max(min_needed_dur, min(base_dur, 3.8))), 2)
            effect = "ken_burns_in"
            note_tag = "scrapbook_popup" if attached_photo else "peak_highlight"

        mid_t = 0.5 * (in_s + out_s)
        th_name = ensure_clip_thumbnail(clip.filepath, proxy_dir, clip.clip_id, mid_t)
        th_url = f"/proxies/{th_name}"

        sb_items.append(
            StoryboardItem(
                id=f"sb_{int(time.time() * 1000)}_{idx}_{clip.clip_id[-4:]}",
                index=idx,
                clip_id=clip.clip_id,
                clip_filename=clip.filename,
                clip_filepath=clip.filepath,
                proxy_url=clip.proxy_url,
                thumb_url=th_url,
                clip_duration=clip.duration,
                clip_orientation=clip.orientation,
                in_sec=in_s,
                out_sec=out_s,
                speed_mode=speed_mode,
                volume_pct=100,     # Native clip audio ON by default so music can be layered on top
                muted=False,
                audio_fade_sec=0.06,
                fit_mode=default_fit_mode,
                effect=effect,
                transition="none",  # Always clean regular cuts (zero black flashes!)
                overlay_text="",
                overlay_subtext="",
                overlay_position="bottom",
                overlay_style="temple_gold",
                overlay_size="medium",
                overlay_timing="full",
                highlight_score=h_score,
                note_tag=note_tag,
                media_type="photo" if is_photo else "video",
                scrapbook_photo_id=attached_photo.clip_id if attached_photo else "",
                scrapbook_photo_filepath=attached_photo.filepath if attached_photo else "",
                scrapbook_photo_url=attached_photo.thumb_url if attached_photo else "",
                scrapbook_photo_filename=attached_photo.filename if attached_photo else "",
                scrapbook_style=scrap_styles[idx % len(scrap_styles)],
                scrapbook_tilt_deg=tilt_angles[idx % len(tilt_angles)],
                scrapbook_timing="pop_after_1s",
                scrapbook_scale_pct=78,
            )
        )

    return sb_items


def analyze_single_event_clip(
    cpath: str,
    clip_id: str,
    color: str,
    proxy_dir: Path,
    highlight_mode: str = "instagram_cinematic",
    transcribe: bool = False,
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> EventClip:
    # Handle Still Photos (.jpg, .jpeg, .png, .heic, .webp) natively!
    if is_photo_file(cpath):
        if progress_cb:
            progress_cb("📸 Normalizing high-res photo orientation & generating 6.0s Motion Proxy...", 35)
        master_jpg, w, h, orientation = normalize_photo_image(cpath, proxy_dir, clip_id)
        proxy_name, thumb_name = ensure_photo_proxy_and_thumb(master_jpg, proxy_dir, clip_id, duration=6.0)
        if progress_cb:
            progress_cb("✅ Photo Ready — 2.3s Living Photo Motion Cut", 100)
        return EventClip(
            clip_id=clip_id,
            filename=os.path.basename(cpath),
            filepath=master_jpg,
            proxy_url=f"/proxies/{proxy_name}",
            thumb_url=f"/proxies/{thumb_name}",
            duration=6.0,
            width=w,
            height=h,
            fps=30.0,
            orientation=orientation,
            has_audio=False,
            visual_curve=[1.15] * 24,
            audio_curve=[0.0] * 24,
            combined_curve=[1.15] * 24,
            mean_visual=1.15,
            mean_audio=0.0,
            peak_score=1.15,
            best_in_sec=0.0,
            best_out_sec=2.3,
            transcript_text="",
            speech_segments=[],
            color=color,
            media_type="photo",
        )

    if progress_cb:
        progress_cb("🔍 Probing video resolution & orientation...", 12)

    meta = probe_video(cpath)
    duration = meta["duration"]
    has_audio = meta["has_audio"]

    with tempfile.TemporaryDirectory(prefix=f"reel_clip_{clip_id}_") as tmpdir:
        wav_tmp = os.path.join(tmpdir, f"{clip_id}.wav")

        if progress_cb:
            progress_cb("⚡ Hardware Proxy (VideoToolbox) + 4Hz Visual Motion Scoring...", 45)

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            fut_proxy = pool.submit(ensure_browser_proxy, cpath, proxy_dir, clip_id, has_audio)
            fut_vis = pool.submit(analyze_video_visuals_4hz, cpath, duration, 4.0)
            fut_wav = pool.submit(extract_audio_to_wav, cpath, wav_tmp, 16000) if has_audio else None

            proxy_name = fut_proxy.result()
            visual_curve = fut_vis.result()
            wav_ok = fut_wav.result() if fut_wav else False

        if wav_ok:
            audio_curve = analyze_audio_excitement_4hz(wav_tmp, duration, sr=16000, sample_hz=4.0)
            if transcribe:
                transcript_text, speech_segments = transcribe_clip_speech(wav_tmp)
            else:
                transcript_text, speech_segments = "", []
        else:
            audio_curve = [0.4] * len(visual_curve)
            transcript_text, speech_segments = "", []

    n_len = max(len(visual_curve), len(audio_curve), 1)
    if len(visual_curve) < n_len:
        visual_curve = visual_curve + [visual_curve[-1]] * (n_len - len(visual_curve))
    if len(audio_curve) < n_len:
        audio_curve = audio_curve + [audio_curve[-1]] * (n_len - len(audio_curve))

    combined_curve = [
        round(0.65 * float(v) + 0.35 * float(a), 4)
        for v, a in zip(visual_curve[:n_len], audio_curve[:n_len])
    ]
    if len(combined_curve) >= 3:
        smoothed = ndimage.uniform_filter1d(np.array(combined_curve, dtype=np.float32), size=3)
        combined_curve = [round(float(x), 4) for x in smoothed]

    best_in, best_out, peak_score, _ = suggest_highlight_window(
        duration=duration,
        combined_curve=combined_curve,
        speech_segments=speech_segments,
        mode=highlight_mode,
    )

    thumb_ts = 0.5 * (best_in + best_out)
    thumb_name = ensure_clip_thumbnail(cpath, proxy_dir, clip_id, thumb_ts)

    if progress_cb:
        progress_cb(f"✅ Ready — Best Highlight {best_in:.1f}s–{best_out:.1f}s", 100)

    return EventClip(
        clip_id=clip_id,
        filename=os.path.basename(cpath),
        filepath=cpath,
        proxy_url=f"/proxies/{proxy_name}",
        thumb_url=f"/proxies/{thumb_name}",
        duration=round(duration, 3),
        width=meta["width"],
        height=meta["height"],
        fps=round(meta["fps"], 2),
        orientation=meta["orientation"],
        has_audio=has_audio,
        visual_curve=visual_curve[:n_len],
        audio_curve=audio_curve[:n_len],
        combined_curve=combined_curve[:n_len],
        mean_visual=round(float(np.mean(visual_curve)), 3),
        mean_audio=round(float(np.mean(audio_curve)), 3),
        peak_score=round(float(peak_score), 3),
        best_in_sec=best_in,
        best_out_sec=best_out,
        transcript_text=transcript_text,
        speech_segments=speech_segments,
        color=color,
        media_type="video",
    )


def make_storyboard_item_from_clip(
    clip: EventClip,
    index: int,
    highlight_mode: str = "instagram_cinematic",
    default_fit_mode: str = "blur_pad",
) -> StoryboardItem:
    is_photo = getattr(clip, "media_type", "video") == "photo"
    if is_photo:
        in_s, out_s, h_score, note_tag = 0.0, 2.3, 1.15, "living_photo"
        effect = "photo_parallax_in"
    else:
        in_s, out_s, h_score, note_tag = suggest_highlight_window(
            duration=clip.duration,
            combined_curve=clip.combined_curve,
            speech_segments=clip.speech_segments,
            mode=highlight_mode,
        )
        effect = "cinematic_film"

    return StoryboardItem(
        id=f"sb_{int(time.time() * 1000)}_{index}_{clip.clip_id[-4:]}",
        index=index,
        clip_id=clip.clip_id,
        clip_filename=clip.filename,
        clip_filepath=clip.filepath,
        proxy_url=clip.proxy_url,
        thumb_url=clip.thumb_url,
        clip_duration=clip.duration,
        clip_orientation=clip.orientation,
        in_sec=in_s,
        out_sec=out_s,
        speed_mode="1.0x",
        volume_pct=0,
        muted=True,
        audio_fade_sec=0.06,
        fit_mode=default_fit_mode,
        effect=effect,
        transition="none",
        overlay_text="",
        overlay_subtext="",
        overlay_position="bottom",
        overlay_style="temple_gold",
        overlay_size="medium",
        overlay_timing="full",
        highlight_score=h_score,
        note_tag=note_tag,
        media_type="photo" if is_photo else "video",
    )


def _load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/System/Library/Fonts/Avenir Next.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
        if bold
        else [
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/System/Library/Fonts/Avenir Next.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
    )
    for fp in candidates:
        if os.path.exists(fp):
            try:
                return ImageFont.truetype(fp, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def render_text_overlay_png(
    output_png: str,
    target_w: int,
    target_h: int,
    primary_text: str,
    sub_text: str = "",
    position: str = "bottom",
    style: str = "temple_gold",
    size_preset: str = "medium",
    global_title: str = "",
    global_subtitle: str = "",
) -> bool:
    primary_text = (primary_text or "").strip()
    sub_text = (sub_text or "").strip()
    global_title = (global_title or "").strip()
    global_subtitle = (global_subtitle or "").strip()

    if not primary_text and not sub_text and not global_title and not global_subtitle:
        return False

    img = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    is_vertical = target_h > target_w
    scale_factor = (target_w / 1080.0) if is_vertical else (target_h / 1080.0)

    if global_title or global_subtitle:
        g_font_main = _load_font(int(30 * scale_factor), bold=True)
        g_font_sub = _load_font(int(21 * scale_factor), bold=False)

        g_main_bbox = draw.textbbox((0, 0), global_title, font=g_font_main) if global_title else (0, 0, 0, 0)
        g_sub_bbox = draw.textbbox((0, 0), global_subtitle, font=g_font_sub) if global_subtitle else (0, 0, 0, 0)

        gw = max(g_main_bbox[2] - g_main_bbox[0], g_sub_bbox[2] - g_sub_bbox[0]) + int(48 * scale_factor)
        gh = (g_main_bbox[3] - g_main_bbox[1]) + (
            (g_sub_bbox[3] - g_sub_bbox[1] + int(8 * scale_factor)) if global_subtitle else 0
        ) + int(28 * scale_factor)

        gx = int(42 * scale_factor)
        gy = int(56 * scale_factor) if is_vertical else int(38 * scale_factor)

        draw.rounded_rectangle(
            [gx, gy, gx + gw, gy + gh],
            radius=int(18 * scale_factor),
            fill=(15, 12, 18, 205),
            outline=(245, 158, 11, 210),
            width=max(2, int(2 * scale_factor)),
        )
        ty = gy + int(12 * scale_factor)
        if global_title:
            draw.text((gx + int(24 * scale_factor), ty), global_title, font=g_font_main, fill=(254, 243, 199, 255))
            ty += (g_main_bbox[3] - g_main_bbox[1]) + int(6 * scale_factor)
        if global_subtitle:
            draw.text((gx + int(24 * scale_factor), ty), global_subtitle, font=g_font_sub, fill=(251, 191, 36, 235))

    if primary_text or sub_text:
        size_mult = {"small": 0.82, "medium": 1.0, "large": 1.24}.get(size_preset, 1.0)
        main_px = int(46 * scale_factor * size_mult)
        sub_px = int(28 * scale_factor * size_mult)

        font_main = _load_font(main_px, bold=True)
        font_sub = _load_font(sub_px, bold=False)

        m_bbox = draw.textbbox((0, 0), primary_text, font=font_main) if primary_text else (0, 0, 0, 0)
        s_bbox = draw.textbbox((0, 0), sub_text, font=font_sub) if sub_text else (0, 0, 0, 0)

        mw, mh = m_bbox[2] - m_bbox[0], m_bbox[3] - m_bbox[1]
        sw, sh = s_bbox[2] - s_bbox[0], s_bbox[3] - s_bbox[1]

        pad_x = int(44 * scale_factor)
        pad_y = int(24 * scale_factor)
        gap_y = int(10 * scale_factor) if (primary_text and sub_text) else 0

        box_w = max(mw, sw) + pad_x * 2
        box_h = mh + sh + gap_y + pad_y * 2

        cx = target_w // 2
        box_x0 = cx - box_w // 2
        box_x1 = cx + box_w // 2

        if position == "top":
            box_y0 = int(target_h * 0.12)
        elif position == "center":
            box_y0 = (target_h - box_h) // 2
        else:
            bottom_margin = int(target_h * 0.14) if is_vertical else int(target_h * 0.10)
            box_y0 = target_h - bottom_margin - box_h

        box_y1 = box_y0 + box_h

        if style == "temple_gold":
            draw.rounded_rectangle(
                [box_x0, box_y0 + 4, box_x1, box_y1 + 4],
                radius=int(24 * scale_factor),
                fill=(0, 0, 0, 110),
            )
            draw.rounded_rectangle(
                [box_x0, box_y0, box_x1, box_y1],
                radius=int(24 * scale_factor),
                fill=(28, 12, 18, 228),
                outline=(245, 158, 11, 245),
                width=max(2, int(3 * scale_factor)),
            )
            main_color = (255, 251, 235, 255)
            sub_color = (251, 191, 36, 255)

        elif style == "editorial_box":
            draw.rounded_rectangle(
                [box_x0, box_y0 + 5, box_x1, box_y1 + 5],
                radius=int(18 * scale_factor),
                fill=(0, 0, 0, 120),
            )
            draw.rounded_rectangle(
                [box_x0, box_y0, box_x1, box_y1],
                radius=int(18 * scale_factor),
                fill=(254, 249, 238, 242),
                outline=(217, 119, 6, 255),
                width=max(2, int(3 * scale_factor)),
            )
            main_color = (24, 18, 16, 255)
            sub_color = (180, 83, 9, 255)

        elif style == "minimal_glow":
            main_color = (255, 255, 255, 255)
            sub_color = (253, 224, 71, 255)
        else:
            draw.rounded_rectangle(
                [box_x0, box_y0, box_x1, box_y1],
                radius=int(26 * scale_factor),
                fill=(12, 12, 18, 215),
                outline=(255, 255, 255, 65),
                width=max(1, int(2 * scale_factor)),
            )
            main_color = (255, 255, 255, 255)
            sub_color = (165, 243, 252, 245)

        cur_y = box_y0 + pad_y
        if primary_text:
            tx = cx - mw // 2
            if style == "minimal_glow":
                for dx, dy in [(-2, 2), (2, 2), (0, 4), (0, -2)]:
                    draw.text((tx + dx, cur_y + dy), primary_text, font=font_main, fill=(0, 0, 0, 210))
            draw.text((tx, cur_y), primary_text, font=font_main, fill=main_color)
            cur_y += mh + gap_y

        if sub_text:
            sx = cx - sw // 2
            if style == "minimal_glow":
                for dx, dy in [(-2, 2), (2, 2), (0, 3)]:
                    draw.text((sx + dx, cur_y + dy), sub_text, font=font_sub, fill=(0, 0, 0, 210))
            draw.text((sx, cur_y), sub_text, font=font_sub, fill=sub_color)

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    img.save(output_png, "PNG")
    return True


def render_scrapbook_photo_overlay_png(
    photo_path: str,
    output_png: str,
    target_w: int = 1080,
    target_h: int = 1920,
    tilt_deg: float = -3.0,
    scale_pct: int = 78,
    style: str = "polaroid_tape",
) -> bool:
    """
    Renders a transparent RGBA 1080x1920 Scrapbook / Polaroid print overlay so a still photo
    can flash/pop up ON TOP of the playing video clip:
      - Uncropped photo framed in a warm ivory Polaroid paper border (`polaroid_tape`),
        sacred crimson & gold foil card (`gold_foil`), or vintage deckle print (`vintage_print`)
      - Semi-transparent golden-amber washi tape strip pinning the top center of the print
      - Deep 3D ambient drop shadow so the print floats above the moving background video
      - Rotated with bicubic anti-aliasing at `tilt_deg` (-3.2°, +2.8°, -1.8°, etc.)
    """
    if not photo_path or not os.path.exists(photo_path):
        return False

    src = Image.open(photo_path)
    src = ImageOps.exif_transpose(src).convert("RGB")
    iw, ih = src.size

    scale_factor = (target_w / 1080.0) if target_h >= target_w else (target_h / 1080.0)
    pct = max(50, min(88, int(scale_pct or 78))) / 100.0
    max_photo_w = int(target_w * pct)
    max_photo_h = int(target_h * (pct * 0.76))

    fit_s = min(max_photo_w / float(iw), max_photo_h / float(ih))
    pw = max(2, int(round(iw * fit_s)))
    ph = max(2, int(round(ih * fit_s)))
    photo_img = src.resize((pw, ph), Image.Resampling.LANCZOS).convert("RGBA")

    pad_side = int(26 * scale_factor)
    pad_top = int(26 * scale_factor)
    pad_bottom = int(38 * scale_factor)

    card_w = pw + pad_side * 2
    card_h = ph + pad_top + pad_bottom

    if style == "gold_foil":
        paper_fill = (32, 14, 20, 252)
        border_col = (245, 158, 11, 255)
        inner_col = (251, 191, 36, 220)
    elif style == "vintage_print":
        paper_fill = (245, 236, 218, 252)
        border_col = (180, 140, 85, 240)
        inner_col = (140, 105, 65, 160)
    else:
        # Default "polaroid_tape": Warm Ivory Polaroid print + Gold Washi Tape (100% clean, no text/ornaments)
        paper_fill = (252, 248, 240, 254)
        border_col = (226, 214, 192, 255)
        inner_col = (217, 119, 6, 130)

    tape_margin_top = int(26 * scale_factor)
    shadow_pad = int(64 * scale_factor)
    comp_w = card_w + shadow_pad * 2
    comp_h = card_h + shadow_pad * 2 + tape_margin_top

    comp = Image.new("RGBA", (comp_w, comp_h), (0, 0, 0, 0))
    cx0 = shadow_pad
    cy0 = shadow_pad + tape_margin_top
    card_radius = int(12 * scale_factor)

    # 1. Deep 3D Drop Shadow behind the Scrapbook Print
    sh = Image.new("RGBA", (comp_w, comp_h), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(sh)
    sh_draw.rounded_rectangle(
        [cx0 + int(8 * scale_factor), cy0 + int(18 * scale_factor), cx0 + card_w + int(8 * scale_factor), cy0 + card_h + int(18 * scale_factor)],
        radius=card_radius,
        fill=(0, 0, 0, 195),
    )
    sh = sh.filter(ImageFilter.GaussianBlur(radius=int(22 * scale_factor)))
    comp.alpha_composite(sh, (0, 0))

    # 2. Polaroid / Scrapbook Paper Card (Clean border, zero text)
    card_draw = ImageDraw.Draw(comp)
    card_draw.rounded_rectangle(
        [cx0, cy0, cx0 + card_w, cy0 + card_h],
        radius=card_radius,
        fill=paper_fill,
        outline=border_col,
        width=max(2, int(3 * scale_factor)),
    )

    # 3. Paste Photo inside the Polaroid Frame
    px0 = cx0 + pad_side
    py0 = cy0 + pad_top
    comp.alpha_composite(photo_img, (px0, py0))
    card_draw.rectangle(
        [px0 - 1, py0 - 1, px0 + pw + 1, py0 + ph + 1],
        outline=inner_col,
        width=max(1, int(2 * scale_factor)),
    )

    # 4. Translucent Gold/Amber Washi Tape Strip across Top Center
    mid_x = cx0 + card_w // 2
    tape_w = int(165 * scale_factor)
    tape_h = int(40 * scale_factor)
    tape_img = Image.new("RGBA", (tape_w, tape_h), (245, 184, 65, 178))
    t_draw = ImageDraw.Draw(tape_img)
    t_draw.rectangle([0, 0, tape_w - 1, tape_h - 1], outline=(255, 224, 130, 195), width=2)
    tape_rot = tape_img.rotate(-2.2, expand=True, resample=Image.Resampling.BICUBIC)
    tx0 = mid_x - tape_rot.width // 2
    ty0 = cy0 - (tape_rot.height // 2) + int(4 * scale_factor)
    comp.alpha_composite(tape_rot, (tx0, ty0))

    # 6. Rotate the entire Scrapbook Print + Shadow + Tape by `tilt_deg`
    if abs(tilt_deg) > 0.05:
        comp = comp.rotate(-float(tilt_deg), expand=True, resample=Image.Resampling.BICUBIC)

    # 7. Center on the target_w x target_h transparent stage
    stage = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    sx = (target_w - comp.width) // 2
    sy = (target_h - comp.height) // 2
    stage.alpha_composite(comp, (sx, sy))

    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    stage.save(output_png, "PNG")
    return True


def _render_single_storyboard_segment(
    ffmpeg_bin: str,
    idx: int,
    item: StoryboardItem,
    clip_has_audio: bool,
    tmpdir: str,
    target_w: int,
    target_h: int,
    fps: int,
    default_fit_mode: str,
    global_title: str,
    global_subtitle: str,
    show_global_banner: bool,
) -> Tuple[int, str, float, float]:
    """
    Hardware-accelerated segment renderer (`h264_videotoolbox`) with:
      - Zero black flashes: regular frame-accurate cuts (`trim=duration={out_dur}`)
      - Slow-Motion (`0.70x`, `0.55x`) & Speed-Ramp (`speed_ramp`)
      - Natural 1.0x pitch-preserved native event audio
    """
    src_dur = max(0.25, float(item.out_sec - item.in_sec))
    speed_mode = getattr(item, "speed_mode", "1.0x") or "1.0x"
    speed_mult = SPEED_MULTIPLIERS.get(speed_mode, 1.0)
    out_dur = max(0.30, round(src_dur / speed_mult, 3))

    seg_out = os.path.join(tmpdir, f"sb_seg_{idx:04d}.mp4")
    overlay_png = os.path.join(tmpdir, f"sb_ov_{idx:04d}.png")

    fit_mode = item.fit_mode if item.fit_mode in ("cover", "blur_pad") else default_fit_mode
    is_target_vert = target_h > target_w
    is_clip_vert = item.clip_orientation == "vertical"
    use_blur_backdrop = (fit_mode == "blur_pad") and (is_target_vert != is_clip_vert)

    has_overlay = render_text_overlay_png(
        output_png=overlay_png,
        target_w=target_w,
        target_h=target_h,
        primary_text=item.overlay_text,
        sub_text=item.overlay_subtext,
        position=item.overlay_position,
        style=item.overlay_style,
        size_preset=item.overlay_size,
        global_title=global_title if show_global_banner else "",
        global_subtitle=global_subtitle if show_global_banner else "",
    )

    is_photo = (getattr(item, "media_type", "video") == "photo") or is_photo_file(item.clip_filepath)

    pts_factor = 1.0 / speed_mult
    if is_photo:
        speed_vf = f"fps={fps}"
    elif speed_mode in ("0.70x", "0.55x", "speed_ramp"):
        speed_vf = f"setpts={pts_factor:.4f}*(PTS-STARTPTS),fps={fps},tblend=all_mode=average:all_opacity=0.25"
    elif speed_mode == "1.25x":
        speed_vf = f"setpts={pts_factor:.4f}*(PTS-STARTPTS),fps={fps}"
    else:
        speed_vf = f"setpts=PTS-STARTPTS,fps={fps}"

    # Cinematic Visual Grade & Camera Motion (No fade-to-black!)
    fx_chain = ""
    if item.effect in ("cinematic_film",):
        zw, zh = int(target_w * 1.05), int(target_h * 1.05)
        fx_chain = (
            f",scale={zw}:{zh},"
            f"crop={target_w}:{target_h}:x='(iw-ow)/2':y='(ih-oh)/2',"
            f"colorbalance=rs=0.06:gs=0.01:bs=-0.05:rh=0.08:gh=0.03:bh=-0.04,"
            f"eq=contrast=1.07:brightness=-0.01:saturation=1.14"
        )
    elif item.effect == "warm_temple":
        fx_chain = (
            ",colorbalance=rs=0.09:gs=0.03:bs=-0.07:rh=0.11:gh=0.04:bh=-0.05,"
            "eq=contrast=1.06:brightness=0.01:saturation=1.16"
        )
    elif item.effect in ("ken_burns_in", "photo_parallax_in", "photo_polaroid_gold"):
        zw, zh = int(target_w * 1.12), int(target_h * 1.12)
        fx_chain = (
            f",scale={zw}:{zh},"
            f"crop={target_w}:{target_h}:x='(iw-ow)/2':y='(ih-oh)/2 - (ih-oh)*0.24*(t/{out_dur:.2f})',"
            f"colorbalance=rs=0.06:gs=0.02:bs=-0.04:rh=0.07:gh=0.03:bh=-0.03,"
            f"eq=contrast=1.06:saturation=1.12"
        )
    elif item.effect in ("ken_burns_out", "photo_reveal_out"):
        zw, zh = int(target_w * 1.12), int(target_h * 1.12)
        fx_chain = (
            f",scale={zw}:{zh},"
            f"crop={target_w}:{target_h}:x='(iw-ow)/2':y='(ih-oh)*0.24*(t/{out_dur:.2f})',"
            f"colorbalance=rs=0.06:gs=0.02:bs=-0.04:rh=0.07:gh=0.03:bh=-0.03,"
            f"eq=contrast=1.06:saturation=1.12"
        )
    elif item.effect == "photo_pan_drift":
        zw, zh = int(target_w * 1.12), int(target_h * 1.12)
        fx_chain = (
            f",scale={zw}:{zh},"
            f"crop={target_w}:{target_h}:x='(iw-ow)*0.20 + (iw-ow)*0.60*(t/{out_dur:.2f})':y='(ih-oh)/2',"
            f"colorbalance=rs=0.06:gs=0.02:bs=-0.04:rh=0.07:gh=0.03:bh=-0.03,"
            f"eq=contrast=1.06:saturation=1.12"
        )
    elif item.effect == "punch_zoom":
        zw, zh = int(target_w * 1.14), int(target_h * 1.14)
        fx_chain = f",scale={zw}:{zh},crop={target_w}:{target_h},eq=contrast=1.08:saturation=1.14"
    elif item.effect == "cinema_glow":
        fx_chain = ",eq=contrast=1.08:brightness=0.02:saturation=1.14"

    scrapbook_png = os.path.join(tmpdir, f"sb_scrap_{idx:04d}.png")
    has_scrapbook = False
    scrap_fp = getattr(item, "scrapbook_photo_filepath", "") or ""
    if scrap_fp and os.path.exists(scrap_fp):
        has_scrapbook = render_scrapbook_photo_overlay_png(
            photo_path=scrap_fp,
            output_png=scrapbook_png,
            target_w=target_w,
            target_h=target_h,
            tilt_deg=float(getattr(item, "scrapbook_tilt_deg", -3.0) or 0.0),
            scale_pct=int(getattr(item, "scrapbook_scale_pct", 78) or 78),
            style=str(getattr(item, "scrapbook_style", "polaroid_tape") or "polaroid_tape"),
        )

    scrap_timing = getattr(item, "scrapbook_timing", "pop_after_1s") or "pop_after_1s"
    if scrap_timing == "full":
        pop_t = 0.0
        pop_end = out_dur
    elif scrap_timing in ("pop_early", "flash_quick"):
        pop_t = min(0.65, max(0.35, out_dur * 0.18))
        pop_end = min(out_dur - 0.25, pop_t + 0.85)
    else:
        # Default ("pop_after_1s" / "flash_short"): Let video play ~0.95s, flash photo up for a snappy ~1.20s, then return to video!
        pop_t = min(0.95, max(0.45, out_dur * 0.24))
        pop_end = min(out_dur - 0.30, pop_t + 1.20)

    # Build Video Filtergraph (no fade-to-black transitions so cuts are 100% clean regular cuts!)
    if is_photo:
        base_v = f"[0:v]{speed_vf},scale={target_w}:{target_h},setsar=1{fx_chain}[v_framed]"
    elif use_blur_backdrop:
        base_v = (
            f"[0:v]{speed_vf},split=2[bg][fg];"
            f"[bg]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},boxblur=28:4,"
            f"eq=brightness=-0.14:saturation=1.15[bg_b];"
            f"[fg]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease[fg_s];"
            f"[bg_b][fg_s]overlay=(W-w)/2:(H-h)/2,setsar=1{fx_chain}[v_framed]"
        )
    else:
        base_v = (
            f"[0:v]{speed_vf},scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},setsar=1{fx_chain}[v_framed]"
        )

    cur_v_label = "[v_framed]"
    next_input_idx = 1
    chain_parts = [base_v]

    if has_scrapbook:
        scrap_in_idx = next_input_idx
        next_input_idx += 1
        flash_end = pop_t + 0.10
        # Subtle warm camera-shutter flash at pop_t + slight background dimming only while scrapbook print is flashed up
        if pop_t > 0.05:
            win_expr = f"between(t,{pop_t:.3f},{pop_end:.3f})"
            bg_prep = (
                f"{cur_v_label}eq=brightness=-0.07:saturation=1.08:enable='{win_expr}'[v_bg_dim];"
                f"[v_bg_dim][{scrap_in_idx}:v]overlay=0:0:enable='{win_expr}',"
                f"eq=brightness=0.13:contrast=1.05:enable='between(t,{pop_t:.3f},{flash_end:.3f})'[v_scrap]"
            )
        else:
            bg_prep = (
                f"{cur_v_label}eq=brightness=-0.07:saturation=1.08[v_bg_dim];"
                f"[v_bg_dim][{scrap_in_idx}:v]overlay=0:0,"
                f"eq=brightness=0.12:contrast=1.04:enable='between(t,0,0.10)'[v_scrap]"
            )
        chain_parts.append(bg_prep)
        cur_v_label = "[v_scrap]"

    if has_overlay:
        ov_in_idx = next_input_idx
        next_input_idx += 1
        if item.overlay_timing == "intro_3s" and out_dur > 3.2:
            ov_enable = ":enable='between(t,0,3.0)'"
        else:
            ov_enable = ""
        chain_parts.append(f"{cur_v_label}[{ov_in_idx}:v]overlay=0:0{ov_enable},format=yuv420p[vout]")
    else:
        chain_parts.append(f"{cur_v_label}format=yuv420p[vout]")

    filter_complex = ";".join(chain_parts)

    vol_gain = 0.0 if (item.muted or is_photo) else max(0.0, float(item.volume_pct) / 100.0)
    fade_a = min(0.05, out_dur * 0.15)  # Tiny 50ms de-click fade at cut boundary
    fade_out_st = max(0.0, out_dur - fade_a)

    use_source_audio = (not is_photo) and clip_has_audio and (vol_gain > 0.001)
    audio_read_dur = max(src_dur, out_dur) + 0.35
    audio_in_sec = max(0.0, min(item.in_sec, max(0.0, item.clip_duration - audio_read_dur - 0.05)))

    if is_photo:
        prepared_photo_jpg = os.path.join(tmpdir, f"sb_photo_stage_{idx:04d}.jpg")
        prepare_photo_stage_image(
            src_jpg=item.clip_filepath,
            out_jpg=prepared_photo_jpg,
            target_w=target_w,
            target_h=target_h,
            fit_mode=fit_mode,
            effect=item.effect,
        )
        inputs = [
            "-loop", "1",
            "-t", f"{out_dur + 0.35:.4f}",
            "-i", prepared_photo_jpg,
        ]
    else:
        # Read +0.4s extra video input so keyframe seek + setpts never starves the last frame
        video_read_dur = src_dur + 0.45
        inputs = [
            "-ss", f"{max(0.0, item.in_sec):.4f}",
            "-t", f"{video_read_dur:.4f}",
            "-i", item.clip_filepath,
        ]

    if has_scrapbook:
        inputs += ["-loop", "1", "-t", f"{out_dur:.4f}", "-i", scrapbook_png]

    if has_overlay:
        inputs += ["-loop", "1", "-t", f"{out_dur:.4f}", "-i", overlay_png]

    if use_source_audio:
        inputs += [
            "-ss", f"{audio_in_sec:.4f}",
            "-t", f"{out_dur + 0.25:.4f}",
            "-i", item.clip_filepath,
        ]
        aud_idx = next_input_idx
        af_str = (
            f"atrim=0:{out_dur:.4f},asetpts=PTS-STARTPTS,"
            f"volume={vol_gain:.3f},"
            f"afade=t=in:st=0:d={fade_a:.3f},"
            f"afade=t=out:st={fade_out_st:.3f}:d={fade_a:.3f},"
            f"aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo"
        )
        full_fc = f"{filter_complex};[{aud_idx}:a]{af_str}[aout]"
    else:
        inputs += ["-f", "lavfi", "-t", f"{out_dur:.4f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        aud_idx = next_input_idx
        full_fc = f"{filter_complex};[{aud_idx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[aout]"

    hw_cmd = [
        ffmpeg_bin, "-y",
        *inputs,
        "-filter_complex", full_fc,
        "-map", "[vout]",
        "-map", "[aout]",
        "-t", f"{out_dur:.4f}",
        "-c:v", "h264_videotoolbox",
        "-b:v", "12M",
        "-r", str(fps),
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-ac", "2",
        seg_out,
    ]
    res = subprocess.run(hw_cmd, capture_output=True)
    if res.returncode != 0 or not os.path.exists(seg_out):
        sw_cmd = [
            ffmpeg_bin, "-y",
            *inputs,
            "-filter_complex", full_fc,
            "-map", "[vout]",
            "-map", "[aout]",
            "-t", f"{out_dur:.4f}",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "19",
            "-r", str(fps),
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "44100",
            "-ac", "2",
            seg_out,
        ]
        subprocess.run(sw_cmd, capture_output=True, check=True)

    return idx, seg_out, out_dur, (vol_gain if use_source_audio else 0.0)


def render_recap_reel(
    project: ReelProject,
    output_path: str,
    fps: int = 30,
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> str:
    ffmpeg_bin, _ = ensure_ffmpeg()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    if not project.storyboard:
        raise ValueError("Storyboard is empty — add at least one clip to export.")

    if project.aspect_ratio == "16:9":
        target_w, target_h = 1920, 1080
    else:
        target_w, target_h = 1080, 1920

    clip_audio_map = {c.clip_id: c.has_audio for c in project.clips}
    ordered_items = list(project.storyboard)
    total_segs = len(ordered_items)

    with tempfile.TemporaryDirectory(prefix="reel_export_") as tmpdir:
        results_by_idx: Dict[int, Tuple[str, float, float]] = {}
        completed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futs = []
            for idx, item in enumerate(ordered_items):
                show_global = (
                    (project.global_banner_mode == "all_clips")
                    or (project.global_banner_mode == "intro_only" and idx == 0)
                )
                has_aud = clip_audio_map.get(item.clip_id, True)
                futs.append(
                    pool.submit(
                        _render_single_storyboard_segment,
                        ffmpeg_bin,
                        idx,
                        item,
                        has_aud,
                        tmpdir,
                        target_w,
                        target_h,
                        fps,
                        project.default_fit_mode,
                        project.global_title,
                        project.global_subtitle,
                        show_global,
                    )
                )

            for fut in concurrent.futures.as_completed(futs):
                idx, seg_out, seg_dur, eff_gain = fut.result()
                results_by_idx[idx] = (seg_out, seg_dur, eff_gain)
                completed += 1
                if progress_cb:
                    pct = int((completed / total_segs) * 85)
                    progress_cb(f"🎬 Rendered Storyboard Cut {completed}/{total_segs} (VideoToolbox)...", pct)

        concat_list_path = os.path.join(tmpdir, "concat.txt")
        total_reel_dur = 0.0
        with open(concat_list_path, "w", encoding="utf-8") as f:
            for i in range(total_segs):
                seg_path, s_dur, _ = results_by_idx[i]
                f.write(f"file '{seg_path}'\n")
                total_reel_dur += s_dur

        concat_mp4 = os.path.join(tmpdir, "concat_master.mp4")
        if progress_cb:
            progress_cb("🔗 Joining Regular Cuts & Native Event Audio...", 90)

        concat_cmd = [
            ffmpeg_bin, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-movflags", "+faststart",
            concat_mp4,
        ]
        subprocess.run(concat_cmd, capture_output=True, check=True)

        has_bg_music = (
            project.bg_music_enabled
            and bool(project.bg_music_filepath)
            and os.path.exists(project.bg_music_filepath)
            and project.bg_music_volume_pct > 0
        )

        if not has_bg_music:
            shutil.copy2(concat_mp4, output_path)
        else:
            if progress_cb:
                progress_cb("🎵 Mixing Background Music Bed with Auto-Ducking under Clip Audio...", 95)

            bg_vol = max(0.02, min(1.0, float(project.bg_music_volume_pct) / 100.0))
            fade_out_st = max(0.0, total_reel_dur - 1.2)

            if project.bg_music_ducking:
                af_complex = (
                    f"[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,asplit=2[orig_main][orig_sc];"
                    f"[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,"
                    f"volume={bg_vol:.3f},"
                    f"afade=t=in:st=0:d=0.8,"
                    f"afade=t=out:st={fade_out_st:.3f}:d=1.2[bg_pre];"
                    f"[bg_pre][orig_sc]sidechaincompress=threshold=0.035:ratio=4.5:attack=45:release=380[bg_ducked];"
                    f"[orig_main][bg_ducked]amix=inputs=2:duration=first:dropout_transition=0:weights='1.0 1.0',"
                    f"alimiter=limit=0.96[aout]"
                )
            else:
                af_complex = (
                    f"[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo[orig_main];"
                    f"[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,"
                    f"volume={bg_vol:.3f},"
                    f"afade=t=in:st=0:d=0.8,"
                    f"afade=t=out:st={fade_out_st:.3f}:d=1.2[bg_pre];"
                    f"[orig_main][bg_pre]amix=inputs=2:duration=first:dropout_transition=0:weights='1.0 1.0',"
                    f"alimiter=limit=0.96[aout]"
                )

            mix_cmd = [
                ffmpeg_bin, "-y",
                "-i", concat_mp4,
                "-stream_loop", "-1",
                "-i", project.bg_music_filepath,
                "-filter_complex", af_complex,
                "-map", "0:v:0",
                "-map", "[aout]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "256k",
                "-shortest",
                "-movflags", "+faststart",
                output_path,
            ]
            res = subprocess.run(mix_cmd, capture_output=True)
            if res.returncode != 0 or not os.path.exists(output_path):
                fallback_fc = (
                    f"[0:a]volume=1.0[a0];"
                    f"[1:a]volume={bg_vol * 0.75:.3f},afade=t=out:st={fade_out_st:.3f}:d=1.2[a1];"
                    f"[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[aout]"
                )
                fb_cmd = [
                    ffmpeg_bin, "-y",
                    "-i", concat_mp4,
                    "-stream_loop", "-1",
                    "-i", project.bg_music_filepath,
                    "-filter_complex", fallback_fc,
                    "-map", "0:v:0",
                    "-map", "[aout]",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "256k",
                    "-shortest",
                    "-movflags", "+faststart",
                    output_path,
                ]
                subprocess.run(fb_cmd, capture_output=True, check=True)

    if progress_cb:
        progress_cb("✅ Event Recap Reel Export Complete!", 100)

    return output_path
