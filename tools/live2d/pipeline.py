"""Offline PSD preparation and Cubism handoff. Never manufactures a moc3 model."""
import argparse
import base64
import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps
from psd_tools import PSDImage
from psd_tools.constants import BlendMode

Image.MAX_IMAGE_PIXELS = 32_000_000
PARTS = ['hair-back', 'accessory-back', 'leg-left', 'leg-right', 'torso',
         'arm-left', 'arm-right', 'face', 'eye-left', 'eye-right', 'mouth',
         'hair-front', 'accessory-front']
PARAMETERS = {
    'ParamBreath': [0, 0, 1], 'ParamAngleZ': [-30, 0, 30],
    'ParamBodyAngleZ': [-10, 0, 10], 'ParamArmLZ': [-30, 0, 30],
    'ParamArmRZ': [-30, 0, 30], 'ParamAccessorySwing': [-1, 0, 1],
    'ParamEyeLOpen': [0, 1, 1], 'ParamEyeROpen': [0, 1, 1],
    'ParamMouthOpenY': [0, 0, 1],
}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def local_file(root, value):
    if not isinstance(value, str) or not value or ':' in value or '\\' in value:
        raise ValueError(f'Expected relative file path: {value!r}')
    path = (root / value).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f'Missing or out-of-project file: {value}')
    return path


def rgba(path):
    with Image.open(path) as image:
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Image exceeds 32 megapixels')
        return ImageOps.exif_transpose(image).convert('RGBA')


def fresh(path):
    path.mkdir(parents=True, exist_ok=False)
    return path


def editor(root, project):
    template = Path(__file__).with_name('editor.html').read_text(encoding='utf-8')
    # Base64 prevents filenames or JSON text from becoming HTML/script markup.
    data = base64.b64encode(json.dumps(project).encode()).decode()
    png = base64.b64encode((root / 'source.png').read_bytes()).decode()
    (root / 'editor.html').write_text(template.replace('__PROJECT__', data).replace('__IMAGE__', png), encoding='utf-8')


def init(image, output):
    source = rgba(image)
    root = fresh(output)
    source.save(root / 'source.png')
    project = {'version': 1, 'canvas': list(source.size), 'source': 'source.png',
               'source_sha256': hashlib.sha256(image.read_bytes()).hexdigest(),
               'layers': [], 'parameters': PARAMETERS,
               'notes': ['Layer order is back to front. Pixels hidden in the source require repainting.']}
    write_json(root / 'project.json', project)
    editor(root, project)
    print(f'Open {root / "editor.html"}; trace parts and save project.json into this folder.')


def import_psd(path, output):
    psd = PSDImage.open(path)
    if psd.width * psd.height > Image.MAX_IMAGE_PIXELS:
        raise ValueError('PSD exceeds 32 megapixels')
    if any(layer.is_group() or layer.kind != 'pixel' for layer in psd):
        raise ValueError('Import currently requires flat pixel layers; flatten groups/styles first.')
    if any(layer.blend_mode != BlendMode.NORMAL or layer.has_mask() or layer.has_effects() for layer in psd):
        raise ValueError('Rasterize masks, effects and non-normal blend modes before import.')
    root = fresh(output)
    (root / 'parts').mkdir()
    project = {'version': 1, 'canvas': list(psd.size), 'source': 'source.png',
               'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
               'layers': [], 'parameters': PARAMETERS}
    composite = Image.new('RGBA', psd.size)
    for index, layer in enumerate(psd):
        part = layer.topil().convert('RGBA')
        if layer.opacity != 255:
            part.putalpha(part.getchannel('A').point(lambda v: round(v * layer.opacity / 255)))
        name = re.sub(r'[^a-zA-Z0-9_-]', '-', layer.name)[:64] or 'part'
        filename = f'parts/{index:02}-{name}.png'
        part.save(root / filename)
        project['layers'].append({'id': f'{index:02}-{name}', 'image': filename,
                                  'offset': [layer.left, layer.top], 'visible': layer.visible,
                                  'repair_reviewed': False})
        if layer.visible:
            composite.alpha_composite(part, (layer.left, layer.top))
    composite.save(root / 'source.png')
    write_json(root / 'project.json', project)
    editor(root, project)
    print(f'Imported {len(project["layers"])} layers into {root}')


def import_atlas(path, layout_path, output):
    atlas = rgba(path)
    layout = read_json(layout_path)
    width, height = layout['canvas']
    columns, rows = layout['grid']
    if any(type(v) is not int or v <= 0 for v in [width, height, columns, rows]):
        raise ValueError('Canvas and grid must contain positive integers')
    if width * height > Image.MAX_IMAGE_PIXELS or columns > atlas.width or rows > atlas.height:
        raise ValueError('Invalid canvas/grid dimensions')
    if atlas.getchannel('A').getextrema()[0] == 255:
        raise ValueError('Atlas is opaque; generate actual transparent parts first')
    parts, warnings = [], []
    for spec in layout['layers']:
        col, row = spec['cell']
        if type(col) is not int or type(row) is not int or not (0 <= col < columns and 0 <= row < rows):
            raise ValueError('Cell is outside grid')
        bounds = (round(col * atlas.width / columns), round(row * atlas.height / rows),
                  round((col + 1) * atlas.width / columns), round((row + 1) * atlas.height / rows))
        cell = atlas.crop(bounds)
        alpha = cell.getchannel('A')
        bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
        if bbox is None:
            raise ValueError(f'Empty atlas cell: {spec["id"]}')
        if bbox[0] < 3 or bbox[1] < 3 or bbox[2] > cell.width - 3 or bbox[3] > cell.height - 3:
            warnings.append(f'{spec["id"]}: art reaches cell edge; check clipping or adjacent-cell bleed')
        # Nearly invisible alpha=1 speckles must not set registration scale.
        # Keep a three-pixel antialias margin around meaningful-alpha pixels.
        part = cell.crop((max(0, bbox[0] - 3), max(0, bbox[1] - 3),
                          min(cell.width, bbox[2] + 3), min(cell.height, bbox[3] + 3)))
        x, y, box_width, box_height = spec['box']
        if any(type(v) is not int for v in spec['box']) or min(x, y) < 0 or min(box_width, box_height) <= 0 or x + box_width > width or y + box_height > height:
            raise ValueError('Placement box outside canvas')
        scale = min(box_width / part.width, box_height / part.height)
        part = part.resize((max(1, round(part.width * scale)), max(1, round(part.height * scale))), Image.Resampling.LANCZOS)
        parts.append((spec, part, x + (box_width - part.width) // 2, y))
    root = fresh(output)
    (root / 'parts').mkdir()
    composite = Image.new('RGBA', (width, height))
    project = {'version': 1, 'canvas': [width, height], 'source': 'source.png',
               'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
               'parameters': PARAMETERS, 'layers': [],
               'notes': ['Generated atlas registration draft; visual review required.'],
               'generation_warnings': warnings}
    for index, (spec, part, x, y) in enumerate(parts):
        filename = f'parts/{index:02}.png'
        part.save(root / filename)
        project['layers'].append({'id': spec['id'], 'image': filename, 'offset': [x, y],
                                  'visible': spec.get('visible', True), 'repair_reviewed': False})
        if spec.get('visible', True):
            composite.alpha_composite(part, (x, y))
    composite.save(root / 'source.png')
    write_json(root / 'project.json', project)
    write_json(root / 'atlas-review.json', {'status': 'generated-art-draft', 'warnings': warnings,
               'identity_verified': False, 'anatomy_verified': False, 'runtime_verified': False})
    editor(root, project)
    print(f'Imported {len(parts)} generated parts; {len(warnings)} geometric warnings. Review {root}')


def motion(curves, duration=4, loop=True):
    result = []
    points = segments = 0
    for name, keys in curves.items():
        values = list(keys[0])
        for time, value in keys[1:]:
            values.extend([0, time, value])  # Cubism linear segment
        result.append({'Target': 'Parameter', 'Id': name, 'Segments': values})
        points += len(keys)
        segments += len(keys) - 1
    return {'Version': 3, 'Meta': {'Duration': duration, 'Fps': 30, 'Loop': loop,
            'AreBeziersRestricted': True, 'CurveCount': len(result),
            'TotalSegmentCount': segments, 'TotalPointCount': points,
            'UserDataCount': 0, 'UserDataSize': 0}, 'Curves': result, 'UserData': []}


def motions(output):
    output.mkdir()
    breath = [[round(i / 30, 6), round((1 - math.cos(2 * math.pi * i / 120)) / 2, 6)] for i in range(121)]
    specs = {
        'standing-breathing': {'ParamBreath': breath},
        'head-tilt': {'ParamAngleZ': [[0, 0], [1, -6], [3, 6], [4, 0]]},
        'wave': {'ParamArmLZ': [[0, 0], [.5, -20], [1, -10], [1.5, -20], [2, -10], [3, 0], [4, 0]]},
        'accessory-sway': {'ParamAccessorySwing': [[0, 0], [1, .4], [3, -.4], [4, 0]]},
        'blink': {p: [[0, 1], [1.8, 1], [1.9, 0], [2.1, 1], [4, 1]] for p in ['ParamEyeLOpen', 'ParamEyeROpen']},
        'talk': {'ParamMouthOpenY': [[0, 0], [.3, .7], [.6, .1], [.9, .5], [1.2, 0], [4, 0]]},
    }
    for name, curves in specs.items():
        write_json(output / f'{name}.motion3.json', motion(curves, loop=name in ['standing-breathing', 'accessory-sway']))


def build(project_path, output):
    project = read_json(project_path)
    root = project_path.parent
    source = rgba(local_file(root, project['source']))
    if list(source.size) != project['canvas']:
        raise ValueError('Source dimensions disagree with canvas')
    if not project['layers']:
        raise ValueError('No parts yet. Trace masks in editor.html or import a layered PSD.')
    layers, ids = [], set()
    for spec in project['layers']:
        name = spec['id']
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', name) or name in ids:
            raise ValueError('Layer IDs must be unique ASCII letters, digits, underscores or hyphens')
        ids.add(name)
        if 'image' in spec:
            part = rgba(local_file(root, spec['image']))
            offset = spec.get('offset', [0, 0])
            if len(offset) != 2 or any(type(v) is not int for v in offset):
                raise ValueError(f'Invalid offset for {name}')
            x, y = offset
        else:
            polygon = spec.get('polygon', [])
            if len(polygon) < 3 or any(len(p) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in p) for p in polygon):
                raise ValueError(f'{name} needs at least three finite polygon vertices')
            mask = Image.new('L', source.size)
            ImageDraw.Draw(mask).polygon([tuple(p) for p in polygon], fill=255)
            part = source.copy()
            part.putalpha(ImageChops.multiply(source.getchannel('A'), mask))
            x = y = 0
        if x < 0 or y < 0 or x + part.width > source.width or y + part.height > source.height:
            raise ValueError(f'{name} extends beyond canvas')
        bounds = part.getchannel('A').getbbox()
        if bounds is None:
            raise ValueError(f'{name} is empty')
        part = part.crop(bounds)
        layers.append((spec, part, x + bounds[0], y + bounds[1]))
    out = fresh(output)
    (out / 'parts').mkdir()
    psd = PSDImage.new('RGBA', source.size)
    composite = Image.new('RGBA', source.size)
    for spec, part, x, y in layers:
        part.save(out / 'parts' / f'{spec["id"]}.png')
        layer = psd.create_pixel_layer(part, name=spec['id'], left=x, top=y)
        layer.visible = spec.get('visible', True)
        if layer.visible:
            composite.alpha_composite(part, (x, y))
    psd.save(out / 'character.psd')
    # Reopen the actual deliverable: PSD creation is experimental in psd-tools.
    reopened = PSDImage.open(out / 'character.psd')
    if len(reopened) != len(layers) or reopened.size != source.size:
        raise ValueError('PSD roundtrip failed')
    for actual, (spec, part, x, y) in zip(reopened, layers):
        if actual.name != spec['id'] or actual.left != x or actual.top != y or actual.visible != spec.get('visible', True):
            raise ValueError('PSD layer metadata roundtrip failed')
        if actual.topil().convert('RGBA').tobytes() != part.tobytes():
            raise ValueError('PSD layer pixels failed roundtrip')
    composite.save(out / 'composite.png')
    source.save(out / 'reference.png')
    motions(out / 'motion-templates')
    write_json(out / 'parameters.json', PARAMETERS)
    report = {'status': 'art-handoff-only', 'layers': len(layers), 'psd_pixel_roundtrip': True,
              'cubism_editor_verified': False, 'runtime_verified': False,
              'unreviewed_parts': [s['id'] for s, _, _, _ in layers if not s.get('repair_reviewed')],
              'source_project_sha256': hashlib.sha256(project_path.read_bytes()).hexdigest(),
              'warnings': project.get('generation_warnings', []) + ['Masks only extract visible pixels. Repair hidden artwork and background contamination.',
                           'Meshes, deformers, parameter bindings and moc3 export require Cubism.',
                           'Standing is a planted-foot rig pose; breath template drives only ParamBreath.']}
    write_json(out / 'report.json', report)
    (out / 'CUBISM-HANDOFF.md').write_text(Path(__file__).with_name('handoff.md').read_text(encoding='utf-8'), encoding='utf-8')
    print(json.dumps(report, indent=2))


def check_export(descriptor):
    """File integrity preflight only; a MOC signature is not runtime validation."""
    root = descriptor.parent
    errors = []
    checked = []
    try:
        data = read_json(descriptor)
        if data.get('Version') != 3:
            raise ValueError('Expected model3 Version 3')
        refs = data['FileReferences']
        moc = local_file(root, refs['Moc'])
        with moc.open('rb') as stream:
            if stream.read(4) != b'MOC3':
                errors.append('Invalid MOC3 signature')
        checked.append(refs['Moc'])
        textures = refs.get('Textures', [])
        if not textures:
            errors.append('No textures')
        for filename in textures:
            rgba(local_file(root, filename))
            checked.append(filename)
        files = [refs[key] for key in ('Physics', 'Pose', 'DisplayInfo', 'UserData') if key in refs]
        files += [item['File'] for item in refs.get('Expressions', [])]
        motion_count = 0
        for entries in refs.get('Motions', {}).values():
            for entry in entries:
                files.append(entry['File'])
                motion_count += 1
                if entry.get('Sound'):
                    local_file(root, entry['Sound'])
        for filename in files:
            read_json(local_file(root, filename))
            checked.append(filename)
        if not motion_count:
            errors.append('No motions registered in model3.json')
    except (KeyError, ValueError, TypeError, OSError) as exc:
        errors.append(str(exc))
    result = {'file_preflight_passed': not errors, 'runtime_verified': False,
              'checked_files': checked, 'errors': errors,
              'next': 'Load in Cubism Viewer/SDK, check bound parameters, standing feet, breathing, arms and accessories.'}
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for command in ['init', 'import-psd', 'build', 'import-atlas']:
        p = commands.add_parser(command)
        p.add_argument('input', type=Path)
        p.add_argument('--out', type=Path, required=True)
        if command == 'import-atlas':
            p.add_argument('--layout', type=Path, required=True)
    p = commands.add_parser('check-export')
    p.add_argument('input', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'check-export':
            return check_export(args.input)
        if args.command == 'import-atlas':
            import_atlas(args.input, args.layout, args.out)
            return 0
        {'init': init, 'import-psd': import_psd, 'build': build}[args.command](args.input, args.out)
        return 0
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(1, f'Error: {exc}\n')


if __name__ == '__main__':
    raise SystemExit(main())
