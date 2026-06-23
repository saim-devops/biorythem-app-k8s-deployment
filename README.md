Biorhythm Dashboard — Production-Style Kubernetes Deployment

A fully containerized Node.js application deployed on a self-managed Kubernetes cluster using kind (Kubernetes in Docker). This project covers advanced Kubernetes concepts including custom Docker images, DaemonSets, Jobs, Sidecar & Init Containers, NetworkPolicy, Prometheus + Grafana monitoring, VPA, HPA, and Rolling Updates with Rollback.

***
Application

Biorhythm Dashboard — A Node.js + Express web application that calculates and visualizes biorhythm cycles (Physical, Emotional, Intellectual, Intuitive) based on a user's birthdate. Served as a Single Page Application with a REST API backend.

Docker Hub: saimwaxonit/biorythm-app:1.4
API Endpoint: GET /api/biorhythm?birthdate=YYYY-MM-DD
Port: 5000

***
Concepts Used

Concept	File	Role
Namespace	namespace.yml	Isolates all resources under nodeapp namespace
ConfigMap	configmap.yml	Stores non-sensitive app config (PORT, NODE_ENV, APP_NAME)
Secret	secret.yml	Stores sensitive values (SESSION_SECRET)
Deployment	deployment.yml	Runs the Biorhythm app with 2 replicas
Init Container	Inside deployment.yml	Runs pre-flight checks before main app starts
Sidecar Container	Inside deployment.yml	Tails app logs from shared volume alongside main container
ClusterIP Service	service.yml	Exposes app internally to Ingress Controller
Ingress	ingress.yml	Routes external HTTP traffic to app service
Job	job.yml	One-time health check against the app API after deployment
DaemonSet	daemonset.yml	Runs Fluent Bit log collector on every node
Fluent Bit ConfigMap	fluent-bit-configmap.yml	Configures Fluent Bit input/output
NetworkPolicy	networkpolicy.yml	Restricts pod-to-pod traffic — only Ingress Controller allowed in
Prometheus + Grafana	Helm install	Cluster-wide monitoring and dashboards
VPA	vpa.yml	Automatically recommends and adjusts pod resource requests
HPA	hpa.yml	Auto-scales app pods 1→5 based on CPU utilization
Taints & Tolerations	Inside deployment.yml	Allows pods to schedule on tainted control-plane node
Rolling Update	kubectl command	Zero-downtime image update
Rollback	kubectl command	Instant revert to previous deployment revision
	***
Prerequisites

Install Docker
sudo apt update
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
newgrp docker

Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client

Install kind
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.27.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
kind version

Install Helm (for Prometheus + Grafana)
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version

***
Docker Image

Dockerfile highlights
Base image: node:20-alpine — lightweight Alpine-based image (~150MB vs ~1GB for full node image)
Uses npm ci instead of npm install — deterministic, production-safe installs
.dockerignore excludes node_modules, .git, Dockerfile, npm-debug.log

Build and push (always use --platform linux/amd64 for Linux servers)
docker buildx create --use
docker buildx build --platform linux/amd64 \
  -t yourusername/biorythm-app:1.0 \
  --push .

> ⚠️ Critical: If building on Mac with Apple Silicon (M1/M2/M3), always specify --platform linux/amd64. Without this, the image is built for ARM64 and will fail to run on AMD64 Linux servers with no match for platform in manifest error.

***
Cluster Setup

config.yml — kind cluster configuration

Key fields:
extraPortMappings — maps containerPort: 80 → hostPort: 880 and 443 → 4443 on the host
node-labels: ingress-ready=true — marks control-plane for Ingress Controller scheduling
1 control-plane + 2 worker nodes

Create cluster
kind create cluster --name=k8s-project --config=config.yml

Verify nodes
kubectl get nodes

Expected: 3 nodes (1 control-plane + 2 workers) all in Ready status.

Taint the control-plane node
kubectl taint nodes k8s-project-control-plane environment=production:NoSchedule

All pod manifests must have a matching toleration:
tolerations:
- key: "environment"
  operator: "Equal"
  value: "production"
  effect: "NoSchedule"

Remove taint (if needed)
kubectl taint nodes k8s-project-control-plane environment=production:NoSchedule-

***
Install Nginx Ingress Controller

The Ingress Controller is the single entry point for all external HTTP traffic. It reads Ingress rules and routes requests to the correct backend service.

Install
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

Wait for ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

Force onto control-plane node (critical for kind)

The Ingress Controller must run on the control-plane node because port mappings (880→80) only exist there. By default Kubernetes may schedule it on a worker node — patch it:

kubectl patch deployment ingress-nginx-controller -n ingress-nginx --type='json' -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/nodeSelector",
    "value": {
      "ingress-ready": "true"
    }
  }
]'

Verify it is on control-plane
kubectl get pods -n ingress-nginx -o wide

NODE column must show k8s-project-control-plane.

***
Install VPA (Vertical Pod Autoscaler)

VPA is not bundled with Kubernetes — install it separately:

git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh

Verify VPA components
kubectl get pods -n kube-system | grep vpa

Expected 3 pods running:
vpa-admission-controller
vpa-recommender
vpa-updater

***
Install Prometheus + Grafana

Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

Install monitoring stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

Verify all pods running
kubectl get pods -n monitoring

Access Grafana
# Port-forward in background
kubectl port-forward -n monitoring svc/prometheus-grafana 7000:80 --address 0.0.0.0 &

# Get admin password
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath="{.data.admin-password}" | base64 -d

Open browser: http://your-server-ip:7000
Username: admin
Password: output from above command

Pre-built Kubernetes dashboards are available under Dashboards → Kubernetes.

***
Apply Order — This Matters

# 1. Namespace first — everything lives inside it
kubectl apply -f namespace.yml

# 2. ConfigMap — non-sensitive config
kubectl apply -f configmap.yml

# 3. Secrets — sensitive values
kubectl apply -f secret.yml

# 4. Fluent Bit ConfigMap — log collector config
kubectl apply -f fluent-bit-configmap.yml

# 5. DaemonSet — log collector on every node
kubectl apply -f daemonset.yml

# 6. Deployment — main app with init + sidecar containers
kubectl apply -f deployment.yml

# 7. Service — internal ClusterIP
kubectl apply -f service.yml

# 8. Ingress — external routing
kubectl apply -f ingress.yml

# 9. Job — one-time health check
kubectl apply -f job.yml

# 10. NetworkPolicy — traffic restrictions
kubectl apply -f networkpolicy.yml

# 11. HPA — horizontal autoscaling
kubectl apply -f hpa.yml

# 12. VPA — vertical resource recommendations
kubectl apply -f vpa.yml

***
Access the Application

Test from server
curl http://127.0.0.1:880/api/biorhythm?birthdate=1995-01-01

Configure server Nginx as reverse proxy (if port 80 is taken)

sudo nano /etc/nginx/sites-available/nodeapp

server {
    listen 80;
    server_name biorhythm.local;

    location / {
        proxy_pass http://127.0.0.1:880;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

sudo ln -s /etc/nginx/sites-available/nodeapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

Add to local machine hosts file

Mac/Linux:
sudo sh -c 'echo "YOUR_SERVER_IP biorhythm.local" >> /etc/hosts'

Windows — open C:\Windows\System32\drivers\etc\hosts as Administrator:
YOUR_SERVER_IP biorhythm.local

***
Rolling Update & Rollback

Update to new image version
kubectl set image deployment/nodeapp-deployment \
  biorythmic-app-container=saimwaxonit/biorythm-app:1.4 \
  -n nodeapp

Watch rollout progress
kubectl rollout status deployment/nodeapp-deployment -n nodeapp

View rollout history
kubectl rollout history deployment/nodeapp-deployment -n nodeapp

Add meaningful change cause (best practice)
kubectl annotate deployment nodeapp-deployment \
  kubernetes.io/change-cause="updated to image 1.4 with prom-client fix" \
  -n nodeapp

Rollback to previous version
kubectl rollout undo deployment/nodeapp-deployment -n nodeapp

Rollback to specific revision
kubectl rollout undo deployment/nodeapp-deployment --to-revision=2 -n nodeapp

***
Verify Everything

# All pods running
kubectl get pods -n nodeapp

# Check DaemonSet — one pod per node
kubectl get daemonset -n nodeapp

# Check Job completed
kubectl get job -n nodeapp

# Check HPA status
kubectl get hpa -n nodeapp

# Check VPA recommendations
kubectl describe vpa vpa-nodeapp -n nodeapp

# Check Ingress
kubectl get ingress -n nodeapp

# Check NetworkPolicy
kubectl get networkpolicy -n nodeapp

# Check Fluent Bit logs
kubectl logs -n nodeapp -l app=fluent-bit --tail=20

***
Useful Debugging Commands

Pod logs
kubectl logs <pod-name> -n nodeapp
kubectl logs <pod-name> -n nodeapp -c biorythmic-app-container   # specific container
kubectl logs <pod-name> -n nodeapp -c log-sidecar                # sidecar logs
kubectl logs <pod-name> -n nodeapp --previous                    # crashed container logs

Describe pod (shows events and errors)
kubectl describe pod <pod-name> -n nodeapp

Exec into pod
kubectl exec -it <pod-name> -n nodeapp -c biorythmic-app-container -- sh

Check resource usage
kubectl top pods -n nodeapp
kubectl top nodes

Check events
kubectl get events -n nodeapp --sort-by='.lastTimestamp'

***
Common Issues & Solutions

Issue: no match for platform in manifest
Cause: Image built on Mac Apple Silicon (ARM64) but cluster runs on AMD64.
Fix: Always build with explicit platform flag:
docker buildx build --platform linux/amd64 -t yourimage:tag --push .

Issue: MODULE_NOT_FOUND on startup
Cause: npm dependency missing from package.json but used in code.
Fix: Run npm install <package> --save locally, rebuild and push image with new tag.

Issue: Ingress returning 502
Cause: Ingress Controller running on wrong node (worker instead of control-plane).
Fix: Patch with nodeSelector to force it onto control-plane (see Ingress section above).

Issue: Pods not scheduling — 0/3 nodes are available
Cause: Node tainted with environment=production:NoSchedule but pod has no toleration.
Fix: Add matching toleration to every pod spec.

Issue: VPA showing Auto deprecation warning
Cause: updateMode: Auto is deprecated.
Fix: Use updateMode: InPlaceOrRecreate instead.

Issue: Job pod not completing — CrashLoopBackOff
Cause: Job's restartPolicy is wrong. Jobs must use Never or OnFailure, not Always.
Fix: Set restartPolicy: Never in Job pod spec.

Issue: NetworkPolicy blocking all traffic
Cause: Once a NetworkPolicy selects a pod, ALL traffic is denied by default unless explicitly allowed.
Fix: Always allow DNS egress to kube-system on port 53 (UDP+TCP) or pods can't resolve service names.

Issue: Port-forward fails — address already in use
Cause: Port already occupied by another process.
Fix: Use a different host port: kubectl port-forward svc/name 7000:80 instead of 3000:80.

***
Traffic Flow

Browser (biorhythm.local)
        ↓
Server Nginx (port 80) — reverse proxy
        ↓
kind control-plane (hostPort 880)
        ↓
Nginx Ingress Controller pod
        ↓
nodeapp-service (ClusterIP :5000)
        ↓
Biorhythm App pod (Deployment)
  ├── init-check container (runs first, exits)
  ├── biorythmic-app-container (main app)
  └── log-sidecar (tails /var/log/app/app.log)

Every Node:
  └── fluent-bit pod (DaemonSet) — collects /var/log/containers/*.log

***
Cleanup

Delete all app resources
kubectl delete namespace nodeapp

Delete monitoring
helm uninstall prometheus -n monitoring
kubectl delete namespace monitoring

Delete cluster
kind delete cluster --name=k8s-project

***
Author

saim-devops