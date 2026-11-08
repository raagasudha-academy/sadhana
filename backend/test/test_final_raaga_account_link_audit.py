"""Offline, boto3-free regression tests for the read-only Raaga account-link audit."""
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'finalRaagaAccountLinkAudit.py'
spec = importlib.util.spec_from_file_location('account_link_audit', SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CanonicalStudentPersonTests(unittest.TestCase):
    def setUp(self):
        self.student = {
            'personId': 'per_child123', 'familyId': 'fam_1234', 'status': 'active',
            'institutionIds': ['raaga'], 'personTypes': ['student'],
        }

    def test_valid_active_learner(self):
        self.assertTrue(audit.valid_student_person(self.student, 'per_child123', 'fam_1234'))

    def test_missing_and_mismatched_persons_denied(self):
        for candidate in (
            None,
            {},
            {**self.student, 'personId': 'per_other'},
            {**self.student, 'familyId': 'fam_other'},
            {**self.student, 'status': 'archived'},
            {**self.student, 'institutionIds': ['sruti']},
            {**self.student, 'personTypes': ['guardian']},
        ):
            with self.subTest(candidate=candidate):
                self.assertFalse(audit.valid_student_person(candidate, 'per_child123', 'fam_1234'))

    def test_adult_self_person_must_also_be_student(self):
        adult = {**self.student, 'personTypes': ['guardian', 'student']}
        self.assertTrue(audit.valid_student_person(adult, 'per_child123', 'fam_1234'))
        self.assertFalse(audit.valid_student_person(
            {**adult, 'personTypes': ['guardian']}, 'per_child123', 'fam_1234'
        ))


class AccountReadinessTests(unittest.TestCase):
    def setUp(self):
        self.registration = {'importStatus': 'imported',
                             'provisioningStatus': 'EXISTING_ACCOUNT_LINKED',
                             'identityResolutionStatus': 'pending_guardian_verification'}
        self.students = ['per_child_a', 'per_child_b']
        self.person_counts = {'active_matching': 2, 'missing_or_inconsistent': 0,
                              'adult_self_access': 0}
        self.links = {'approved_and_verified': 2, 'pending': 0,
                      'rejected_or_revoked': 0, 'missing_or_other': 0}

    def ready(self, reg=None, people=None, links=None, cognito='CONFIRMED_ENABLED'):
        return audit.account_access_readiness(
            reg if reg is not None else self.registration,
            True,
            people if people is not None else self.person_counts,
            links if links is not None else self.links,
            2, self.students, cognito, True,
        )

    def test_historical_pending_metadata_does_not_override_verified_links(self):
        self.assertTrue(self.ready())

    def test_pending_or_revoked_links_cannot_pass_audit(self):
        self.assertFalse(self.ready(links={**self.links, 'pending': 1,
                                            'approved_and_verified': 1}))
        self.assertFalse(self.ready(links={**self.links, 'rejected_or_revoked': 1,
                                            'approved_and_verified': 1}))

    def test_canonical_student_missing_cannot_pass_audit(self):
        self.assertFalse(self.ready(people={**self.person_counts,
                                            'active_matching': 1,
                                            'missing_or_inconsistent': 1}))

    def test_unconfirmed_cognito_or_provisioning_cannot_pass(self):
        self.assertFalse(self.ready(cognito='MISSING_DISABLED_OR_UNCONFIRMED'))
        self.assertFalse(self.ready(reg={**self.registration, 'provisioningStatus': 'NOT_INVITED'}))


if __name__ == '__main__':
    unittest.main()
