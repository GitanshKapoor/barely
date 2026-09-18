import sys
import unittest
from unittest.mock import MagicMock, patch

for mod in [
    "yaml", "pydantic", "playwright", "playwright.sync_api", 
    "sqlalchemy", "sqlalchemy.orm", "sqlalchemy.ext.declarative"
]:
    if mod not in sys.modules:
        m = MagicMock()
        if mod in ("sqlalchemy.orm", "sqlalchemy.ext.declarative"):
            m.declarative_base = lambda: object
        sys.modules[mod] = m

from barely_core.k8s.spawner import K8sJobSpawner, get_execution_engine_status

class TestK8sJobSpawner(unittest.TestCase):
    def test_k8s_spawner_manifest_structure(self):
        spawner = K8sJobSpawner(namespace="test-barely")
        manifest = spawner.build_job_manifest("job_abc12345")

        # API Version & Kind
        self.assertEqual(manifest["apiVersion"], "batch/v1")
        self.assertEqual(manifest["kind"], "Job")
        self.assertEqual(manifest["metadata"]["name"], "barely-job-job-abc12345")
        self.assertEqual(manifest["metadata"]["namespace"], "test-barely")

        # Pod Lifecycle & Retry controls
        spec = manifest["spec"]
        self.assertEqual(spec["ttlSecondsAfterFinished"], 180)
        self.assertEqual(spec["backoffLimit"], 0)

        pod_spec = spec["template"]["spec"]
        self.assertEqual(pod_spec["restartPolicy"], "Never")

        # Pod-Level Security Context: Strict Non-Root
        pod_sec = pod_spec["securityContext"]
        self.assertTrue(pod_sec["runAsNonRoot"])
        self.assertEqual(pod_sec["runAsUser"], 10001)
        self.assertEqual(pod_sec["runAsGroup"], 10001)
        self.assertEqual(pod_sec["fsGroup"], 10001)
        self.assertEqual(pod_sec["seccompProfile"]["type"], "RuntimeDefault")

        # Container-Level Security Context: Zero Privilege Escalation & Dropped Capabilities
        container = pod_spec["containers"][0]
        self.assertEqual(container["name"], "barely-isolated-runner")
        container_sec = container["securityContext"]
        self.assertFalse(container_sec["allowPrivilegeEscalation"])
        self.assertEqual(container_sec["capabilities"]["drop"], ["ALL"])

        # Entrypoint command
        self.assertIn("--single-run", container["command"])
        self.assertIn("job_abc12345", container["command"])

        # Chromium /dev/shm shared memory RAM disk volume
        volume_mounts = {vm["name"]: vm["mountPath"] for vm in container["volumeMounts"]}
        self.assertEqual(volume_mounts.get("dshm"), "/dev/shm")

        volumes = {v["name"]: v for v in pod_spec["volumes"]}
        self.assertIn("dshm", volumes)
        self.assertEqual(volumes["dshm"]["emptyDir"]["medium"], "Memory")
        self.assertEqual(volumes["dshm"]["emptyDir"]["sizeLimit"], "1Gi")

    def test_spawner_name_sanitization(self):
        spawner = K8sJobSpawner()
        clean = spawner._sanitize_job_name("Job_ABC-123_Test!@#$")
        self.assertTrue(clean.startswith("barely-job-"))
        self.assertFalse(any(c in clean for c in ["!", "@", "#", "$", "_"]))
        self.assertLessEqual(len(clean), 63)

    def test_spawner_outside_cluster_availability(self):
        spawner = K8sJobSpawner()
        # In local/test environment without serviceaccount credentials, should safely report unavailable
        self.assertFalse(spawner.is_available)
        status = spawner.get_cluster_status()
        self.assertFalse(status["can_spawn_jobs"])
        self.assertEqual(status["security_profile"]["run_as_user"], 10001)
        self.assertFalse(status["security_profile"]["allow_privilege_escalation"])

    def test_execution_engine_status_mocked(self):
        with patch("barely_core.k8s.spawner.get_setting") as mock_get, \
             patch("barely_core.k8s.spawner.can_spawn_runner", return_value=(True, 2, 10)), \
             patch("barely_core.k8s.spawner.get_queued_runner_count", return_value=1):
            mock_get.side_effect = lambda k: "k8s_job" if k == "EXECUTION_MODE" else "10"
            status = get_execution_engine_status()
            self.assertEqual(status["mode"], "k8s_job")
            self.assertEqual(status["max_parallel_pods"], 10)
            self.assertEqual(status["active_pods"], 2)
            self.assertEqual(status["queued_runs"], 1)
            self.assertTrue(status["can_spawn_now"])
            self.assertEqual(status["concurrency_source"], "Helm values.yaml (execution.maxParallelPods)")
            self.assertIn("Kubernetes Ephemeral Pods", status["mode_description"])

    def test_active_and_queued_runner_count(self):
        from barely_core.k8s.spawner import get_active_runner_count, get_queued_runner_count

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.count.return_value = 3
        count = get_active_runner_count(mock_db)
        self.assertEqual(count, 3)

        mock_db.query.return_value.filter.return_value.count.return_value = 2
        queued = get_queued_runner_count(mock_db)
        self.assertEqual(queued, 2)

    def test_can_spawn_runner_concurrency_gating(self):
        from barely_core.k8s.spawner import can_spawn_runner
        from unittest.mock import patch

        with patch("barely_core.k8s.spawner.get_setting", return_value="10"):
            # When active is under limit (4 < 10): can spawn
            with patch("barely_core.k8s.spawner.get_active_runner_count", return_value=4):
                can_spawn, active, max_pods = can_spawn_runner()
                self.assertTrue(can_spawn)
                self.assertEqual(active, 4)
                self.assertEqual(max_pods, 10)

            # When active is at limit (10 == 10): cannot spawn (gated)
            with patch("barely_core.k8s.spawner.get_active_runner_count", return_value=10):
                can_spawn, active, max_pods = can_spawn_runner()
                self.assertFalse(can_spawn)
                self.assertEqual(active, 10)
                self.assertEqual(max_pods, 10)

            # When active exceeds limit (11 > 10): cannot spawn
            with patch("barely_core.k8s.spawner.get_active_runner_count", return_value=11):
                can_spawn, active, max_pods = can_spawn_runner()
                self.assertFalse(can_spawn)

    def test_drain_queued_runs_dispatches_when_slot_frees_up(self):
        from barely_core.k8s.spawner import drain_queued_runs
        from unittest.mock import MagicMock, patch

        mock_db = MagicMock()
        mock_run = MagicMock()
        mock_run.id = "job_queued1"
        mock_run.status = "queued"
        mock_run.logs = ""

        # First loop: 1 slot free. Second loop: 0 slots free (stops loop)
        with patch("barely_core.k8s.spawner.can_spawn_runner", side_effect=[(True, 9, 10), (False, 10, 10)]):
            with patch("barely_core.k8s.spawner.K8sJobSpawner") as MockSpawnerClass:
                mock_spawner = MockSpawnerClass.return_value
                mock_spawner.is_available = True
                mock_spawner.spawn_job.return_value = (True, "barely-job-job-queued1", None)

                mock_query = mock_db.query.return_value.filter.return_value.order_by.return_value
                mock_query.first.return_value = mock_run

                dispatched = drain_queued_runs(mock_db)
                self.assertEqual(dispatched, 1)
                self.assertEqual(mock_run.status, "pending")
                self.assertEqual(mock_run.runner_pod, "barely-job-job-queued1")
                self.assertIn("Runner Slot Available", mock_run.logs)

if __name__ == "__main__":
    unittest.main()
