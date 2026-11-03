"""Create registered textures and geometry input for the native MOC3 exporter."""
import argparse
import math
from pathlib import Path
from PIL import Image
from pipeline import read_json, write_json, rgba, local_file, fresh, motion


def prepare(project_path, output):
    data = read_json(project_path)
    root = project_path.parent
    out = fresh(output)
    (out / 'textures').mkdir()
    textures, parts = [], []
    for layer in data['layers']:
        if not layer.get('visible', True):
            continue
        part = rgba(local_file(root, layer['image']))
        if max(part.size) > 2048:
            raise ValueError('Part exceeds 2048 pixels; resize the project first')
        texture = Image.new('RGBA', (2048, 2048))
        texture.paste(part, (0, 0))
        filename = f'textures/texture-{len(parts):02}.png'
        texture.save(out / filename)
        textures.append(filename)
        parts.append({'id': layer['id'], 'offset': layer.get('offset', [0, 0]),
                      'size': list(part.size), 'textureIndex': len(parts)})
    (out / 'motions').mkdir()
    keys = [[round(i / 30, 6), round((1 - math.cos(2 * math.pi * i / 120)) / 2, 6)] for i in range(121)]
    write_json(out / 'motions/standing-breathing.motion3.json', motion({'ParamBreath': keys}))
    write_json(out / 'native-input.json', {'canvas': data['canvas'], 'parts': parts,
        'joints': [j for j in data.get('assembly', {}).get('joints', []) if 'coveredFraction' in j]})
    if 'assembly' in data:
        write_json(out / 'assembly-report.json', data['assembly'])
    write_json(out / 'character.model3.json', {'Version': 3, 'FileReferences': {
        'Moc': 'character.moc3', 'Textures': textures,
        'Motions': {'Idle': [{'File': 'motions/standing-breathing.motion3.json'}]}}})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('project', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.project, args.out)
