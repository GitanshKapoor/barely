import os
import re
import ssl
import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger("barely_k8s_spawner")

class K8sJobSpawner:
    """
    Kubernetes batch/v1 Job Spawner for Ephemeral, Non-Root Runner Pods.
    Zero external dependencies — communicates directly with the Kubernetes Control Plane
    using standard Python urllib, in-cluster ServiceAccount token, and TLS ca.crt.

    Guarantees:
    1. 1:1 Pod Isolation per test run (Linux namespace & process tree boundary).
    2. Strict Non-Root Execution (UID 10001, GID 10001).
    3. Zero Privilege Escalation (allowPrivilegeEscalation: false, capabilities: drop: ["ALL"]).
    4. Chromium /dev/shm in-memory sandbox to prevent Bus Error crashes.
    5. Automatic garbage collection via ttlSecondsAfterFinished.
    """

    SERVICE_ACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"

    def __init__(self, namespace: Optional[str] = None):
        self._token: Optional[str] = None
        self._ca_cert_path: Optional[str] = None
        self._namespace: str = namespace or os.getenv("KUBERNETES_NAMESPACE") or "barely"
        self._host: Optional[str] = None
        self._port: str = os.getenv("KUBERNETES_SERVICE_PORT", "443")
        
        # Discover in-cluster API server
        k8s_host = os.getenv("KUBERNETES_SERVICE_HOST")
        if k8s_host:
            self._host = f"https://{k8s_host}:{self._port}"

        # Discover in-cluster ServiceAccount
        token_path = os.path.join(self.SERVICE_ACCOUNT_DIR, "token")
        ca_path = os.path.join(self.SERVICE_ACCOUNT_DIR, "ca.crt")
        ns_path = os.path.join(self.SERVICE_ACCOUNT_DIR, "namespace")

        if os.path.isfile(token_path):
            try:
                with open(token_path, "r", encoding="utf-8") as f:
                    self._token = f.read().strip()
            except Exception as e:
                logger.debug(f"Could not read K8s SA token: {e}")

        if os.path.isfile(ca_path):
            self._ca_cert_path = ca_path

        if not namespace and os.path.isfile(ns_path):
            try:
                with open(ns_path, "r", encoding="utf-8") as f:
                    ns = f.read().strip()
                    if ns:
                        self._namespace = ns
            except Exception as e:
                logger.debug(f"Could not read K8s namespace: {e}")

    @property
    def is_available(self) -> bool:
        """Returns True if running inside a Kubernetes cluster with service account credentials."""
        return bool(self._host and self._token and os.path.isfile(self._ca_cert_path or ""))

    def get_cluster_status(self) -> Dict[str, Any]:
        """Returns the active Kubernetes cluster and RBAC discovery state."""
        return {
            "is_kubernetes": bool(self._host),
            "has_service_account": bool(self._token),
            "namespace": self._namespace,
            "api_endpoint": self._host,
            "can_spawn_jobs": self.is_available,
            "security_profile": {
                "run_as_non_root": True,
                "run_as_user": 10001,
                "run_as_group": 10001,
                "allow_privilege_escalation": False,
                "capabilities_dropped": ["ALL"],
                "seccomp_profile": "RuntimeDefault",
                "shm_memory_mount": "/dev/shm (1Gi Memory)"
            }
        }

    def _sanitize_job_name(self, run_id: str) -> str:
        """Converts run_id into a valid RFC 1123 Kubernetes job name (max 63 chars)."""
        clean = re.sub(r'[^a-z0-9\-]', '-', run_id.lower())
        clean = re.sub(r'-+', '-', clean).strip('-')
        job_name = f"barely-job-{clean}"
        return job_name[:63].rstrip('-')

    def build_job_manifest(self, run_id: str) -> Dict[str, Any]:
        """
        Constructs the Kubernetes batch/v1 Job specification.
        Enforces CNCF Pod Security Standards (Restricted profile) & non-root context.
        """
        job_name = self._sanitize_job_name(run_id)
        worker_image = os.getenv("BARELY_WORKER_IMAGE", "barely-worker:latest")
        image_pull_policy = os.getenv("BARELY_IMAGE_PULL_POLICY", "IfNotPresent")
        db_url = os.getenv("DATABASE_URL", "postgresql://barely:barelypassword@barely-db:5432/barelydb")
        secrets_name = os.getenv("BARELY_SECRETS_NAME", "barely-secrets")
        config_name = os.getenv("BARELY_CONFIG_NAME", "barely-config")

        return {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {
                "name": job_name,
                "namespace": self._namespace,
                "labels": {
                    "app.kubernetes.io/name": "barely",
                    "app.kubernetes.io/component": "isolated-runner",
                    "barely.run/id": run_id
                }
            },
            "spec": {
                # Auto-delete completed pods from cluster after 180 seconds to free RAM/nodes
                "ttlSecondsAfterFinished": 180,
                # Do not retry failed test runs at the Kubernetes level (1 run = 1 execution)
                "backoffLimit": 0,
                "template": {
                    "metadata": {
                        "labels": {
                            "app.kubernetes.io/name": "barely",
                            "app.kubernetes.io/component": "isolated-runner",
                            "barely.run/id": run_id
                        }
                    },
                    "spec": {
                        "restartPolicy": "Never",
                        # Pod-Level Security Context: Strict Non-Root
                        "securityContext": {
                            "runAsNonRoot": True,
                            "runAsUser": 10001,
                            "runAsGroup": 10001,
                            "fsGroup": 10001,
                            "seccompProfile": {
                                "type": "RuntimeDefault"
                            }
                        },
                        "containers": [
                            {
                                "name": "barely-isolated-runner",
                                "image": worker_image,
                                "imagePullPolicy": image_pull_policy,
                                "command": [
                                    "/opt/.venv/bin/python3",
                                    "packages/worker/src/barely_worker/main.py",
                                    "--single-run",
                                    run_id
                                ],
                                # Container-Level Security Context: Zero Privilege Escalation
                                "securityContext": {
                                    "allowPrivilegeEscalation": False,
                                    "readOnlyRootFilesystem": False,
                                    "capabilities": {
                                        "drop": ["ALL"]
                                    }
                                },
                                "resources": {
                                    "requests": {
                                        "cpu": "500m",
                                        "memory": "1Gi"
                                    },
                                    "limits": {
                                        "cpu": "2000m",
                                        "memory": "2.5Gi"
                                    }
                                },
                                "env": [
                                    {"name": "DATABASE_URL", "value": db_url},
                                    {"name": "BARELY_SINGLE_RUN_ID", "value": run_id},
                                    {"name": "HEADLESS", "value": "true"},
                                    {"name": "BARELY_SECRETS_DIR", "value": "/etc/secrets/barely"}
                                ],
                                "volumeMounts": [
                                    # Chromium Shared Memory: prevents "Bus error" crashes in headless mode
                                    {
                                        "name": "dshm",
                                        "mountPath": "/dev/shm"
                                    },
                                    # Optional mounted secrets from K8s Secret or ESO
                                    {
                                        "name": "secrets-volume",
                                        "mountPath": "/etc/secrets/barely",
                                        "readOnly": True
                                    }
                                ]
                            }
                        ],
                        "volumes": [
                            # In-memory RAM disk for Chromium IPC rendering
                            {
                                "name": "dshm",
                                "emptyDir": {
                                    "medium": "Memory",
                                    "sizeLimit": "1Gi"
                                }
                            },
                            # Mount K8s Secret (optional if exists)
                            {
                                "name": "secrets-volume",
                                "secret": {
                                    "secretName": secrets_name,
                                    "optional": True
                                }
                            }
                        ]
                    }
                }
            }
        }

    def spawn_job(self, run_id: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Dispatches an ephemeral, non-root runner Job to the Kubernetes cluster API.
        Returns: (success: bool, job_name: Optional[str], error: Optional[str])
        """
        job_manifest = self.build_job_manifest(run_id)
        job_name = job_manifest["metadata"]["name"]

        if not self.is_available:
            logger.info(f"K8s API not accessible in current environment. Cannot spawn K8s job for {run_id}.")
            return False, None, "Kubernetes in-cluster API or ServiceAccount credentials not available."

        url = f"{self._host}/apis/batch/v1/namespaces/{self._namespace}/jobs"
        req_data = json.dumps(job_manifest).encode("utf-8")

        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        ssl_ctx = ssl.create_default_context(cafile=self._ca_cert_path)

        try:
            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=12) as response:
                resp_json = json.loads(response.read().decode("utf-8"))
                created_name = resp_json.get("metadata", {}).get("name", job_name)
                logger.info(f"Spawned isolated Kubernetes Job: {created_name} for run {run_id}")
                return True, created_name, None
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
                detail = err_body.get("message") or str(err_body)
            except Exception:
                detail = f"HTTP {e.code} {e.reason}"
            logger.error(f"K8s Job creation failed for {run_id}: {detail}")
            return False, None, f"Kubernetes API error ({e.code}): {detail}"
        except Exception as e:
            logger.error(f"Failed to communicate with Kubernetes API: {e}")
            return False, None, f"Cluster communication failure: {str(e)}"

def get_execution_engine_status() -> Dict[str, Any]:
    """Provides a consolidated summary of the execution engine and pod isolation configuration."""
    from barely_core.settings import get_setting
    spawner = K8sJobSpawner()
    mode = (get_setting("EXECUTION_MODE") or "worker_pool").strip().lower()
    max_pods = int(get_setting("MAX_PARALLEL_PODS") or "5")

    return {
        "mode": mode,
        "max_parallel_pods": max_pods,
        "cluster": spawner.get_cluster_status(),
        "is_k8s_available": spawner.is_available,
        "mode_description": (
            "Kubernetes Ephemeral Pods (1 Test per Isolated Pod, Non-Root UID 10001)"
            if mode == "k8s_job" else
            "Persistent Worker Pool (Shared Daemon Workers)"
        )
    }
