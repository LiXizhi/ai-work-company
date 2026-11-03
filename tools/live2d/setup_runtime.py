"""Fetch pinned npm runtime packages; retain only the three local viewer scripts."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

PACKAGES = [
    ('live2dcubismcore@1.0.2', 'package/live2dcubismcore.min.js', 'live2dcubismcore.min.js'),
    ('pixi.js@6.5.10', 'package/dist/browser/pixi.min.js', 'pixi.min.js'),
    ('pixi-live2d-display@0.4.0', 'package/dist/cubism4.min.js', 'cubism4.min.js'),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    npm = shutil.which('npm.cmd') or shutil.which('npm')
    if not npm:
        parser.error('npm is required')
    args.out.mkdir(parents=True, exist_ok=False)
    records = []
    with tempfile.TemporaryDirectory() as temporary:
        for package, member, name in PACKAGES:
            result = subprocess.run([npm, 'pack', package, '--registry=https://registry.npmjs.org',
                                     '--pack-destination', temporary, '--json', '--ignore-scripts'],
                                    check=True, capture_output=True, text=True)
            metadata = json.loads(result.stdout)[0]
            archive = Path(temporary) / Path(metadata['filename']).name
            with tarfile.open(archive) as tar:
                entry = tar.getmember(member)
                if not entry.isfile() or entry.size > 10_000_000:
                    raise ValueError('Unexpected runtime script')
                data = tar.extractfile(entry).read()
            (args.out / name).write_bytes(data)
            records.append({'package': package, 'npm_integrity': metadata['integrity'],
                            'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
    (args.out / 'provenance.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
    (args.out / 'LICENSE-NOTICE.txt').write_text(
        'Cubism Core is Live2D proprietary Redistributable Code; npm ISC metadata does not replace its license.\n'
        'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html\n'
        'PixiJS and pixi-live2d-display: MIT. Retain source headers and review applicable terms before redistribution.\n', encoding='utf-8')
    print(f'Local viewer dependencies ready: {args.out}')


if __name__ == '__main__':
    main()
