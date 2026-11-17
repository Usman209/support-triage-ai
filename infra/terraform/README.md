# terraform (task 9, placeholder)

Infrastructure as code for Azure:

- **AKS**: Kubernetes cluster running the API, web app and workers (deployed with the Helm chart in `../helm`).
- **ACR**: container registry for the app images.
- **Azure Database for PostgreSQL (Flexible Server)** with the `vector` extension enabled.

Status: placeholder files only. State files and `*.tfvars` are gitignored; secrets go in Key Vault
or CI secrets, never in this folder.
