import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Makes the media the tests upload (needs ffmpeg and python3 with PIL; skipped when the files exist). */
export default function globalSetup(): void {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  mkdirSync(dir, { recursive: true });
  const video = join(dir, 'clip.mp4');
  if (!existsSync(video)) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=12:size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', video]);
  }
  const video2 = join(dir, 'clip2.mp4');
  if (!existsSync(video2)) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'smptebars=duration=8:size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=8', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', video2]);
  }
  const audio = join(dir, 'tone.wav');
  if (!existsSync(audio)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=523:duration=5', audio]);
  const pics = join(dir, 'sign.png');
  if (!existsSync(pics)) {
    execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw, ImageFont
import random
d = '${dir}'
im = Image.new('RGB', (1200, 800), (40, 90, 125)); dr = ImageDraw.Draw(im)
try: f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 90); g = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 56)
except Exception: f = g = ImageFont.load_default()
dr.text((80, 220), 'GRAND OPENING', fill='white', font=f); dr.text((80, 380), 'Welcome to our shop', fill=(255, 215, 120), font=g)
im.save(d + '/sign.png')
random.seed(3); n = Image.effect_noise((1200, 800), 60).convert('RGB'); n.save(d + '/noise.png')
big = Image.new('RGB', (3000, 4000)); px = big.load()
for y in range(0, 4000, 4):
    for x in range(0, 3000, 4):
        c = (random.randint(60, 140), random.randint(90, 170), random.randint(40, 100))
        for yy in range(4):
            for xx in range(4): px[x + xx, y + yy] = c
big.save(d + '/big-photo.jpg', quality=85)
`]);
  }
}
