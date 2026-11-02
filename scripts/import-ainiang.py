"""Import all tracked still images from a local AINiangAssets checkout.

Offline authoring utility; requires Pillow with WebP support, not a server dependency.
Usage: python scripts/import-ainiang.py /path/to/AINiangAssets
"""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import subprocess
import sys

from PIL import Image

source = Path(sys.argv[1]).resolve()
destination = Path(__file__).resolve().parents[1] / 'site/assets/ainiang'
revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
tracked = subprocess.check_output(['git', '-C', str(source), 'ls-files', '-z']).decode().split('\0')
images = sorted(p for p in tracked if Path(p).suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'})


def convert(relative):
    original = source / relative
    output = destination / Path(relative).with_suffix('.webp')
    output.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as image:
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
        image.save(output, 'WEBP', quality=85, method=6, exact=True)
        with Image.open(output) as verified:
            verified.load()
            assert verified.size == image.size
            if image.mode == 'RGBA':
                assert verified.getchannel('A').tobytes() == image.getchannel('A').tobytes()
        return {
            'source': relative, 'path': output.relative_to(destination).as_posix(),
            'width': image.width, 'height': image.height,
            'source_bytes': original.stat().st_size, 'bytes': output.stat().st_size,
            'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        }


with ThreadPoolExecutor(max_workers=4) as pool:
    assets = list(pool.map(convert, images))

avatars = destination.parent / 'avatars'
for name, original in [('claude', 'Claude-Chibi'), ('gpt', 'ChatGPT-Chibi'), ('gemini', 'Gemini-Chibi')]:
    with Image.open(source / f'2d/cutouts/{original}.png') as image:
        image.thumbnail((512, 910), Image.Resampling.LANCZOS)
        image.save(avatars / f'{name}.webp', 'WEBP', quality=85, method=6, exact=True)

manifest = {
    'source_repository': 'https://github.com/hodokoshitsunagu-arch/AINiangAssets',
    'source_revision': revision,
    'encoding': {'format': 'webp', 'quality': 85, 'method': 6, 'dimensions': 'original', 'alpha': 'lossless'},
    'assets': assets,
}
(destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'images': len(assets), 'source_bytes': sum(a['source_bytes'] for a in assets), 'webp_bytes': sum(a['bytes'] for a in assets)}))
