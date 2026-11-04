#!/usr/bin/env python3
"""Frames for a case study: media/cases/<slug>/01.webp, 02.webp … from the work's video at the given seconds.

  python3 -I tools/case_frames.py <slug> <video file or URL> 1.5 4 7.2 …
Long side 1280 px, WebP quality 80 (needs ffmpeg and cwebp).
"""
import os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug, src, times = sys.argv[1], sys.argv[2], sys.argv[3:]
out = os.path.join(ROOT, "media", "cases", slug)
os.makedirs(out, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for i, t in enumerate(times, 1):
        png = os.path.join(tmp, f"{i}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", t, "-i", src, "-frames:v", "1",
                        "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'", png], check=True)
        subprocess.run(["cwebp", "-quiet", "-q", "80", png, "-o", os.path.join(out, f"{i:02d}.webp")], check=True)
print(out, len(times), "frames")
