"""M9.1 class/teacher validation unit tests. No AWS calls."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch, Mock

PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'middlesbroughGate.py'
spec = importlib.util.spec_from_file_location('m91_gate', PATH)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def setUp(self):
        self.cls = {'classId': gate.CLASS_ID, 'institutionId': 'raaga', 'status': 'active', 'teacherPersonIds': ['teacher-one']}
        self.teachers = [{'personId': 'teacher-one', 'found': True, 'valid': True}]
        self.students = {k: {'status': 'active', 'institutionIds': ['raaga']} for k in gate.STUDENTS}
        self.enrolments = {k: [] for k in gate.STUDENTS}

    def check(self):
        return gate.assess(self.cls, self.teachers, self.students, self.enrolments)

    def test_ready_when_teacher_and_students_verified(self):
        self.assertEqual(self.check(), [])

    def test_teacher_missing_blocks(self):
        self.cls['teacherPersonIds'] = []
        self.teachers = []
        self.assertIn('CLASS_HAS_NO_ASSIGNED_TEACHERS', self.check())

    def test_wrong_institution_blocks(self):
        self.cls['institutionId'] = 'sruti'
        self.assertIn('CLASS_WRONG_INSTITUTION', self.check())

    def test_invalid_teacher_blocks(self):
        self.teachers[0]['valid'] = False
        self.assertIn('ASSIGNED_TEACHER_NOT_ACTIVE_RAAGA_TEACHER', self.check())

    def test_missing_teacher_blocks(self):
        self.teachers[0]['found'] = False
        self.assertIn('ASSIGNED_TEACHER_NOT_FOUND', self.check())

    def test_existing_active_enrolment_blocks_duplicate(self):
        self.enrolments['001-001'] = [{'classId': gate.CLASS_ID, 'status': 'active'}]
        self.assertIn('STUDENT_001-001_ALREADY_ENROLLED', self.check())

    def test_inactive_student_blocks(self):
        self.students['001-002']['status'] = 'inactive'
        self.assertIn('STUDENT_001-002_NOT_ACTIVE_RAAGA', self.check())

    def test_no_class_blocks(self):
        self.cls = None
        self.assertIn('CLASS_NOT_FOUND', self.check())

    def test_missing_get_item_with_empty_aws_cli_output(self):
        with patch.object(gate.subprocess, 'run', return_value=Mock(returncode=0, stdout='', stderr='')):
            self.assertEqual(gate.aws('dynamodb', 'get-item', '--table-name', 'sadhana-dev-m9-enrolments'), {})

    def test_empty_query_is_not_treated_as_success(self):
        with patch.object(gate.subprocess, 'run', return_value=Mock(returncode=0, stdout='', stderr='')):
            with self.assertRaisesRegex(RuntimeError, 'empty JSON'):
                gate.aws('dynamodb', 'query')

    def test_malformed_json_has_actionable_error(self):
        with patch.object(gate.subprocess, 'run', return_value=Mock(returncode=0, stdout='broken', stderr='')):
            with self.assertRaisesRegex(RuntimeError, 'malformed JSON'):
                gate.aws('dynamodb', 'get-item')

    def test_dynamodb_decoder(self):
        self.assertEqual(gate.decode({'teacherPersonIds': {'L': [{'S': 'one'}]}, 'version': {'N': '1'}}),
                         {'teacherPersonIds': ['one'], 'version': 1})


if __name__ == '__main__': unittest.main()
