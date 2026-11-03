import copy
import unittest
from PIL import Image
from assemble import solve


class AssemblyTests(unittest.TestCase):
    def setUp(self):
        self.project = {'canvas': [200, 300], 'layers': [
            {'id': 'arm', 'offset': [0, 0]}, {'id': 'hand', 'offset': [0, 0]},
            {'id': 'torso', 'offset': [60, 50]}]}
        self.images = {name: Image.new('RGBA', (60, 60), (200, 120, 80, 255))
                       for name in ['torso', 'arm', 'hand']}
        self.recipe = {'root': 'torso', 'attachments': [
            {'parent': 'arm', 'child': 'hand', 'parentAnchor': [30, 40],
             'childAnchor': [30, 10], 'effect': 'leftArm', 'inheritPivot': True, 'radius': 5},
            {'parent': 'torso', 'child': 'arm', 'parentAnchor': [15, 20],
             'childAnchor': [30, 10], 'effect': 'leftArm', 'radius': 5}],
            'frontOf': [['arm', 'torso'], ['hand', 'arm']]}

    def test_dependency_order_alignment_pivots_and_front_rules(self):
        original = copy.deepcopy(self.project)
        fitted, rig, report = solve(self.project, self.recipe, self.images)
        self.assertEqual([p['id'] for p in fitted['layers']], ['torso', 'arm', 'hand'])
        self.assertEqual(fitted['layers'][1]['offset'], [45, 60])
        self.assertEqual(fitted['layers'][2]['offset'], [45, 90])
        self.assertEqual(rig['parts']['arm']['pivot'], [75, 70])
        self.assertEqual(rig['parts']['hand']['pivot'], [75, 70])
        self.assertEqual(report['status'], 'ready_for_pose_review')
        self.assertEqual(original, self.project)

    def test_missing_paint_does_not_pass_from_coincident_anchors(self):
        self.images['arm'] = Image.new('RGBA', (60, 60))
        _, _, report = solve(self.project, self.recipe, self.images)
        self.assertEqual(report['status'], 'needs_repaint')
        self.assertTrue(any(j['needsRepaint'] for j in report['joints']))

    def test_attachment_and_order_cycles_rejected(self):
        recipe = copy.deepcopy(self.recipe)
        recipe['attachments'][1]['parent'] = 'hand'
        with self.assertRaisesRegex(ValueError, 'Attachment cycle'):
            solve(self.project, recipe, self.images)
        recipe = copy.deepcopy(self.recipe)
        recipe['frontOf'].append(['torso', 'hand'])
        with self.assertRaisesRegex(ValueError, 'Draw-order cycle'):
            solve(self.project, recipe, self.images)

    def test_outside_and_nonfinite_landmarks_rejected(self):
        for coordinate in [-1, 61, float('nan')]:
            recipe = copy.deepcopy(self.recipe)
            recipe['attachments'][0]['childAnchor'][0] = coordinate
            with self.assertRaises(ValueError):
                solve(self.project, recipe, self.images)


if __name__ == '__main__':
    unittest.main()
