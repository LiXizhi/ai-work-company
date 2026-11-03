"""Repeatable native build using supplied local runtime libraries; no downloads."""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from pipeline import check_export, read_json, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--core', type=Path, required=True)
    parser.add_argument('--pixi', type=Path, required=True)
    parser.add_argument('--display', type=Path, required=True)
    parser.add_argument('--rig', type=Path)
    parser.add_argument('--assembly', type=Path, help='AI-reviewed joint/order recipe; assemble before rigging')
    args = parser.parse_args()
    for path in [args.project, args.core, args.pixi, args.display]:
        if not path.is_file():
            parser.error(f'Missing input: {path}')
    node = shutil.which('node')
    if not node:
        parser.error('Node.js is required')
    tools = Path(__file__).resolve().parent
    if args.assembly:
        if args.rig:
            parser.error('--assembly derives the rig; do not combine it with --rig')
        from assemble import assemble
        assembled = args.out.with_name(args.out.name + '-assembly')
        assemble(args.project, args.assembly, assembled)
        report = read_json(assembled / 'assembly-report.json')
        if report['status'] == 'needs_repaint':
            raise RuntimeError(f'Joint paint coverage failed; see {assembled / "assembly-report.json"}')
        args.project, args.rig = assembled / 'project.json', assembled / 'rig.json'
    subprocess.run([sys.executable, str(tools / 'prepare_native.py'), str(args.project), '--out', str(args.out)], check=True)
    subprocess.run([node, str(tools / 'rig-native.mjs'), str(args.out)] + ([str(args.rig)] if args.rig else []), check=True)
    if check_export(args.out / 'character.model3.json'):
        raise RuntimeError('Export file preflight failed')
    subprocess.run([node, str(tools / 'verify-core.cjs'), str(args.core), str(args.out / 'character.moc3')], check=True)
    libs = args.out / 'lib'
    libs.mkdir()
    for source, name in [(args.core, 'live2dcubismcore.min.js'), (args.pixi, 'pixi.min.js'), (args.display, 'cubism4.min.js')]:
        shutil.copy2(source, libs / name)
    shutil.copy2(tools / 'viewer.html', args.out / 'index.html')
    report = read_json(args.out / 'core-verification.json')
    report['visual_acceptance'] = 'pending-human-or-browser-review'
    report['art_quality'] = 'draft'
    write_json(args.out / 'build-report.json', report)
    print(f'Native build passed. Serve locally: python -m http.server 5088 --bind 127.0.0.1 --directory "{args.out}"')


if __name__ == '__main__':
    main()
