"""
Clipper Engine v6 — Parallel Multi-Agent Audio/Lyric Sync & Hardware-Accelerated Renderer
- Spawns parallel Clip Sync Agents (`ThreadPoolExecutor` + CTranslate2 multi-worker inference + FFmpeg subprocesses)
- Uses Apple Silicon `h264_videotoolbox` hardware encoding for 5x-10x faster proxy & 1080p export rendering
- Fast FFmpeg rawvideo pipe for 4Hz visual energy scoring (20x faster on 4K .MOV files)
- Real-time per-agent progress callbacks (`progress_cb(stage, pct)`) for the Web Studio Agent Swarm UI
"""

from __future__ import annotations

import concurrent.futures
import difflib
import hashlib
import json
import math
import os
import random
import re
import shutil
import subprocess
import tempfile
import threading
from collections import defaultdict
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple, Callable

import static_ffmpeg
static_ffmpeg.add_paths()

import audalign as ad
import cv2
import librosa
import numpy as np
from faster_whisper import WhisperModel
from rapidfuzz import fuzz
from scipy import signal, ndimage

_WHISPER_MODEL: Optional[WhisperModel] = None
_WHISPER_LOCK = threading.Lock()


def get_whisper_model(model_size: str = "base.en") -> WhisperModel:
    """
    Lazy-load faster-whisper with `num_workers=4` so multiple Clip Sync Agents
    can execute CTranslate2 transcription in parallel without GIL contention.
    """
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


@dataclass
class LyricWord:
    word: str
    norm: str
    start: float
    end: float


@dataclass
class LyricPhrase:
    text: str
    start: float
    end: float


@dataclass
class ClipAnalysis:
    clip_id: str
    filename: str
    filepath: str
    proxy_url: str
    duration: float
    width: int
    height: int
    fps: float
    song_offset_sec: float
    usable_start_sec: float
    usable_end_sec: float
    active_song_start: float
    active_song_end: float
    song_end_sec: float
    sync_confidence: float
    sync_method: str
    matched_lyrics: str
    is_synced_take: bool
    energy_curve: List[float]
    mean_energy: float
    color: str


@dataclass
class EditSegment:
    id: str
    index: int
    song_start: float
    song_end: float
    clip_id: str
    clip_filename: str
    clip_filepath: str
    proxy_url: str
    clip_in: float
    clip_out: float
    is_synced: bool
    effect: str  # "none", "punch_zoom", "flash_in", "zoom_shake"
    beat_energy: float
    cut_reason: str = "lyrics_808"


@dataclass
class ProjectState:
    project_id: str
    song_filename: str
    song_filepath: str
    song_url: str
    song_duration: float
    bpm: float
    render_start_sec: float
    render_end_sec: float
    beat_times: List[float]
    bass_drop_times: List[float]
    cut_mode: str = "lyrics_808"
    lyrics_words: List[LyricWord] = field(default_factory=list)
    lyrics_phrases: List[LyricPhrase] = field(default_factory=list)
    clips: List[ClipAnalysis] = field(default_factory=list)
    segments: List[EditSegment] = field(default_factory=list)


CLIP_PALETTE = [
    "#ff2a85", "#8b5cf6", "#06b6d4", "#10b981",
    "#f59e0b", "#ef4444", "#ec4899", "#3b82f6",
    "#14b8a6", "#a855f7", "#eab308", "#f97316",
]


def normalize_word(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower().strip())


def group_words_into_lyric_phrases(words: List[LyricWord]) -> List[LyricPhrase]:
    if not words:
        return []

    phrases: List[LyricPhrase] = []
    cur_words: List[LyricWord] = []

    for w in words:
        if not cur_words:
            cur_words.append(w)
            continue

        gap = w.start - cur_words[-1].end
        cur_dur = w.end - cur_words[0].start

        if gap >= 0.26 or len(cur_words) >= 7 or (cur_dur >= 2.1 and len(cur_words) >= 4):
            phrases.append(
                LyricPhrase(
                    text=" ".join(cw.word for cw in cur_words),
                    start=round(cur_words[0].start, 3),
                    end=round(cur_words[-1].end, 3),
                )
            )
            cur_words = [w]
        else:
            cur_words.append(w)

    if cur_words:
        phrases.append(
            LyricPhrase(
                text=" ".join(cw.word for cw in cur_words),
                start=round(cur_words[0].start, 3),
                end=round(cur_words[-1].end, 3),
            )
        )

    return phrases


def transcribe_audio_words(audio_path: str, is_song: bool = False) -> Tuple[List[LyricWord], List[LyricPhrase]]:
    try:
        model = get_whisper_model("base.en")
        segments_gen, _ = model.transcribe(
            audio_path,
            word_timestamps=True,
            vad_filter=not is_song,
            vad_parameters=dict(min_silence_duration_ms=300) if not is_song else None,
            condition_on_previous_text=False,
        )
        words: List[LyricWord] = []
        for seg in segments_gen:
            if seg.words:
                for w in seg.words:
                    nw = normalize_word(w.word)
                    if nw:
                        words.append(
                            LyricWord(
                                word=w.word.strip(),
                                norm=nw,
                                start=round(float(w.start), 3),
                                end=round(float(w.end), 3),
                            )
                        )
        phrases = group_words_into_lyric_phrases(words)
        return words, phrases
    except Exception:
        return [], []


def match_clip_lyrics_to_master(
    master_words: List[LyricWord],
    clip_words: List[LyricWord],
    clip_duration: float,
    song_duration: float,
) -> Tuple[float, float, float, float, str]:
    if len(master_words) < 3 or len(clip_words) < 2:
        return 0.0, 0.0, 0.0, clip_duration, ""

    m_norms = [w.norm for w in master_words]
    c_norms = [w.norm for w in clip_words]

    pair_matches: List[Tuple[int, int, float]] = []

    matcher = difflib.SequenceMatcher(None, c_norms, m_norms, autojunk=False)
    for block in matcher.get_matching_blocks():
        if block.size >= 1:
            for k in range(block.size):
                ci = block.a + k
                mi = block.b + k
                offset = master_words[mi].start - clip_words[ci].start
                pair_matches.append((ci, mi, offset))

    for ci, cw in enumerate(clip_words):
        if len(cw.norm) < 4:
            continue
        for mi, mw in enumerate(master_words):
            if len(mw.norm) < 4:
                continue
            if cw.norm == mw.norm or fuzz.ratio(cw.norm, mw.norm) >= 84:
                offset = mw.start - cw.start
                pair_matches.append((ci, mi, offset))

    if not pair_matches:
        return 0.0, 0.0, 0.0, clip_duration, ""

    best_inliers: List[Tuple[int, int, float]] = []
    best_median_offset = 0.0

    for _, _, cand_off in pair_matches:
        if cand_off < -clip_duration or cand_off > song_duration:
            continue
        inliers = [p for p in pair_matches if abs(p[2] - cand_off) <= 0.85]
        unique_by_ci: Dict[int, Tuple[int, int, float]] = {}
        for p in inliers:
            if p[0] not in unique_by_ci:
                unique_by_ci[p[0]] = p
        dedup_inliers = sorted(unique_by_ci.values(), key=lambda x: x[0])

        mono_inliers: List[Tuple[int, int, float]] = []
        last_mi = -1
        for p in dedup_inliers:
            if p[1] > last_mi:
                mono_inliers.append(p)
                last_mi = p[1]

        if len(mono_inliers) > len(best_inliers):
            best_inliers = mono_inliers
            best_median_offset = float(np.median([p[2] for p in mono_inliers]))

    if len(best_inliers) < 2:
        return 0.0, 0.0, 0.0, clip_duration, ""

    first_ci = best_inliers[0][0]
    last_ci = best_inliers[-1][0]

    lyric_u_start = max(0.0, clip_words[first_ci].start - 0.5)
    lyric_u_end = min(clip_duration, clip_words[last_ci].end + 0.5)

    matched_words_str = " ".join(clip_words[p[0]].word for p in best_inliers[:14])
    if len(best_inliers) > 14:
        matched_words_str += " ..."

    lyric_conf = float(len(best_inliers) * 2.2)
    return (
        round(best_median_offset, 3),
        round(lyric_conf, 2),
        round(lyric_u_start, 3),
        round(lyric_u_end, 3),
        matched_words_str,
    )


def run_audalign_sync(master_wav: str, clip_wav: str) -> Tuple[float, float]:
    with tempfile.TemporaryDirectory(prefix="audalign_tmp_") as tmpdir:
        tmp_clip = os.path.join(tmpdir, os.path.basename(clip_wav))
        shutil.copy2(clip_wav, tmp_clip)

        try:
            rec_spec = ad.CorrelationSpectrogramRecognizer()
            rec_spec.config.sample_rate = 22050
            res = ad.target_align(
                master_wav,
                tmpdir,
                recognizer=rec_spec,
                write_files=False,
            )
            clip_name = os.path.basename(tmp_clip)
            if res and clip_name in res:
                offset = float(res[clip_name])
                conf = 0.0
                match_info = res.get("match_info", {}).get(clip_name, {})
                if match_info:
                    for _, info_dict in match_info.items():
                        c_list = info_dict.get("confidence", [])
                        if c_list:
                            conf = float(np.max(c_list))
                return offset, conf
        except Exception:
            pass

    return 0.0, 0.0


def probe_video(filepath: str) -> Dict[str, Any]:
    _, ffprobe_bin = ensure_ffmpeg()
    cap = cv2.VideoCapture(filepath)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {filepath}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)
    duration = frame_count / fps if fps > 0 and frame_count > 0 else 0.0
    cap.release()

    try:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            filepath,
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if res.returncode == 0:
            info = json.loads(res.stdout)
            fmt_dur = float(info.get("format", {}).get("duration", 0) or 0)
            if fmt_dur > 0:
                duration = fmt_dur
    except Exception:
        pass

    return {
        "duration": float(duration),
        "width": width,
        "height": height,
        "fps": float(fps),
    }


def ensure_browser_proxy(src_video: str, proxy_dir: Path, clip_id: str) -> str:
    """
    Create a fast-scrubbing 540p .mp4 proxy using Apple Silicon `h264_videotoolbox`
    hardware acceleration (falling back to libx264 ultrafast if needed).
    """
    ffmpeg_bin, _ = ensure_ffmpeg()
    proxy_dir.mkdir(parents=True, exist_ok=True)
    stat = os.stat(src_video)
    sig = hashlib.md5(f"{src_video}:{stat.st_size}:{stat.st_mtime}".encode()).hexdigest()[:10]
    out_name = f"proxy_{clip_id}_{sig}.mp4"
    out_path = proxy_dir / out_name

    if out_path.exists() and out_path.stat().st_size > 1024:
        return out_name

    # Try Apple Silicon VideoToolbox hardware encoder first
    hw_cmd = [
        ffmpeg_bin,
        "-y",
        "-i", src_video,
        "-vf", "scale=-2:540,format=yuv420p",
        "-c:v", "h264_videotoolbox",
        "-b:v", "2200k",
        "-g", "15",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        str(out_path),
    ]
    res = subprocess.run(hw_cmd, capture_output=True)
    if res.returncode == 0 and out_path.exists() and out_path.stat().st_size > 1024:
        return out_name

    # Fallback to software libx264 ultrafast
    sw_cmd = [
        ffmpeg_bin,
        "-y",
        "-i", src_video,
        "-vf", "scale=-2:540,format=yuv420p",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "25",
        "-g", "15",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        str(out_path),
    ]
    subprocess.run(sw_cmd, capture_output=True, check=True)
    return out_name


def extract_audio_to_wav(media_path: str, out_wav: str, sr: int = 22050) -> bool:
    ffmpeg_bin, _ = ensure_ffmpeg()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", media_path,
        "-vn",
        "-ac", "1",
        "-ar", str(sr),
        "-f", "wav",
        out_wav,
    ]
    res = subprocess.run(cmd, capture_output=True, check=False)
    return res.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1024


def bandpass_filter(y: np.ndarray, sr: int, low_hz: float = 280.0, high_hz: float = 4500.0) -> np.ndarray:
    nyq = 0.5 * sr
    low = max(low_hz / nyq, 0.01)
    high = min(high_hz / nyq, 0.98)
    sos = signal.butter(4, [low, high], btype="band", output="sos")
    return signal.sosfilt(sos, y)


def compute_whitened_spectrogram(
    y: np.ndarray,
    sr: int = 22050,
    n_fft: int = 2048,
    hop_length: int = 256,
) -> np.ndarray:
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    bin_min = int(np.searchsorted(freqs, 280.0))
    bin_max = int(np.searchsorted(freqs, 4800.0))
    S_band = np.log1p(S[bin_min:bin_max, :] * 100.0)
    bg_floor = ndimage.uniform_filter(S_band, size=(15, 25))
    return np.maximum(0.0, S_band - bg_floor)


def extract_constellation_hashes(
    y: np.ndarray,
    sr: int = 22050,
    n_fft: int = 2048,
    hop_length: int = 256,
    fan_out: int = 12,
    S_white: Optional[np.ndarray] = None,
) -> Dict[Tuple[int, int, int], List[int]]:
    if S_white is None:
        S_white = compute_whitened_spectrogram(y, sr=sr, n_fft=n_fft, hop_length=hop_length)

    neighborhood = (11, 9)
    local_max = ndimage.maximum_filter(S_white, size=neighborhood) == S_white
    thresh = np.percentile(S_white, 80)
    peak_mask = local_max & (S_white > max(thresh, 1e-4))

    freq_idx, time_idx = np.nonzero(peak_mask)
    order = np.argsort(time_idx)
    freq_idx = freq_idx[order]
    time_idx = time_idx[order]

    hashes: Dict[Tuple[int, int, int], List[int]] = defaultdict(list)
    n_peaks = len(time_idx)
    for i in range(n_peaks):
        t1 = int(time_idx[i])
        f1 = int(freq_idx[i])
        paired = 0
        for j in range(i + 1, min(n_peaks, i + 50)):
            dt = int(time_idx[j]) - t1
            if dt < 2:
                continue
            if dt > 65:
                break
            f2 = int(freq_idx[j])
            h = (f1 // 2, f2 // 2, dt)
            hashes[h].append(t1)
            paired += 1
            if paired >= fan_out:
                break

    return hashes


def detect_active_song_subregion(
    master_S_white: np.ndarray,
    clip_S_white: np.ndarray,
    master_filt: np.ndarray,
    clip_norm: np.ndarray,
    offset_sec: float,
    clip_duration: float,
    song_duration: float,
    sr: int = 22050,
    hop_length: int = 256,
) -> Tuple[float, float, float]:
    min_clip_t = max(0.0, -offset_sec)
    max_clip_t = min(clip_duration, song_duration - offset_sec)
    if max_clip_t - min_clip_t < 0.8:
        return 0.0, clip_duration, 0.0

    win_sec = 1.0
    step_sec = 0.25
    win_frames = max(4, int(round(win_sec * sr / hop_length)))
    win_samples = int(round(win_sec * sr))

    times: List[float] = []
    local_scores: List[float] = []

    t_cur = min_clip_t
    while t_cur + win_sec <= max_clip_t + 0.05:
        t_song = t_cur + offset_sec
        c_f0 = int(round(t_cur * sr / hop_length))
        m_f0 = int(round(t_song * sr / hop_length))

        spec_sim = 0.0
        if (
            c_f0 >= 0
            and m_f0 >= 0
            and c_f0 + win_frames <= clip_S_white.shape[1]
            and m_f0 + win_frames <= master_S_white.shape[1]
        ):
            c_patch = clip_S_white[:, c_f0 : c_f0 + win_frames].ravel()
            m_patch = master_S_white[:, m_f0 : m_f0 + win_frames].ravel()
            c_patch = c_patch - np.mean(c_patch)
            m_patch = m_patch - np.mean(m_patch)
            c_norm_val = np.linalg.norm(c_patch)
            m_norm_val = np.linalg.norm(m_patch)
            if c_norm_val > 1e-6 and m_norm_val > 1e-6:
                spec_sim = max(0.0, float(np.dot(c_patch, m_patch) / (c_norm_val * m_norm_val)))

        c_s0 = int(round(t_cur * sr))
        m_s0 = int(round(t_song * sr))
        wave_sim = 0.0
        if (
            c_s0 >= 0
            and m_s0 >= 0
            and c_s0 + win_samples <= len(clip_norm)
            and m_s0 + win_samples <= len(master_filt)
        ):
            c_seg = clip_norm[c_s0 : c_s0 + win_samples]
            m_seg = master_filt[m_s0 : m_s0 + win_samples]
            c_std = np.std(c_seg)
            m_std = np.std(m_seg)
            if c_std > 1e-6 and m_std > 1e-6:
                wave_sim = abs(float(np.dot(c_seg, m_seg) / (len(c_seg) * c_std * m_std)))

        combined = spec_sim + 2.5 * wave_sim
        times.append(t_cur)
        local_scores.append(combined)
        t_cur += step_sec

    if not local_scores:
        return round(min_clip_t, 3), round(max_clip_t, 3), 0.0

    scores_arr = np.array(local_scores, dtype=np.float32)
    if len(scores_arr) >= 3:
        scores_smooth = ndimage.uniform_filter1d(scores_arr, size=3)
    else:
        scores_smooth = scores_arr

    peak_score = float(np.max(scores_smooth))
    if peak_score < 0.14:
        return round(min_clip_t, 3), round(max_clip_t, 3), 0.0

    active_thresh = max(0.13, peak_score * 0.38)
    active_mask = scores_smooth >= active_thresh
    if not np.any(active_mask):
        return round(min_clip_t, 3), round(max_clip_t, 3), 0.0

    bridged_mask = ndimage.binary_closing(active_mask, structure=np.ones(4))
    labeled, num_features = ndimage.label(bridged_mask)
    best_start_idx = 0
    best_end_idx = len(times) - 1
    best_mass = -1.0

    for lbl_idx in range(1, num_features + 1):
        idxs = np.where(labeled == lbl_idx)[0]
        mass = float(np.sum(scores_smooth[idxs]))
        if mass > best_mass:
            best_mass = mass
            best_start_idx = int(idxs[0])
            best_end_idx = int(idxs[-1])

    u_start = max(min_clip_t, times[best_start_idx])
    u_end = min(max_clip_t, times[best_end_idx] + win_sec)

    if u_start < 0.15 and (u_end - u_start) > 2.5:
        u_start = 0.15
    if u_end > clip_duration - 0.15 and (u_end - u_start) > 2.5:
        u_end = clip_duration - 0.15

    mean_active_score = float(np.mean(scores_smooth[best_start_idx : best_end_idx + 1]))
    return round(float(u_start), 3), round(float(u_end), 3), round(mean_active_score, 4)


def sync_clip_to_master(
    master_wav_path: str,
    master_y: np.ndarray,
    master_filt: np.ndarray,
    master_onset: np.ndarray,
    master_S_white: np.ndarray,
    master_hashes: Dict[Tuple[int, int, int], List[int]],
    master_words: List[LyricWord],
    clip_wav_path: str,
    clip_duration: float,
    song_duration: float,
    sr: int = 22050,
    hop_length: int = 256,
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> Tuple[float, float, float, float, str, str]:
    clip_y, _ = librosa.load(clip_wav_path, sr=sr, mono=True)
    if len(clip_y) < sr * 0.6:
        return 0.0, 0.0, 0.0, clip_duration, "no_song", ""

    # Run Whisper Lyric Transcription and Audalign Acoustic Matching concurrently inside the agent!
    if progress_cb:
        progress_cb("🎤🥁 Running Whisper Lyric + Audalign Acoustic Sync...", 45)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as sub_pool:
        fut_lyrics = sub_pool.submit(transcribe_audio_words, clip_wav_path, False)
        fut_aud = sub_pool.submit(run_audalign_sync, master_wav_path, clip_wav_path)

        # While those two run, compute spectrogram constellation hashes & FFT correlation
        clip_S_white = compute_whitened_spectrogram(clip_y, sr=sr, hop_length=hop_length)
        clip_hashes = extract_constellation_hashes(
            clip_y, sr=sr, hop_length=hop_length, S_white=clip_S_white
        )

        clip_words, _ = fut_lyrics.result()
        aud_offset, aud_conf = fut_aud.result()

    if progress_cb:
        progress_cb("🔍 Matching Lyric Timestamps & Sub-Clip Active Regions...", 72)

    lyric_offset, lyric_conf, lyric_u_start, lyric_u_end, matched_lyrics = match_clip_lyrics_to_master(
        master_words=master_words,
        clip_words=clip_words,
        clip_duration=clip_duration,
        song_duration=song_duration,
    )

    offset_votes: Dict[int, int] = defaultdict(int)
    for h, clip_times in clip_hashes.items():
        master_times = master_hashes.get(h)
        if master_times:
            for mt in master_times:
                for ct in clip_times[:8]:
                    delta_bin = (mt - ct) // 2
                    offset_votes[delta_bin] += 1

    fp_offset_sec = 0.0
    z_fp = 0.0
    if offset_votes:
        counts = np.array(list(offset_votes.values()), dtype=np.float32)
        bins = np.array(list(offset_votes.keys()), dtype=np.int32)
        best_idx = int(np.argmax(counts))
        best_bin = int(bins[best_idx])
        peak_votes = float(
            offset_votes.get(best_bin - 1, 0)
            + offset_votes.get(best_bin, 0)
            + offset_votes.get(best_bin + 1, 0)
        )
        mean_votes = float(np.mean(counts))
        std_votes = float(np.std(counts)) + 1.0
        z_fp = (peak_votes - mean_votes) / std_votes
        fp_offset_sec = (best_bin * 2) * hop_length / float(sr)

    clip_filt = bandpass_filter(clip_y, sr)
    envelope = ndimage.uniform_filter1d(np.abs(clip_filt), size=int(0.08 * sr)) + 1e-5
    clip_agc = clip_filt / np.power(envelope, 0.65)
    clip_std = np.std(clip_agc)
    if clip_std < 1e-6:
        return 0.0, 0.0, 0.0, clip_duration, "no_song", ""
    clip_norm = clip_agc / clip_std

    corr = signal.correlate(master_filt, clip_norm, mode="full", method="fft")
    lags = signal.correlation_lags(len(master_filt), len(clip_norm), mode="full")

    min_overlap = min(int(1.5 * sr), int(0.4 * len(clip_norm)))
    valid_mask = (lags >= -len(clip_norm) + min_overlap) & (lags <= len(master_filt) - min_overlap)
    if not np.any(valid_mask):
        return 0.0, 0.0, 0.0, clip_duration, "no_song", ""

    valid_corr = np.abs(corr[valid_mask])
    valid_lags = lags[valid_mask]

    best_w_idx = int(np.argmax(valid_corr))
    best_lag_samples = int(valid_lags[best_w_idx])
    peak_val = float(valid_corr[best_w_idx])

    exclusion = int(0.5 * sr)
    noise_mask = np.abs(valid_lags - best_lag_samples) > exclusion
    if np.any(noise_mask):
        noise_vals = valid_corr[noise_mask]
        med_noise = float(np.median(noise_vals))
        mad_noise = float(np.median(np.abs(noise_vals - med_noise))) + 1e-8
        z_wave = (peak_val - med_noise) / (1.4826 * mad_noise)
    else:
        z_wave = 0.0
        med_noise, mad_noise = 0.0, 1.0

    wave_offset_sec = best_lag_samples / float(sr)

    chunk_samples = int(4.0 * sr)
    step_samples = int(2.0 * sr)
    best_chunk_z = 0.0
    best_chunk_offset = wave_offset_sec
    if len(clip_norm) > chunk_samples * 1.3:
        for c_start in range(0, len(clip_norm) - chunk_samples + 1, step_samples):
            chunk = clip_norm[c_start : c_start + chunk_samples]
            ch_std = np.std(chunk)
            if ch_std < 1e-5:
                continue
            chunk = chunk / ch_std
            c_corr = np.abs(signal.correlate(master_filt, chunk, mode="valid", method="fft"))
            if len(c_corr) == 0:
                continue
            c_idx = int(np.argmax(c_corr))
            c_peak = float(c_corr[c_idx])
            c_med = float(np.median(c_corr))
            c_mad = float(np.median(np.abs(c_corr - c_med))) + 1e-8
            c_z = (c_peak - c_med) / (1.4826 * c_mad)
            if c_z > best_chunk_z:
                best_chunk_z = c_z
                best_chunk_offset = (c_idx - c_start) / float(sr)

    raw_candidates = [
        ("audalign", aud_offset, max(aud_conf, 4.0)),
        ("whisper_lyrics", lyric_offset, lyric_conf),
        ("wave", wave_offset_sec, z_wave),
        ("fp", fp_offset_sec, z_fp * 1.15),
        ("chunk", best_chunk_offset, best_chunk_z),
    ]

    evaluated: List[Tuple[float, float, float, float, float, float]] = []
    seen_offsets: List[float] = []

    for c_name, c_off, c_z in raw_candidates:
        if c_name == "whisper_lyrics" and c_z < 2.0:
            continue
        center_lag = int(c_off * sr)
        local_mask = np.abs(valid_lags - center_lag) <= int(0.25 * sr)
        refined_off = c_off
        local_wave_z = 0.0
        if np.any(local_mask):
            local_corr = valid_corr[local_mask]
            local_lags = valid_lags[local_mask]
            r_idx = int(np.argmax(local_corr))
            r_lag = int(local_lags[r_idx])
            local_wave_z = (float(local_corr[r_idx]) - med_noise) / (1.4826 * mad_noise)
            if local_wave_z >= 3.2:
                refined_off = r_lag / float(sr)

        if any(abs(refined_off - s) < 0.08 for s in seen_offsets):
            continue
        seen_offsets.append(refined_off)

        ac_u_start, ac_u_end, active_sim = detect_active_song_subregion(
            master_S_white=master_S_white,
            clip_S_white=clip_S_white,
            master_filt=master_filt,
            clip_norm=clip_norm,
            offset_sec=refined_off,
            clip_duration=clip_duration,
            song_duration=song_duration,
            sr=sr,
            hop_length=hop_length,
        )
        active_dur = max(0.0, ac_u_end - ac_u_start)
        effective_z = max(c_z, local_wave_z)
        verify_score = active_sim * math.sqrt(max(active_dur, 0.5)) * (1.0 + 0.08 * min(effective_z, 30.0))
        evaluated.append((verify_score, refined_off, ac_u_start, ac_u_end, active_sim, effective_z))

    if not evaluated:
        return 0.0, 0.0, 0.0, clip_duration, "no_song", ""

    evaluated.sort(key=lambda x: x[0], reverse=True)
    _, final_offset, ac_u_start, ac_u_end, active_sim, best_z = evaluated[0]

    agreed_lyrics = lyric_conf >= 4.0 and abs(lyric_offset - final_offset) <= 0.9
    agreed_audalign = abs(aud_offset - final_offset) <= 0.25

    if agreed_lyrics:
        if active_sim >= 0.16:
            u_start = min(ac_u_start, lyric_u_start)
            u_end = max(ac_u_end, lyric_u_end)
        else:
            u_start, u_end = lyric_u_start, lyric_u_end
            active_sim = max(active_sim, 0.22)
        sync_method = "audalign+lyrics"
    elif active_sim >= 0.16 and best_z >= 4.0:
        u_start, u_end = ac_u_start, ac_u_end
        sync_method = "audalign" if agreed_audalign else "audalign+acoustic"
    elif lyric_conf >= 6.5:
        final_offset = lyric_offset
        u_start, u_end = lyric_u_start, lyric_u_end
        active_sim = 0.22
        best_z = lyric_conf
        sync_method = "whisper_lyrics"
    else:
        u_start, u_end = ac_u_start, ac_u_end
        sync_method = "no_song"

    if sync_method == "no_song" or active_sim < 0.16 or (u_end - u_start) < 0.8:
        final_confidence = min(float(best_z * 0.3), 2.5)
        sync_method = "no_song"
    else:
        final_confidence = float(best_z * (0.9 + 1.5 * min(active_sim, 0.6)))

    return (
        float(final_offset),
        float(final_confidence),
        float(u_start),
        float(u_end),
        sync_method,
        matched_lyrics,
    )


def analyze_video_visuals(filepath: str, duration: float, sample_hz: float = 4.0) -> List[float]:
    """
    Ultra-fast 4Hz visual energy scorer using an FFmpeg rawvideo grayscale pipe (`160x90`).
    Avoids decoding full 4K 60fps frames in Python OpenCV (~15x-20x faster on large .MOV files!).
    """
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

        for idx in range(n_frames):
            gray = frames[idx]
            sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            sharp_score = min(sharpness / 350.0, 1.5)
            if prev_gray is not None:
                diff = float(np.mean(cv2.absdiff(gray, prev_gray)))
                motion_score = min(diff / 18.0, 2.0)
            else:
                motion_score = 0.5
            prev_gray = gray
            score = 0.65 * motion_score + 0.35 * sharp_score
            energy_curve.append(round(float(score), 4))

        return energy_curve if energy_curve else [1.0]
    except Exception:
        return [1.0]


def analyze_song(
    song_path: str,
    sr: int = 22050,
    hop_length: int = 256,
    transcribe_lyrics: bool = True,
) -> Dict[str, Any]:
    y, _ = librosa.load(song_path, sr=sr, mono=True)
    duration = len(y) / float(sr)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    bpm = float(np.ndim(tempo) and np.asarray(tempo).flat[0] or tempo)
    if bpm <= 0:
        bpm = 120.0
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length).tolist()

    if len(beat_times) < 4:
        beat_period = 60.0 / bpm
        beat_times = list(np.arange(0.0, duration, beat_period))

    nyq = 0.5 * sr
    sos_bass = signal.butter(4, [25.0 / nyq, 130.0 / nyq], btype="band", output="sos")
    y_bass = signal.sosfilt(sos_bass, y)
    bass_rms = librosa.feature.rms(y=y_bass, frame_length=1024, hop_length=hop_length)[0]
    bass_rms_norm = bass_rms / (np.percentile(bass_rms, 96) + 1e-8)

    bg_frames = max(3, int(0.35 * sr / hop_length))
    bass_prev = ndimage.uniform_filter1d(bass_rms_norm, size=bg_frames)
    bass_attack = np.maximum(0.0, bass_rms_norm - bass_prev)

    bass_drop_times: List[float] = []
    beat_energies: List[float] = []
    last_808_t = -999.0

    for bt in beat_times:
        frame = min(int(bt * sr / hop_length), len(bass_rms_norm) - 1)
        win_rms = bass_rms_norm[max(0, frame - 3) : min(len(bass_rms_norm), frame + 6)]
        win_att = bass_attack[max(0, frame - 3) : min(len(bass_attack), frame + 6)]
        b_energy = float(np.max(win_rms)) if len(win_rms) > 0 else 0.5
        b_att = float(np.max(win_att)) if len(win_att) > 0 else 0.0
        beat_energies.append(round(b_energy, 3))

        if b_energy >= 0.72 and b_att >= 0.14 and (bt - last_808_t) >= 0.75:
            bass_drop_times.append(round(float(bt), 3))
            last_808_t = float(bt)

    master_filt = bandpass_filter(y, sr)
    master_filt = master_filt / (np.std(master_filt) + 1e-8)
    master_onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    master_onset = (master_onset - np.mean(master_onset)) / (np.std(master_onset) + 1e-8)
    master_S_white = compute_whitened_spectrogram(y, sr=sr, hop_length=hop_length)
    master_hashes = extract_constellation_hashes(
        y, sr=sr, hop_length=hop_length, S_white=master_S_white
    )

    words: List[LyricWord] = []
    phrases: List[LyricPhrase] = []
    if transcribe_lyrics:
        words, phrases = transcribe_audio_words(song_path, is_song=True)

    return {
        "y": y,
        "duration": duration,
        "bpm": round(bpm, 1),
        "beat_times": [round(float(t), 3) for t in beat_times],
        "beat_energies": beat_energies,
        "bass_drop_times": bass_drop_times,
        "master_filt": master_filt,
        "master_onset": master_onset,
        "master_S_white": master_S_white,
        "master_hashes": master_hashes,
        "lyrics_words": words,
        "lyrics_phrases": phrases,
        "sr": sr,
        "hop_length": hop_length,
    }


def _window_visual_energy(c: ClipAnalysis, c_in: float, c_out: float) -> float:
    """Compute average visual energy across the exact clip slice [c_in, c_out]."""
    if not c.energy_curve:
        return 1.0
    i0 = max(0, min(int(c_in * 4.0), len(c.energy_curve) - 1))
    i1 = max(i0 + 1, min(int(math.ceil(c_out * 4.0)), len(c.energy_curve)))
    sub = c.energy_curve[i0:i1]
    return float(np.mean(sub)) if sub else float(c.mean_energy or 1.0)


def _best_high_energy_broll_window(c: ClipAnalysis, seg_dur: float) -> Tuple[float, float, float]:
    """
    Find a high-energy scene of length `seg_dur` inside clip `c` (used for outro/intro B-roll).
    Samples from the top high-energy windows so B-roll scenes are always dynamic and lively!
    """
    min_in = c.usable_start_sec if (c.usable_end_sec - c.usable_start_sec) >= seg_dur + 0.2 else 0.0
    max_in = max(min_in, min(c.usable_end_sec, c.duration - 0.05) - seg_dur)
    if max_in <= min_in + 0.1:
        e_val = _window_visual_energy(c, min_in, min_in + seg_dur)
        return min_in, min(c.duration - 0.02, min_in + seg_dur), e_val

    windows: List[Tuple[float, float]] = []
    step = max(0.5, seg_dur * 0.5)
    t = min_in
    while t <= max_in + 0.01:
        w_start = min(t, max_in)
        e_val = _window_visual_energy(c, w_start, w_start + seg_dur)
        windows.append((e_val, w_start))
        t += step

    windows.sort(key=lambda x: x[0], reverse=True)
    top_k = windows[: max(1, min(5, len(windows)))]
    weights = [max(0.15, w[0]) ** 2.0 for w in top_k]
    chosen_e, chosen_in = random.choices(top_k, weights=weights, k=1)[0]
    return chosen_in, min(c.duration - 0.02, chosen_in + seg_dur), chosen_e


def pick_best_clip_for_window(
    s_start: float,
    s_end: float,
    clips: List[ClipAnalysis],
    last_clip_id: Optional[str] = None,
    exclude_clip_id: Optional[str] = None,
    randomize: bool = True,
    target_energy: float = 0.85,
) -> Optional[Tuple[ClipAnalysis, float, float, bool]]:
    """
    Pick a clip for song window [s_start, s_end] using a 4-tier priority system,
    prioritizing high visual energy & matching beat energy even when randomizing:
      1. `full_candidates`: Synced clips whose active song region covers [s_start, s_end].
      2. `extended_aligned_candidates`: Synced clips that are already lined up with the song
         and still have footage at `c_in = s_start - song_offset_sec` (extends lined-up takes
         into instrumental intros/outros where lyrics/music quiet down!).
      3. `partial_candidates`: Synced clips that partially overlap [s_start, s_end].
      4. `broll_candidates`: High-energy B-roll scenes from the uploaded videos for outro/intro.
    """
    seg_dur = max(0.1, s_end - s_start)
    synced_clips = [c for c in clips if c.is_synced_take]
    usable_pool = synced_clips if synced_clips else [c for c in clips if c.duration >= seg_dur + 0.2]
    if not usable_pool:
        return None

    full_candidates: List[Tuple[float, ClipAnalysis, float, float]] = []
    extended_aligned_candidates: List[Tuple[float, ClipAnalysis, float, float]] = []
    partial_candidates: List[Tuple[float, ClipAnalysis, float, float]] = []

    for c in synced_clips:
        c_in = s_start - c.song_offset_sec
        c_out = s_end - c.song_offset_sec

        if c_in >= c.usable_start_sec - 0.30 and c_out <= c.usable_end_sec + 0.30:
            c_in_clamped = max(
                c.usable_start_sec,
                min(c_in, max(c.usable_start_sec, c.usable_end_sec - seg_dur)),
            )
            c_out_clamped = min(c.usable_end_sec, c_in_clamped + seg_dur)
            vis = _window_visual_energy(c, c_in_clamped, c_out_clamped)
            full_candidates.append((vis, c, c_in_clamped, c_out_clamped))
        elif c_in >= 0.0 and c_out <= c.duration - 0.08:
            # Tier 2: Extend already lined-up video clip at its true aligned timestamp!
            c_in_clamped = max(0.0, min(c_in, max(0.0, c.duration - seg_dur - 0.05)))
            c_out_clamped = min(c.duration - 0.02, c_in_clamped + seg_dur)
            vis = _window_visual_energy(c, c_in_clamped, c_out_clamped)
            extended_aligned_candidates.append((vis, c, c_in_clamped, c_out_clamped))
        else:
            ov_start = max(s_start, c.active_song_start)
            ov_end = min(s_end, c.active_song_end)
            if ov_end - ov_start >= min(0.6, seg_dur * 0.35):
                c_in_clamped = max(
                    0.0,
                    min(s_start - c.song_offset_sec, max(0.0, c.duration - seg_dur - 0.05)),
                )
                c_out_clamped = min(c.duration - 0.02, c_in_clamped + seg_dur)
                vis = _window_visual_energy(c, c_in_clamped, c_out_clamped)
                partial_candidates.append((vis * (ov_end - ov_start), c, c_in_clamped, c_out_clamped))

    def _select_candidate(
        cand_list: List[Tuple[float, ClipAnalysis, float, float]]
    ) -> Tuple[ClipAnalysis, float, float]:
        pool = list(cand_list)
        if exclude_clip_id is not None:
            alt_pool = [item for item in pool if item[1].clip_id != exclude_clip_id]
            if alt_pool:
                pool = alt_pool

        if last_clip_id is not None and len(pool) > 1:
            varied_pool = [item for item in pool if item[1].clip_id != last_clip_id]
            if varied_pool:
                pool = varied_pool

        if randomize and len(pool) > 1:
            # Prioritize high visual energy & matching beat energy via weighted random sampling!
            weights: List[float] = []
            for vis_score, clip_obj, _, _ in pool:
                base_e = max(0.15, float(vis_score))
                # Match against target beat energy while strongly rewarding high-energy action
                energy_match = 1.0 / (0.35 + abs(base_e - target_energy))
                w = (base_e ** 2.1) * (0.65 + 0.35 * energy_match)
                weights.append(max(0.05, w))
            _, chosen_clip, c_in_val, c_out_val = random.choices(pool, weights=weights, k=1)[0]
        else:
            pool.sort(key=lambda x: x[0], reverse=True)
            _, chosen_clip, c_in_val, c_out_val = pool[0]
        return chosen_clip, c_in_val, c_out_val

    if full_candidates:
        chosen, c_in, c_out = _select_candidate(full_candidates)
        return chosen, round(c_in, 3), round(c_out, 3), True

    # Build high-energy B-roll candidates (from all uploaded videos) for outro/intro variety
    broll_candidates: List[Tuple[float, ClipAnalysis, float, float]] = []
    for c in usable_pool:
        if c.duration < seg_dur + 0.15:
            continue
        b_in, b_out, b_vis = _best_high_energy_broll_window(c, seg_dur)
        broll_candidates.append((b_vis, c, b_in, b_out))

    if extended_aligned_candidates:
        # If the only extended lined-up clip is the same clip we just used (or excluded on Re-Cut),
        # alternate with random B-roll scenes from the other videos so the outro stays dynamic!
        non_repeat_ext = [
            item for item in extended_aligned_candidates
            if item[1].clip_id != last_clip_id and item[1].clip_id != exclude_clip_id
        ]
        if non_repeat_ext:
            chosen, c_in, c_out = _select_candidate(non_repeat_ext)
            return chosen, round(c_in, 3), round(c_out, 3), True
        elif broll_candidates:
            chosen, c_in, c_out = _select_candidate(broll_candidates)
            return chosen, round(c_in, 3), round(c_out, 3), False
        else:
            chosen, c_in, c_out = _select_candidate(extended_aligned_candidates)
            return chosen, round(c_in, 3), round(c_out, 3), True

    if partial_candidates:
        chosen, c_in, c_out = _select_candidate(partial_candidates)
        return chosen, round(c_in, 3), round(c_out, 3), True

    if broll_candidates:
        chosen, c_in, c_out = _select_candidate(broll_candidates)
        return chosen, round(c_in, 3), round(c_out, 3), False

    return None


def choose_musical_effect(idx: int, cut_reason: str, is_808_cut: bool = False) -> str:
    """
    Keep all cuts clean ('none') by default — no motion blur or filter effects unless
    explicitly requested by the user.
    """
    return "none"


def recut_segments_preserving_timing(
    existing_segments: List[EditSegment],
    clips: List[ClipAnalysis],
) -> List[EditSegment]:
    """
    Maintain the exact [song_start, song_end] cut timings of `existing_segments`,
    but for each cut pick a random synced clip from all clips that line up at that
    timestamp (excluding the clip that the current cut came from whenever another
    aligned clip is available) and assign fresh musical effects!
    """
    recut_list: List[EditSegment] = []
    last_clip_id: Optional[str] = None

    for idx, seg in enumerate(existing_segments):
        if seg.cut_reason == "ai_transition":
            recut_list.append(seg)
            continue

        pick = pick_best_clip_for_window(
            s_start=seg.song_start,
            s_end=seg.song_end,
            clips=clips,
            last_clip_id=last_clip_id,
            exclude_clip_id=seg.clip_id,
            randomize=True,
            target_energy=1.10 if ("808" in (seg.cut_reason or "")) else float(seg.beat_energy or 0.80),
        )
        if pick is None:
            recut_list.append(seg)
            last_clip_id = seg.clip_id
            continue

        chosen, c_in, c_out, is_synced = pick
        last_clip_id = chosen.clip_id
        new_fx = choose_musical_effect(idx, seg.cut_reason, "808" in (seg.cut_reason or ""))

        recut_list.append(
            EditSegment(
                id=f"seg_{idx + 1}_{int(seg.song_start * 100)}_{random.randint(10, 99)}",
                index=idx,
                song_start=seg.song_start,
                song_end=seg.song_end,
                clip_id=chosen.clip_id,
                clip_filename=chosen.filename,
                clip_filepath=chosen.filepath,
                proxy_url=chosen.proxy_url,
                clip_in=c_in,
                clip_out=c_out,
                is_synced=is_synced,
                effect=new_fx,
                beat_energy=seg.beat_energy,
                cut_reason=seg.cut_reason,
            )
        )

    return recut_list


def snap_to_beat_or_808(
    t: float,
    beat_times: List[float],
    bass_drop_times: List[float],
    max_snap_sec: float = 0.22,
) -> Tuple[float, bool]:
    if bass_drop_times:
        nearest_808 = min(bass_drop_times, key=lambda b: abs(b - t))
        if abs(nearest_808 - t) <= max_snap_sec:
            return round(float(nearest_808), 3), True

    if beat_times:
        nearest_bt = min(beat_times, key=lambda b: abs(b - t))
        if abs(nearest_bt - t) <= max_snap_sec:
            return round(float(nearest_bt), 3), False

    return round(float(t), 3), False


def build_segments_by_mode(
    song_info: Dict[str, Any],
    clips: List[ClipAnalysis],
    cut_mode: str = "lyrics_808",
    lyrics_phrases: Optional[List[LyricPhrase]] = None,
    previous_segments: Optional[List[EditSegment]] = None,
) -> Tuple[List[EditSegment], float, float]:
    song_dur = song_info["duration"]
    beat_times = song_info.get("beat_times", [])
    bass_drop_times = song_info.get("bass_drop_times", [])
    phrases = lyrics_phrases if lyrics_phrases is not None else song_info.get("lyrics_phrases", [])

    synced_clips = [c for c in clips if c.is_synced_take]
    if not synced_clips and not clips:
        return [], 0.0, round(song_dur, 3)

    # Always cover the entire song (including intro and non-lyric outro up to song_dur)!
    render_start = 0.0
    render_end = round(song_dur, 3)

    cut_events: List[Tuple[float, str, bool]] = [(round(render_start, 3), "start", False)]

    if cut_mode in ("2s", "4s"):
        target_sec = 2.0 if cut_mode == "2s" else 4.0
        cur = render_start
        while cur < render_end - 0.4:
            ideal_next = cur + target_sec + random.uniform(-0.18, 0.18)
            if ideal_next >= render_end - 0.6:
                break
            snapped, is_808 = snap_to_beat_or_808(ideal_next, beat_times, bass_drop_times, max_snap_sec=0.32)
            if snapped > cur + 0.7:
                cut_events.append((snapped, "808_hit" if is_808 else f"{cut_mode}_beat", is_808))
                cur = snapped
            else:
                cur = ideal_next

    elif cut_mode == "beat_808":
        raw_events: List[Tuple[float, str, bool]] = []
        for bt in bass_drop_times:
            if render_start + 0.6 <= bt <= render_end - 0.5:
                raw_events.append((bt, "808_hit", True))
        for idx, bt in enumerate(beat_times):
            if idx % 4 == 0 and render_start + 0.6 <= bt <= render_end - 0.5:
                raw_events.append((bt, "bar_beat", False))
        raw_events.sort(key=lambda x: (x[0], 0 if x[2] else 1))
        for t, r_tag, is_808 in raw_events:
            if t - cut_events[-1][0] >= 0.95:
                cut_events.append((round(t, 3), r_tag, is_808))

    elif cut_mode == "lyrics_only":
        raw_events = []
        for ph in phrases:
            if render_start + 0.6 <= ph.start <= render_end - 0.5:
                snapped, is_808 = snap_to_beat_or_808(ph.start, beat_times, bass_drop_times, max_snap_sec=0.20)
                raw_events.append((snapped, "lyric_line", is_808))
            if render_start + 0.6 <= ph.end <= render_end - 0.5 and (ph.end - ph.start) >= 1.4:
                snapped_e, is_808_e = snap_to_beat_or_808(ph.end, beat_times, bass_drop_times, max_snap_sec=0.20)
                raw_events.append((snapped_e, "lyric_end", is_808_e))
        raw_events.sort(key=lambda x: x[0])
        for t, r_tag, is_808 in raw_events:
            if t - cut_events[-1][0] >= 0.95:
                cut_events.append((round(t, 3), r_tag, is_808))

    else:
        candidate_events: List[Tuple[float, str, bool, int]] = []
        for ph in phrases:
            if render_start + 0.5 <= ph.start <= render_end - 0.4:
                snapped, is_808 = snap_to_beat_or_808(ph.start, beat_times, bass_drop_times, max_snap_sec=0.22)
                tag = "lyric+808" if is_808 else "lyric_line"
                candidate_events.append((snapped, tag, is_808, 1))
            if render_start + 0.5 <= ph.end <= render_end - 0.4:
                snapped_e, is_808_e = snap_to_beat_or_808(ph.end, beat_times, bass_drop_times, max_snap_sec=0.22)
                tag_e = "lyric+808" if is_808_e else "lyric_line"
                candidate_events.append((snapped_e, tag_e, is_808_e, 2))

        for b808 in bass_drop_times:
            if render_start + 0.5 <= b808 <= render_end - 0.4:
                candidate_events.append((round(float(b808), 3), "808_hit", True, 2))

        candidate_events.sort(key=lambda x: (x[0], x[3]))
        for t, tag, is_808, _ in candidate_events:
            prev_t, prev_tag, prev_808 = cut_events[-1]
            if abs(t - prev_t) <= 0.30:
                if is_808 and not prev_808:
                    cut_events[-1] = (prev_t, "lyric+808", True)
                continue
            if t - prev_t >= 0.90:
                cut_events.append((round(t, 3), tag, is_808))

    filled_events: List[Tuple[float, str, bool]] = [cut_events[0]]
    for ev in cut_events[1:] + [(round(render_end, 3), "end", False)]:
        prev_t = filled_events[-1][0]
        gap = ev[0] - prev_t
        if gap > 2.8:
            cur_fill = prev_t + 1.9
            while cur_fill < ev[0] - 0.9:
                snapped_f, is_808_f = snap_to_beat_or_808(cur_fill, beat_times, bass_drop_times, max_snap_sec=0.35)
                if snapped_f > filled_events[-1][0] + 0.85 and snapped_f < ev[0] - 0.75:
                    filled_events.append((snapped_f, "808_hit" if is_808_f else "beat_fill", is_808_f))
                    cur_fill = snapped_f + 1.9
                else:
                    cur_fill += 1.5
        if ev[1] != "end":
            filled_events.append(ev)

    if filled_events[-1][0] < render_end - 0.15:
        filled_events.append((round(render_end, 3), "end", False))

    segments: List[EditSegment] = []
    last_clip_id: Optional[str] = None

    for idx in range(len(filled_events) - 1):
        s_start, reason_tag, is_808_cut = filled_events[idx]
        s_end = filled_events[idx + 1][0]
        if s_end - s_start < 0.15:
            continue

        mid_t = 0.5 * (s_start + s_end)
        prev_clip_at_t: Optional[str] = None
        if previous_segments:
            for pseg in previous_segments:
                if pseg.song_start <= mid_t <= pseg.song_end:
                    prev_clip_at_t = pseg.clip_id
                    break

        pick = pick_best_clip_for_window(
            s_start,
            s_end,
            clips,
            last_clip_id=last_clip_id,
            exclude_clip_id=prev_clip_at_t,
            randomize=True,
            target_energy=1.10 if is_808_cut else 0.80,
        )
        if pick is None:
            continue
        chosen, c_in, c_out, is_synced = pick
        last_clip_id = chosen.clip_id

        actual_reason = reason_tag if idx > 0 else "lyric+808"
        effect = choose_musical_effect(idx, actual_reason, is_808_cut)

        segments.append(
            EditSegment(
                id=f"seg_{len(segments) + 1}_{int(s_start * 100)}",
                index=len(segments),
                song_start=round(s_start, 3),
                song_end=round(s_end, 3),
                clip_id=chosen.clip_id,
                clip_filename=chosen.filename,
                clip_filepath=chosen.filepath,
                proxy_url=chosen.proxy_url,
                clip_in=c_in,
                clip_out=c_out,
                is_synced=is_synced,
                effect=effect,
                beat_energy=0.9 if is_808_cut else 0.7,
                cut_reason=actual_reason,
            )
        )

    return segments, round(render_start, 3), round(render_end, 3)


def build_initial_4s_segments(
    song_info: Dict[str, Any],
    clips: List[ClipAnalysis],
    target_chunk_sec: float = 2.0,
) -> Tuple[List[EditSegment], float, float]:
    mode = "2s" if target_chunk_sec <= 2.5 else "4s"
    return build_segments_by_mode(song_info, clips, cut_mode=mode)


def sync_single_clip(
    cpath: str,
    clip_id: str,
    color: str,
    song_info: Dict[str, Any],
    master_wav_norm: str,
    proxy_dir: Path,
    tmpdir: str,
    sync_threshold: float = 3.8,
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> ClipAnalysis:
    """
    Worker Agent task for a single video clip:
      - Runs Hardware Proxy encoding, Audio WAV extraction, and 4Hz Visual Energy scoring
        concurrently via sub-threads/FFmpeg subprocesses!
      - Then runs `sync_clip_to_master` (Whisper Lyric + Audalign + Acoustic Subregion).
    """
    sr = song_info["sr"]
    hop_length = song_info["hop_length"]
    song_dur = song_info["duration"]
    fname = os.path.basename(cpath)

    if progress_cb:
        progress_cb("⚡ Probing, Hardware Proxy & Audio Extraction...", 15)

    meta = probe_video(cpath)
    wav_tmp = os.path.join(tmpdir, f"{clip_id}.wav")

    # Run Proxy Generation, Audio Extraction, and Visual Motion Scoring in parallel!
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as io_pool:
        fut_proxy = io_pool.submit(ensure_browser_proxy, cpath, proxy_dir, clip_id)
        fut_audio = io_pool.submit(extract_audio_to_wav, cpath, wav_tmp, sr)
        fut_visual = io_pool.submit(analyze_video_visuals, cpath, meta["duration"])

        proxy_name = fut_proxy.result()
        has_audio = fut_audio.result()

        if has_audio:
            offset_sec, conf, u_start, u_end, sync_method, matched_lyrics = sync_clip_to_master(
                master_wav_path=master_wav_norm,
                master_y=song_info["y"],
                master_filt=song_info["master_filt"],
                master_onset=song_info["master_onset"],
                master_S_white=song_info["master_S_white"],
                master_hashes=song_info["master_hashes"],
                master_words=song_info["lyrics_words"],
                clip_wav_path=wav_tmp,
                clip_duration=meta["duration"],
                song_duration=song_dur,
                sr=sr,
                hop_length=hop_length,
                progress_cb=progress_cb,
            )
        else:
            offset_sec, conf, u_start, u_end, sync_method, matched_lyrics = (
                0.0, 0.0, 0.0, meta["duration"], "no_song", ""
            )

        energy_curve = fut_visual.result()

    active_s_start = round(max(0.0, offset_sec + u_start), 3)
    active_s_end = round(min(song_dur, offset_sec + u_end), 3)
    is_synced = (
        sync_method != "no_song"
        and conf >= sync_threshold
        and (u_end - u_start) >= 0.8
        and (active_s_end - active_s_start) >= 0.8
    )

    if not is_synced:
        offset_sec = 0.0
        active_s_start = 0.0
        active_s_end = 0.0
        sync_method = "no_song"

    if progress_cb:
        status_msg = (
            f"✅ Synced ({active_s_start:.1f}s–{active_s_end:.1f}s)"
            if is_synced
            else "⚠️ No Song Detected (Ignored)"
        )
        progress_cb(status_msg, 100)

    return ClipAnalysis(
        clip_id=clip_id,
        filename=fname,
        filepath=cpath,
        proxy_url=f"/proxies/{proxy_name}",
        duration=round(meta["duration"], 3),
        width=meta["width"],
        height=meta["height"],
        fps=round(meta["fps"], 2),
        song_offset_sec=round(offset_sec, 3),
        usable_start_sec=round(u_start, 3),
        usable_end_sec=round(u_end, 3),
        active_song_start=active_s_start,
        active_song_end=active_s_end,
        song_end_sec=active_s_end,
        sync_confidence=round(conf, 2),
        sync_method=sync_method,
        matched_lyrics=matched_lyrics,
        is_synced_take=is_synced,
        energy_curve=energy_curve,
        mean_energy=round(float(np.mean(energy_curve)), 3),
        color=color,
    )


def init_song_only_project(song_path: str, song_url: str) -> ProjectState:
    song_info = analyze_song(song_path, transcribe_lyrics=True)
    song_dur = song_info["duration"]
    return ProjectState(
        project_id=f"proj_{int(os.path.getmtime(song_path))}",
        song_filename=os.path.basename(song_path),
        song_filepath=song_path,
        song_url=song_url,
        song_duration=round(song_dur, 3),
        bpm=song_info["bpm"],
        render_start_sec=0.0,
        render_end_sec=round(song_dur, 3),
        beat_times=song_info["beat_times"],
        bass_drop_times=song_info["bass_drop_times"],
        cut_mode="lyrics_808",
        lyrics_words=song_info["lyrics_words"],
        lyrics_phrases=song_info["lyrics_phrases"],
        clips=[],
        segments=[],
    )


def analyze_and_sync_project(
    song_path: str,
    clip_paths: List[str],
    proxy_dir: Path,
    song_url: str,
    sync_threshold: float = 3.8,
    cut_mode: str = "lyrics_808",
) -> ProjectState:
    """
    Parallel Multi-Agent Project Sync:
    Spawns up to 6 concurrent Clip Sync Agents (`ThreadPoolExecutor`) so all uploaded clips
    are proxied, transcribed, and aligned simultaneously!
    """
    song_info = analyze_song(song_path, transcribe_lyrics=True)
    sr = song_info["sr"]
    song_dur = song_info["duration"]

    raw_analyses: List[ClipAnalysis] = []

    with tempfile.TemporaryDirectory(prefix="clipper_sync_") as tmpdir:
        master_wav_norm = os.path.join(tmpdir, "master_22k.wav")
        extract_audio_to_wav(song_path, master_wav_norm, sr=sr)

        max_workers = min(6, max(1, len(clip_paths)))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = []
            for idx, cpath in enumerate(clip_paths):
                raw_id = f"clip_{idx + 1}_{int(os.path.getmtime(cpath)) % 10000}"
                futures.append(
                    pool.submit(
                        sync_single_clip,
                        cpath=cpath,
                        clip_id=raw_id,
                        color=CLIP_PALETTE[idx % len(CLIP_PALETTE)],
                        song_info=song_info,
                        master_wav_norm=master_wav_norm,
                        proxy_dir=proxy_dir,
                        tmpdir=tmpdir,
                        sync_threshold=sync_threshold,
                    )
                )
            for fut in concurrent.futures.as_completed(futures):
                raw_analyses.append(fut.result())

    raw_analyses.sort(key=lambda c: (0 if c.is_synced_take else 1, c.active_song_start, c.filename))
    for idx, c in enumerate(raw_analyses):
        c.color = CLIP_PALETTE[idx % len(CLIP_PALETTE)]

    segments, r_start, r_end = build_segments_by_mode(
        song_info, raw_analyses, cut_mode=cut_mode, lyrics_phrases=song_info["lyrics_phrases"]
    )

    return ProjectState(
        project_id=f"proj_{int(os.path.getmtime(song_path))}",
        song_filename=os.path.basename(song_path),
        song_filepath=song_path,
        song_url=song_url,
        song_duration=round(song_dur, 3),
        bpm=song_info["bpm"],
        render_start_sec=r_start,
        render_end_sec=r_end,
        beat_times=song_info["beat_times"],
        bass_drop_times=song_info["bass_drop_times"],
        cut_mode=cut_mode,
        lyrics_words=song_info["lyrics_words"],
        lyrics_phrases=song_info["lyrics_phrases"],
        clips=raw_analyses,
        segments=segments,
    )


_CLIP_COLOR_STATS_CACHE: Dict[str, Tuple[float, float]] = {}


def compute_clip_color_match_filter(clip_filepath: str, sample_sec: float = 1.5) -> str:
    """
    Measures a clip's mean luminance and R-B color warmth bias once (cached per file)
    and returns an FFmpeg filter (`eq` + `colorbalance`) that normalizes indoor tungsten
    warmth and extreme dark night interiors toward a balanced cinema reference.
    """
    if not clip_filepath or not os.path.exists(clip_filepath):
        return ""
    if clip_filepath not in _CLIP_COLOR_STATS_CACHE:
        try:
            cap = cv2.VideoCapture(clip_filepath)
            cap.set(cv2.CAP_PROP_POS_MSEC, max(0.2, sample_sec) * 1000.0)
            ok, frame = cap.read()
            cap.release()
            if ok and frame is not None:
                b, g, r = [float(np.mean(frame[:, :, i])) for i in range(3)]
                rb_bias = (r - b) / max(15.0, g)
                luma = 0.299 * r + 0.587 * g + 0.114 * b
                _CLIP_COLOR_STATS_CACHE[clip_filepath] = (luma, rb_bias)
            else:
                _CLIP_COLOR_STATS_CACHE[clip_filepath] = (64.0, 0.22)
        except Exception:
            _CLIP_COLOR_STATS_CACHE[clip_filepath] = (64.0, 0.22)

    luma, rb_bias = _CLIP_COLOR_STATS_CACHE[clip_filepath]
    target_luma = 64.0
    target_rb = 0.22

    gamma = float(np.clip((target_luma / max(18.0, luma)) ** 0.28, 0.86, 1.22))
    rb_diff = rb_bias - target_rb
    rm = float(np.clip(-rb_diff * 0.22, -0.08, 0.08))
    bm = float(np.clip(rb_diff * 0.22, -0.08, 0.08))

    parts: List[str] = []
    if abs(gamma - 1.0) > 0.03:
        parts.append(f"eq=gamma={gamma:.3f}")
    if abs(rm) > 0.015 or abs(bm) > 0.015:
        parts.append(f"colorbalance=rm={rm:.3f}:bm={bm:.3f}:rh={rm*0.6:.3f}:bh={bm*0.6:.3f}")
    return ",".join(parts)


def build_master_grade_and_enhance_filter(
    color_grade: str = "none",
    quality_mode: str = "cas_crisp",
    clip_filepath: str = "",
    sample_sec: float = 1.5,
    is_ai_transition: bool = False,
) -> str:
    """
    Combines:
      1. Automatic Multi-Camera Exposure & White-Balance Matching
      2. 3D Temporal Low-Light Denoising (`hqdn3d`)
      3. Master Cinema Color Grade (`kodak_2383`, `night_trap`, `bleach_bypass`, `warm_vintage`)
      4. AMD FidelityFX Contrast Adaptive Sharpening (`cas`) + Micro-Detail Recovery
    """
    chain: List[str] = []

    # 1. Temporal 3D low-light denoise first (before sharpening or contrast curves)
    if quality_mode == "ultra_cinema":
        chain.append("hqdn3d=3.5:2.5:4.5:3.5")
    elif quality_mode == "cas_crisp":
        chain.append("hqdn3d=2.4:1.8:3.2:2.4")

    # 2. Multi-camera shot matching (normalizes warm indoor vs cool dark car shots)
    if color_grade and color_grade != "none" and not is_ai_transition:
        match_f = compute_clip_color_match_filter(clip_filepath, sample_sec)
        if match_f:
            chain.append(match_f)

    # 3. Master Cinema Look / Film Emulation
    if color_grade == "kodak_2383":
        chain.append(
            "colorbalance=rs=-0.03:gs=0.0:bs=0.05:rm=0.02:gm=0.01:bm=-0.02:rh=0.06:gh=0.03:bh=-0.04,"
            "curves=m=0/0 0.18/0.14 0.5/0.52 0.82/0.87 1/0.98,"
            "vibrance=intensity=0.12"
        )
    elif color_grade == "night_trap":
        chain.append(
            "colorbalance=rs=-0.06:gs=-0.01:bs=0.11:rm=0.01:gm=0.0:bm=0.02:rh=0.08:gh=0.03:bh=-0.06,"
            "curves=m=0/0 0.2/0.15 0.5/0.5 0.8/0.86 1/1,"
            "vibrance=intensity=0.18"
        )
    elif color_grade == "bleach_bypass":
        chain.append(
            "vibrance=intensity=-0.42,"
            "eq=contrast=1.22:brightness=-0.02:saturation=0.72,"
            "colorbalance=rs=-0.02:gs=0.0:bs=0.04:rh=0.04:gh=0.04:bh=0.02"
        )
    elif color_grade == "warm_vintage":
        chain.append(
            "colorbalance=rs=0.04:gs=0.01:bs=-0.04:rm=0.04:gm=0.02:bm=-0.03:rh=0.07:gh=0.04:bh=-0.05,"
            "curves=m=0/0.03 0.22/0.19 0.5/0.52 0.82/0.86 1/0.97"
        )

    # 4. AMD FidelityFX Contrast Adaptive Sharpening (CAS) + AI transition upscale crispness
    if quality_mode == "ultra_cinema":
        cas_val = 0.68 if is_ai_transition else 0.58
        chain.append(f"cas={cas_val:.2f},unsharp=5:5:0.42:3:3:0.15")
    elif quality_mode == "cas_crisp":
        cas_val = 0.55 if is_ai_transition else 0.44
        chain.append(f"cas={cas_val:.2f}")

    return ",".join(chain)


def _render_single_segment_worker(
    ffmpeg_bin: str,
    idx: int,
    seg: EditSegment,
    tmpdir: str,
    target_w: int,
    target_h: int,
    fps: int,
    actual_start: float = 0.0,
    color_grade: str = "none",
    quality_mode: str = "cas_crisp",
) -> Tuple[int, str]:
    """Render Agent worker for a single timeline segment using Apple Silicon hardware encoding."""
    seg_dur = max(0.08, seg.song_end - seg.song_start)
    f_start = int(round((seg.song_start - actual_start) * fps))
    f_end = int(round((seg.song_end - actual_start) * fps))
    exact_frames = max(1, f_end - f_start)
    seg_out = os.path.join(tmpdir, f"seg_{idx:04d}.mp4")

    if (seg.effect or "").startswith("motm_"):
        from vfx_motm_engine import render_motm_vfx_segment
        ok_motm = render_motm_vfx_segment(
            ffmpeg_bin=ffmpeg_bin,
            seg=seg,
            seg_out=seg_out,
            target_w=target_w,
            target_h=target_h,
            fps=fps,
            exact_frames=exact_frames,
        )
        if ok_motm:
            return idx, seg_out

    base_scale = (
        f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
        f"crop={target_w}:{target_h}"
    )

    if seg.effect == "punch_zoom":
        zw, zh = int(target_w * 1.12), int(target_h * 1.12)
        fx_filter = (
            f"scale={zw}:{zh}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},eq=contrast=1.06:saturation=1.08"
        )
    elif seg.effect == "zoom_shake":
        zw, zh = int(target_w * 1.16), int(target_h * 1.16)
        fx_filter = (
            f"scale={zw}:{zh}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h}:x='(iw-ow)/2+sin(n*1.7)*18':y='(ih-oh)/2+cos(n*2.3)*18',"
            f"eq=contrast=1.1:brightness=0.03:saturation=1.12"
        )
    elif seg.effect == "flash_in":
        zw, zh = int(target_w * 1.06), int(target_h * 1.06)
        fx_filter = (
            f"scale={zw}:{zh}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},fade=t=in:st=0:d=0.12:color=white"
        )
    elif seg.effect == "whip_pan":
        zw, zh = int(target_w * 1.24), int(target_h * 1.08)
        fx_filter = (
            f"scale={zw}:{zh}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h}:x='(iw-ow)/2 + (iw-ow)/2*exp(-n/3.5)':y='(ih-oh)/2',"
            f"eq=contrast=1.08:saturation=1.1"
        )
    elif seg.effect == "rgb_glitch":
        fx_filter = (
            f"{base_scale},"
            f"rgbashift=rh=-10:bh=10:rv=4:bv=-4:edge=wrap,"
            f"eq=contrast=1.14:saturation=1.22"
        )
    elif seg.effect == "film_burn":
        fx_filter = (
            f"{base_scale},"
            f"colorbalance=rs=0.18:gs=0.04:bs=-0.12:rh=0.22:gh=0.08:bh=-0.10,"
            f"fade=t=in:st=0:d=0.14:color=0xff5500,eq=contrast=1.08:saturation=1.18"
        )
    elif seg.effect == "bw_contrast":
        fx_filter = (
            f"{base_scale},hue=s=0,eq=contrast=1.35:brightness=0.02"
        )
    elif seg.effect == "pixel_in":
        fx_filter = (
            f"{base_scale},fade=t=in:st=0:d=0.12:color=black,eq=contrast=1.10"
        )
    else:
        fx_filter = base_scale

    master_grade_vf = build_master_grade_and_enhance_filter(
        color_grade=color_grade,
        quality_mode=quality_mode,
        clip_filepath=seg.clip_filepath,
        sample_sec=max(0.5, seg.clip_in + 0.5),
        is_ai_transition=(seg.cut_reason == "ai_transition"),
    )
    grade_part = f",{master_grade_vf}" if master_grade_vf else ""
    vf = f"{fx_filter}{grade_part},fps={fps},tpad=stop_mode=clone:stop_duration=1.0,format=yuv420p,setsar=1"

    hw_cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", f"{max(0.0, seg.clip_in):.4f}",
        "-i", seg.clip_filepath,
        "-an",
        "-vf", vf,
        "-frames:v", str(exact_frames),
        "-c:v", "h264_videotoolbox",
        "-b:v", "12M",
        "-r", str(fps),
        seg_out,
    ]
    res = subprocess.run(hw_cmd, capture_output=True)
    if res.returncode != 0 or not os.path.exists(seg_out):
        sw_cmd = [
            ffmpeg_bin,
            "-y",
            "-ss", f"{max(0.0, seg.clip_in):.4f}",
            "-i", seg.clip_filepath,
            "-an",
            "-vf", vf,
            "-frames:v", str(exact_frames),
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "20",
            "-r", str(fps),
            seg_out,
        ]
        subprocess.run(sw_cmd, capture_output=True, check=True)

    return idx, seg_out


def render_triller_video(
    song_path: str,
    segments: List[EditSegment],
    render_start: float,
    render_end: float,
    output_path: str,
    target_w: int = 1920,
    target_h: int = 1080,
    fps: int = 30,
    progress_cb: Optional[Callable[[str, int], None]] = None,
    color_grade: str = "none",
    quality_mode: str = "cas_crisp",
) -> str:
    """
    Parallel Multi-Agent Video Exporter:
    Spawns up to 6 concurrent FFmpeg hardware render agents to encode all timeline segments
    in parallel, then concatenates and muxes the master song.
    """
    ffmpeg_bin, _ = ensure_ffmpeg()
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    ordered_segs = sorted(segments, key=lambda s: s.song_start)
    if not ordered_segs:
        raise ValueError("No segments to render.")

    actual_start = ordered_segs[0].song_start
    actual_end = ordered_segs[-1].song_end
    total_segs = len(ordered_segs)

    with tempfile.TemporaryDirectory(prefix="clipper_render_") as tmpdir:
        concat_list_path = os.path.join(tmpdir, "concat.txt")
        results_by_idx: Dict[int, str] = {}
        completed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            futs = [
                pool.submit(
                    _render_single_segment_worker,
                    ffmpeg_bin,
                    idx,
                    seg,
                    tmpdir,
                    target_w,
                    target_h,
                    fps,
                    actual_start,
                    color_grade,
                    quality_mode,
                )
                for idx, seg in enumerate(ordered_segs)
            ]
            for fut in concurrent.futures.as_completed(futs):
                idx, seg_out = fut.result()
                results_by_idx[idx] = seg_out
                completed += 1
                if progress_cb:
                    pct = int((completed / total_segs) * 90)
                    progress_cb(f"🎬 Rendered segment {completed}/{total_segs}", pct)

        with open(concat_list_path, "w", encoding="utf-8") as f:
            for i in range(total_segs):
                f.write(f"file '{results_by_idx[i]}'\n")

        if progress_cb:
            progress_cb("🎵 Muxing Master Song Audio...", 95)

        total_dur = max(0.5, actual_end - actual_start)
        final_cmd = [
            ffmpeg_bin,
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_list_path,
            "-ss", f"{actual_start:.4f}",
            "-t", f"{total_dur:.4f}",
            "-i", song_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-shortest",
            "-movflags", "+faststart",
            output_path,
        ]
        subprocess.run(final_cmd, capture_output=True, check=True)

    if progress_cb:
        progress_cb("✅ Export Complete!", 100)

    return output_path


def run_clipper_pipeline(
    song_path: str,
    clip_paths: List[str],
    output_path: str,
    pace: str = "triller",
    start_override: Optional[float] = None,
    duration_override: Optional[float] = None,
    sync_threshold: float = 3.8,
) -> ProjectState:
    proxy_dir = Path(output_path).resolve().parent / "proxies"
    state = analyze_and_sync_project(
        song_path=song_path,
        clip_paths=clip_paths,
        proxy_dir=proxy_dir,
        song_url="",
        sync_threshold=sync_threshold,
        cut_mode="lyrics_808",
    )
    render_triller_video(
        song_path=song_path,
        segments=state.segments,
        render_start=state.render_start_sec,
        render_end=state.render_end_sec,
        output_path=output_path,
    )
    return state


def extract_frame_at_timestamp(
    video_path: str,
    timestamp_sec: float,
    output_png: str,
    width: int = 1280,
    height: int = 720,
) -> str:
    """
    Extract a single 16:9 frame at `timestamp_sec` from `video_path` and save as `output_png`.
    Used to grab the exact last frame of Cut N and exact first frame of Cut N+1.
    """
    ffmpeg_bin, _ = ensure_ffmpeg()
    os.makedirs(os.path.dirname(os.path.abspath(output_png)), exist_ok=True)
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1"
    )
    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss", f"{max(0.0, timestamp_sec):.4f}",
        "-i", video_path,
        "-frames:v", "1",
        "-vf", vf,
        output_png,
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_png


def generate_ai_transition_between_frames(
    frame_a_path: str,
    frame_b_path: str,
    output_mp4: str,
    duration_sec: float = 0.55,
    fps: int = 30,
    engine: str = "optical_morph",
    prompt: str = "Smooth cinematic morph transition between two music video scenes",
    api_key: str = "",
    progress_cb: Optional[Callable[[str, int], None]] = None,
) -> Tuple[str, str]:
    """
    Synthesizes an AI transition video bridging `frame_a_path` (last frame of Cut N)
    to `frame_b_path` (first frame of Cut N+1).
    Supported engines:
      1. `optical_morph`: Local Open-Source Bidirectional Dense Optical Flow (Farnebäck Pyramid)
         + S-curve mesh warping + directional velocity blur (0 API keys required, ~1.5s).
      2. `datamosh_morph`: Local Open-Source Macroblock Motion-Vector Datamosh + RGB Phase Smear.
      3. `whip_warp_morph`: Local Open-Source Radial Zoom-Whip + Optical Flow Morph.
      4. `wan_flf2v`: Generative AI First-Last-Frame-to-Video (Wan2.1-FLF2V via Fal.ai / Higgsfield-style
         cloud endpoint if `api_key` or `FAL_KEY` is provided; otherwise falls back to enhanced
         `optical_morph` locally).
    Returns `(output_mp4, used_engine_label)`.
    """
    import base64
    import urllib.request

    ffmpeg_bin, _ = ensure_ffmpeg()
    os.makedirs(os.path.dirname(os.path.abspath(output_mp4)), exist_ok=True)

    # 1. Official Higgsfield AI SDK (`higgsfield-client`) — DoP, Kling Start/End Frame, or Higgsfield Agent
    hf_key = (
        api_key
        or os.environ.get("HF_KEY", "")
        or (
            f"{os.environ.get('HF_API_KEY')}:{os.environ.get('HF_API_SECRET')}"
            if os.environ.get("HF_API_KEY") and os.environ.get("HF_API_SECRET")
            else ""
        )
        or (
            f"{os.environ.get('HIGGSFIELD_API_KEY')}:{os.environ.get('HIGGSFIELD_SECRET')}"
            if os.environ.get("HIGGSFIELD_API_KEY") and os.environ.get("HIGGSFIELD_SECRET")
            else ""
        )
    ).strip()

    if engine.startswith("higgsfield_") and hf_key:
        import higgsfield_client

        if progress_cb:
            progress_cb("📤 Uploading Start Frame (Cut A) & End Frame (Cut B) to Higgsfield Cloud...", 20)

        hf_client = higgsfield_client.SyncClient(api_key=hf_key)
        url_a = hf_client.upload_file(frame_a_path)
        url_b = hf_client.upload_file(frame_b_path)

        video_url = None
        if engine == "higgsfield_mcp":
            from higgsfield_mcp_client import HiggsfieldMCPClient
            import re

            if progress_cb:
                progress_cb("🔗 Calling Higgsfield MCP (https://mcp.higgsfield.ai/mcp) for Start➜End Frame...", 45)
            mcp = HiggsfieldMCPClient()
            tools = mcp.list_tools()
            # Choose best video/image-to-video MCP tool discovered on the server
            chosen_tool = None
            for t in tools:
                tname = (t.get("name") or "").lower()
                if "video" in tname or "kling" in tname or "wan" in tname or "generate" in tname:
                    chosen_tool = t.get("name")
                    break
            if not chosen_tool and tools:
                chosen_tool = tools[0].get("name")
            if not chosen_tool:
                raise RuntimeError("No tools returned by https://mcp.higgsfield.ai/mcp")
            mcp_res = mcp.call_tool(
                chosen_tool,
                {
                    "prompt": prompt or "The subject/car seamlessly morphs into the next scene, cinematic camera motion",
                    "image_url": url_a,
                    "end_image_url": url_b,
                    "last_image_url": url_b,
                },
            )
            raw_str = json.dumps(mcp_res)
            mp4_matches = re.findall(r'https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*', raw_str)
            if mp4_matches:
                video_url = mp4_matches[0]
        elif engine == "higgsfield_agent":
            if progress_cb:
                progress_cb("🤖 Running Higgsfield AI Director Agent Session (Start ➜ End Frame)...", 50)
            session = hf_client.agents.sessions.create()
            agent_prompt = (
                f"Create a seamless music video transition starting at start_frame {url_a} "
                f"and ending at end_frame {url_b}. Direction: {prompt}"
            )
            turn = hf_client.agents.sessions.run(session.session_id, agent_prompt)
            if turn and turn.message and getattr(turn.message, "media", None):
                for m in turn.message.media:
                    if getattr(m, "url", None):
                        video_url = m.url
                        break
        else:
            endpoint_map = {
                "higgsfield_kling": "kling-video/v3.0/pro/image-to-video",
                "higgsfield_wan": "alibaba/wan-3.0/image-to-video",
                "higgsfield_seedance": "bytedance/seedance-2.5/image-to-video",
                "higgsfield_dop": "higgsfield-ai/dop/standard",
            }
            min_dur_map = {
                "higgsfield_kling": 3,
                "higgsfield_wan": 2,
                "higgsfield_seedance": 4,
            }
            app_endpoint = endpoint_map.get(engine, "kling-video/v3.0/pro/image-to-video")
            if progress_cb:
                progress_cb(f"🎬 Generating Higgsfield ({app_endpoint}) Start-to-End Frame Morph...", 50)
            req_args: Dict[str, Any] = {
                "prompt": prompt or "The subject/car seamlessly morphs into the next scene, cinematic camera motion",
                "image_url": url_a,
                "end_image_url": url_b,
                "last_image_url": url_b,
                "tail_image_url": url_b,
            }
            if engine in min_dur_map:
                req_args["duration"] = min_dur_map[engine]
            res_data = hf_client.subscribe(
                app_endpoint,
                arguments=req_args,
            )
            if isinstance(res_data, dict):
                videos_list = res_data.get("videos") or []
                if videos_list and isinstance(videos_list[0], dict):
                    video_url = videos_list[0].get("url")
                elif isinstance(res_data.get("video"), dict):
                    video_url = res_data["video"].get("url")
                else:
                    video_url = res_data.get("video_url") or res_data.get("url")

        if not video_url:
            raise RuntimeError("Higgsfield did not return a video URL. Check your model/credits or HF_KEY.")

        if progress_cb:
            progress_cb("⬇️ Downloading & Retiming Higgsfield AI Transition to lock song sync...", 85)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_dl:
            urllib.request.urlretrieve(video_url, tmp_dl.name)
            probe = probe_video(tmp_dl.name)
            pts_ratio = duration_sec / max(0.1, probe["duration"])
            exact_trans_frames = max(2, int(round(duration_sec * fps)))
            cmd = [
                ffmpeg_bin,
                "-y",
                "-i", tmp_dl.name,
                "-an",
                "-vf", f"setpts={pts_ratio:.5f}*PTS,scale=1280:720,fps={fps},tpad=stop_mode=clone:stop_duration=0.5,format=yuv420p",
                "-frames:v", str(exact_trans_frames),
                "-r", str(fps),
                "-c:v", "h264_videotoolbox",
                "-b:v", "8M",
                output_mp4,
            ]
            subprocess.run(cmd, capture_output=True, check=True)
            os.unlink(tmp_dl.name)
        if progress_cb:
            progress_cb("✨ Higgsfield AI Transition Complete!", 100)
        return output_mp4, f"Higgsfield AI ({engine})"

    # Optional Cloud Generative FLF2V (Wan2.1-FLF2V via Fal.ai) if requested and key exists
    effective_key = (api_key or os.environ.get("FAL_KEY", "")).strip()
    if engine == "wan_flf2v" and effective_key:
        try:
            if progress_cb:
                progress_cb("🌐 Uploading Frame A & Frame B to Wan2.1-FLF2V Cloud AI...", 25)
            with open(frame_a_path, "rb") as fa, open(frame_b_path, "rb") as fb:
                b64_a = "data:image/png;base64," + base64.b64encode(fa.read()).decode("ascii")
                b64_b = "data:image/png;base64," + base64.b64encode(fb.read()).decode("ascii")

            payload = json.dumps({
                "prompt": prompt or "Smooth cinematic camera morph transition between two music video takes",
                "start_image_url": b64_a,
                "end_image_url": b64_b,
                "num_frames": 33,
                "frames_per_second": 24,
            }).encode("utf-8")

            req = urllib.request.Request(
                "https://fal.run/fal-ai/wan-flf2v",
                data=payload,
                headers={
                    "Authorization": f"Key {effective_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            if progress_cb:
                progress_cb("🤖 Wan2.1-FLF2V Diffusion Transformer generating transition frames...", 55)
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
            video_url = (resp_data.get("video") or {}).get("url") or resp_data.get("video_url")
            if video_url:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_dl:
                    urllib.request.urlretrieve(video_url, tmp_dl.name)
                    # Retime to exact `duration_sec` so song lyric sync stays 100% locked
                    probe = probe_video(tmp_dl.name)
                    pts_ratio = max(0.15, duration_sec / max(0.2, probe["duration"]))
                    cmd = [
                        ffmpeg_bin,
                        "-y",
                        "-i", tmp_dl.name,
                        "-an",
                        "-vf", f"setpts={pts_ratio:.4f}*PTS,scale=1280:720,fps={fps},format=yuv420p",
                        "-t", f"{duration_sec:.4f}",
                        "-c:v", "h264_videotoolbox",
                        "-b:v", "6M",
                        output_mp4,
                    ]
                    subprocess.run(cmd, capture_output=True, check=True)
                    os.unlink(tmp_dl.name)
                if progress_cb:
                    progress_cb("✨ Wan2.1-FLF2V AI Transition Complete!", 100)
                return output_mp4, "Wan2.1-FLF2V (Generative AI)"
        except Exception:
            # Gracefully fall back to local open-source neural/optical flow synthesis
            pass

    if progress_cb:
        progress_cb("🧠 Computing Bidirectional Pyramidal Optical Flow between Frame A & Frame B...", 30)

    img_a = cv2.imread(frame_a_path)
    img_b = cv2.imread(frame_b_path)
    if img_a is None or img_b is None:
        raise ValueError("Could not read extracted boundary frames for AI transition.")

    h, w = 720, 1280
    img_a = cv2.resize(img_a, (w, h), interpolation=cv2.INTER_AREA)
    img_b = cv2.resize(img_b, (w, h), interpolation=cv2.INTER_AREA)

    # Compute dense optical flow at 640x360 for speed, then scale flow vectors x2 to 1280x720
    fw, fh = 640, 360
    gray_a = cv2.cvtColor(cv2.resize(img_a, (fw, fh)), cv2.COLOR_BGR2GRAY)
    gray_b = cv2.cvtColor(cv2.resize(img_b, (fw, fh)), cv2.COLOR_BGR2GRAY)

    flow_ab_small = cv2.calcOpticalFlowFarneback(
        gray_a, gray_b, None, pyr_scale=0.5, levels=5, winsize=21, iterations=4, poly_n=7, poly_sigma=1.5, flags=0
    )
    flow_ba_small = cv2.calcOpticalFlowFarneback(
        gray_b, gray_a, None, pyr_scale=0.5, levels=5, winsize=21, iterations=4, poly_n=7, poly_sigma=1.5, flags=0
    )

    flow_ab = cv2.resize(flow_ab_small, (w, h), interpolation=cv2.INTER_LINEAR) * 2.0
    flow_ba = cv2.resize(flow_ba_small, (w, h), interpolation=cv2.INTER_LINEAR) * 2.0

    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    n_frames = max(8, int(round(duration_sec * fps)))

    if progress_cb:
        progress_cb(f"🎬 Synthesizing {n_frames} AI Morph frames ({engine})...", 65)

    # Stream synthesized frames directly into FFmpeg hardware encoder pipe
    hw_cmd = [
        ffmpeg_bin,
        "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-pix_fmt", "bgr24",
        "-s", f"{w}x{h}",
        "-r", str(fps),
        "-i", "-",
        "-an",
        "-vf", "format=yuv420p",
        "-c:v", "h264_videotoolbox",
        "-b:v", "7M",
        "-movflags", "+faststart",
        output_mp4,
    ]
    proc = subprocess.Popen(hw_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None

    for idx in range(n_frames):
        raw_t = idx / float(max(1, n_frames - 1))
        # Smooth cubic ease-in-out S-curve
        alpha = raw_t * raw_t * (3.0 - 2.0 * raw_t)
        mid_intensity = math.sin(raw_t * math.pi)  # peaks at 1.0 in the middle of the transition

        if engine == "datamosh_morph":
            # Quantize flow into 24x24 macroblocks for authentic P-frame vector datamoshing
            block = 24
            f_ab_block = cv2.resize(
                cv2.resize(flow_ab, (w // block, h // block), interpolation=cv2.INTER_NEAREST),
                (w, h),
                interpolation=cv2.INTER_NEAREST,
            )
            f_ba_block = cv2.resize(
                cv2.resize(flow_ba, (w // block, h // block), interpolation=cv2.INTER_NEAREST),
                (w, h),
                interpolation=cv2.INTER_NEAREST,
            )
            map_a_x = (grid_x - alpha * f_ab_block[..., 0] * 1.45).astype(np.float32)
            map_a_y = (grid_y - alpha * f_ab_block[..., 1] * 1.45).astype(np.float32)
            map_b_x = (grid_x - (1.0 - alpha) * f_ba_block[..., 0] * 1.45).astype(np.float32)
            map_b_y = (grid_y - (1.0 - alpha) * f_ba_block[..., 1] * 1.45).astype(np.float32)

            warp_a = cv2.remap(img_a, map_a_x, map_a_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT)
            warp_b = cv2.remap(img_b, map_b_x, map_b_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT)
            blended = cv2.addWeighted(warp_a, 1.0 - alpha, warp_b, alpha, 0.0)

            # Chromatic RGB channel shift at peak transition
            shift_px = int(14 * mid_intensity)
            if shift_px > 0:
                blended[:, :, 2] = np.roll(blended[:, :, 2], shift_px, axis=1)
                blended[:, :, 0] = np.roll(blended[:, :, 0], -shift_px, axis=1)

        elif engine == "whip_warp_morph":
            # Radial zoom + horizontal whip combined with bidirectional optical flow
            cx, cy = w * 0.5, h * 0.5
            zoom_factor = 1.0 - 0.18 * mid_intensity
            whip_shift = 95.0 * math.sin(raw_t * math.pi * 2.0) * mid_intensity
            map_a_x = ((grid_x - cx) * zoom_factor + cx - alpha * flow_ab[..., 0] + whip_shift).astype(np.float32)
            map_a_y = ((grid_y - cy) * zoom_factor + cy - alpha * flow_ab[..., 1]).astype(np.float32)
            map_b_x = ((grid_x - cx) * zoom_factor + cx - (1.0 - alpha) * flow_ba[..., 0] + whip_shift).astype(np.float32)
            map_b_y = ((grid_y - cy) * zoom_factor + cy - (1.0 - alpha) * flow_ba[..., 1]).astype(np.float32)

            warp_a = cv2.remap(img_a, map_a_x, map_a_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            warp_b = cv2.remap(img_b, map_b_x, map_b_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            blended = cv2.addWeighted(warp_a, 1.0 - alpha, warp_b, alpha, 12.0 * mid_intensity)

        else:
            # Default: Bidirectional Dense Pyramidal Optical Flow Morph (`optical_morph`)
            map_a_x = (grid_x - alpha * flow_ab[..., 0]).astype(np.float32)
            map_a_y = (grid_y - alpha * flow_ab[..., 1]).astype(np.float32)
            map_b_x = (grid_x - (1.0 - alpha) * flow_ba[..., 0]).astype(np.float32)
            map_b_y = (grid_y - (1.0 - alpha) * flow_ba[..., 1]).astype(np.float32)

            warp_a = cv2.remap(img_a, map_a_x, map_a_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            warp_b = cv2.remap(img_b, map_b_x, map_b_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            blended = cv2.addWeighted(warp_a, 1.0 - alpha, warp_b, alpha, 6.0 * mid_intensity)

            # Subtle motion-blur smoothing at peak warp velocity
            ksize = int(round(mid_intensity * 6)) * 2 + 1
            if ksize >= 3:
                blended = cv2.GaussianBlur(blended, (ksize, ksize), 0)

        proc.stdin.write(blended.tobytes())

    proc.stdin.close()
    proc.wait()

    label_map = {
        "optical_morph": "Optical Flow Neural Morph (Local Open-Source)",
        "datamosh_morph": "Macroblock Vector Datamosh (Local Open-Source)",
        "whip_warp_morph": "Radial Whip + Optical Warp (Local Open-Source)",
        "wan_flf2v": "Optical Flow Neural Morph (Local Fallback — add FAL_KEY for Cloud Wan2.1-FLF2V)",
    }
    if progress_cb:
        progress_cb("✨ AI Transition Ready!", 100)
    return output_mp4, label_map.get(engine, engine)
