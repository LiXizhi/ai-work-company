import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage
from pipeline import build, check_export, init, import_atlas, local_file, motion, write_json


class PipelineTests(unittest.TestCase):
    def test_atlas_preserves_registration_and_rejects_opaque_input(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = Image.new('RGBA', (20, 10))
            atlas.paste((30, 90, 200, 255), (3, 3, 7, 7))
            atlas.paste((200, 90, 30, 255), (13, 3, 17, 7))
            atlas.save(root / 'atlas.png')
            write_json(root / 'layout.json', {'canvas': [100, 100], 'grid': [2, 1], 'layers': [
                {'id': 'left', 'cell': [0, 0], 'box': [10, 20, 40, 40]},
                {'id': 'right', 'cell': [1, 0], 'box': [50, 20, 40, 40], 'visible': False}]})
            with contextlib.redirect_stdout(io.StringIO()):
                import_atlas(root / 'atlas.png', root / 'layout.json', root / 'output')
            source = Image.open(root / 'output/source.png')
            self.assertEqual(source.getpixel((30, 40))[:3], (30, 90, 200))
            self.assertGreater(source.getpixel((30, 40))[3], 200)
            self.assertEqual(source.getpixel((75, 25))[3], 0)
            atlas.convert('RGB').save(root / 'opaque.png')
            with self.assertRaisesRegex(ValueError, 'opaque'):
                import_atlas(root / 'opaque.png', root / 'layout.json', root / 'bad')

    def test_single_image_masks_and_hidden_replacement_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = Image.new('RGBA', (16, 16), (30, 90, 200, 128))
            image.save(root / 'input.png')
            with contextlib.redirect_stdout(io.StringIO()):
                init(root / 'input.png', root / 'project')
                project = json.loads((root / 'project/project.json').read_text())
                project['layers'] = [
                    {'id': 'body', 'polygon': [[0, 0], [7, 0], [7, 15], [0, 15]]},
                    {'id': 'arm', 'polygon': [[8, 0], [15, 0], [15, 15], [8, 15]], 'visible': False},
                ]
                write_json(root / 'project/project.json', project)
                build(root / 'project/project.json', root / 'output')
            psd = PSDImage.open(root / 'output/character.psd')
            self.assertEqual(len(psd), 2)
            self.assertFalse(psd[1].visible)
            composite = Image.open(root / 'output/composite.png')
            self.assertEqual(composite.getpixel((2, 2)), (30, 90, 200, 128))
            self.assertEqual(composite.getpixel((10, 2))[3], 0)
            breath = json.loads((root / 'output/motion-templates/standing-breathing.motion3.json').read_text())
            self.assertEqual([c['Id'] for c in breath['Curves']], ['ParamBreath'])
            keys = breath['Curves'][0]['Segments']
            self.assertEqual(keys[1], keys[-1])
            self.assertEqual(breath['Meta']['TotalPointCount'], 121)

    def test_refuses_overwrite_and_empty_mask(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.new('RGBA', (10, 10)).save(root / 'input.png')
            with contextlib.redirect_stdout(io.StringIO()):
                init(root / 'input.png', root / 'project')
            with self.assertRaises(FileExistsError):
                init(root / 'input.png', root / 'project')
            project = json.loads((root / 'project/project.json').read_text())
            project['layers'] = [{'id': 'empty', 'polygon': [[0, 0], [5, 0], [0, 5]]}]
            write_json(root / 'project/project.json', project)
            with self.assertRaisesRegex(ValueError, 'empty'):
                build(root / 'project/project.json', root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_project_paths_cannot_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'project').mkdir()
            (root / 'secret').write_text('synthetic')
            for name in ['../secret', str(root / 'secret'), 'https://example.com/image.png']:
                with self.assertRaises(ValueError):
                    local_file(root / 'project', name)

    def test_export_check_does_not_certify_signature_as_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'model.moc3').write_bytes(b'MOC3synthetic-invalid-model')
            Image.new('RGBA', (4, 4)).save(root / 'texture.png')
            write_json(root / 'idle.motion3.json', motion({'ParamBreath': [[0, 0], [4, 0]]}))
            descriptor = root / 'character.model3.json'
            write_json(descriptor, {'Version': 3, 'FileReferences': {'Moc': 'model.moc3',
                       'Textures': ['texture.png'], 'Motions': {'Idle': [{'File': 'idle.motion3.json'}]}}})
            stream = io.StringIO()
            with contextlib.redirect_stdout(stream):
                self.assertEqual(check_export(descriptor), 0)
            self.assertFalse(json.loads(stream.getvalue())['runtime_verified'])
            (root / 'texture.png').unlink()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(check_export(descriptor), 1)


if __name__ == '__main__':
    unittest.main()
