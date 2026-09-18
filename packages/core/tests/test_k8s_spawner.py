import unittest
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
        import sys
        from unittest.mock import MagicMock
        mock_settings = MagicMock()
        mock_settings.get_setting.side_effect = lambda k: "k8s_job" if k == "EXECUTION_MODE" else "8"
        sys.modules["barely_core.settings"] = mock_settings
        try:
            status = get_execution_engine_status()
            self.assertEqual(status["mode"], "k8s_job")
            self.assertEqual(status["max_parallel_pods"], 8)
            self.assertIn("Kubernetes Ephemeral Pods", status["mode_description"])
        finally:
            sys.modules.pop("barely_core.settings", None)

if __name__ == "__main__":
    unittest.main()
