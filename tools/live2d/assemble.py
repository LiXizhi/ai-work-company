"""Assemble AI-annotated parts by joint constraints, preserving raster pixels.

Landmarks are reviewed local-image coordinates, not an anatomy detector. The
solver derives placements, draw order and rig pivots; coverage checks expose
missing paint instead of silently stretching or manufacturing it.
"""
import argparse
import copy
import math
import shutil
from pathlib import Path

from pipeline import fresh, local_file, read_json, rgba, write_json


def point(value, label):
    if not isinstance(value, list) or len(value) != 2 or any(
        isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in value
    ):
        raise ValueError(f'Invalid point: {label}')
    return value


def solve(project, recipe, images):
    result = copy.deepcopy(project)
    layers = {layer['id']: layer for layer in result['layers']}
    if len(layers) != len(result['layers']):
        raise ValueError('Duplicate layer IDs')
    root = recipe['root']
    if root not in layers:
        raise ValueError('Unknown root')
    attachments = recipe['attachments']
    children = [a['child'] for a in attachments]
    if len(set(children)) != len(children) or root in children:
        raise ValueError('Each attached layer must have one parent; root cannot be attached')
    for a in attachments:
        for side in ('parent', 'child'):
            name = a[side]
            if name not in layers:
                raise ValueError(f'Unknown layer {name}')
            x, y = point(a[f'{side}Anchor'], name)
            w, h = images[name].size
            if not 0 <= x < w or not 0 <= y < h:
                raise ValueError(f'Anchor outside {name}')
    settled = set(layers) - set(children)
    pending = list(attachments)
    joints = []
    rig = {'bodyBottom': recipe.get('bodyBottom', project['canvas'][1] * .76),
           'bodyLift': recipe.get('bodyLift', 6), 'parts': {}}
    while pending:
        available = [a for a in pending if a['parent'] in settled]
        if not available:
            raise ValueError('Attachment cycle')
        for a in available:
            parent, child = layers[a['parent']], layers[a['child']]
            offset = point(parent.get('offset', [0, 0]), parent['id'])
            anchor = [offset[i] + a['parentAnchor'][i] for i in range(2)]
            previous = child.get('offset', [0, 0])
            child['offset'] = [round(anchor[i] - a['childAnchor'][i]) for i in range(2)]
            joint = {'parent': parent['id'], 'child': child['id'], 'anchor': anchor,
                     'translation': [child['offset'][i] - previous[i] for i in range(2)]}
            if a.get('checkCoverage', True):
                radius = a.get('radius', 10)
                if not isinstance(radius, (int, float)) or not math.isfinite(radius) or not 1 <= radius <= 64:
                    raise ValueError('Coverage radius must be 1..64')
                coverage = []
                for dy in range(-math.ceil(radius), math.ceil(radius) + 1):
                    for dx in range(-math.ceil(radius), math.ceil(radius) + 1):
                        if dx * dx + dy * dy > radius * radius:
                            continue
                        opaque = []
                        for layer in (parent, child):
                            px = round(anchor[0] + dx - layer['offset'][0])
                            py = round(anchor[1] + dy - layer['offset'][1])
                            img = images[layer['id']]
                            opaque.append(0 <= px < img.width and 0 <= py < img.height and img.getpixel((px, py))[3] >= 128)
                        coverage.append(opaque)
                joint['coveredFraction'] = sum(any(v) for v in coverage) / len(coverage)
                joint['overlapFraction'] = sum(all(v) for v in coverage) / len(coverage)
                joint['needsRepaint'] = joint['coveredFraction'] < .98 or joint['overlapFraction'] < .2
            effect = a.get('effect')
            if effect:
                if effect not in ('head', 'leftArm', 'rightArm', 'accessory'):
                    raise ValueError('Unknown rig effect')
                pivot = anchor
                if a.get('inheritPivot'):
                    inherited = rig['parts'].get(parent['id'])
                    if not inherited or inherited['effect'] != effect:
                        raise ValueError('Inherited pivot requires same parent effect')
                    pivot = inherited['pivot']
                rig['parts'][child['id']] = {'effect': effect, 'pivot': pivot,
                                           'degrees': a.get('degrees', 5 if effect == 'head' else 12)}
            joints.append(joint)
            settled.add(child['id'])
            pending.remove(a)
    # Layer order is a separate DAG: being attached does not imply being in front.
    edges = recipe.get('frontOf', [])
    if any(len(edge) != 2 or any(name not in layers for name in edge) for edge in edges):
        raise ValueError('Unknown draw-order layer')
    ordered = []
    pending_ids = list(layers)
    while pending_ids:
        available = [name for name in pending_ids if all(back in ordered for front, back in edges if front == name)]
        if not available:
            raise ValueError('Draw-order cycle')
        # Stable topological ordering: retain original order where unconstrained.
        name = available[0]
        ordered.append(name)
        pending_ids.remove(name)
    result['layers'] = [layers[name] for name in ordered]
    report = {'version': 1, 'landmarkSource': recipe.get('landmarkSource', 'provided'),
              'joints': joints, 'drawOrder': ordered,
              'status': 'needs_repaint' if any(j.get('needsRepaint') for j in joints) else 'ready_for_pose_review',
              'scope': 'Neutral anchor coverage only; exported animated poses still require review.'}
    result['assembly'] = report
    return result, rig, report


def assemble(project_path, recipe_path, output):
    project, recipe = read_json(project_path), read_json(recipe_path)
    images = {layer['id']: rgba(local_file(project_path.parent, layer['image'])) for layer in project['layers']}
    result, rig, report = solve(project, recipe, images)
    fresh(output)
    # Copy only referenced assets; never recursively copy arbitrary input folders.
    for layer in result['layers']:
        destination = output / layer['image']
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(local_file(project_path.parent, layer['image']), destination)
    if project.get('source'):
        source = local_file(project_path.parent, project['source'])
        destination = output / project['source']
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    write_json(output / 'project.json', result)
    write_json(output / 'rig.json', rig)
    write_json(output / 'assembly-report.json', report)
    write_json(output / 'assembly-recipe.json', recipe)
    print(report['status'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('recipe', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assemble(args.project, args.recipe, args.out)
