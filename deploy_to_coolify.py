import os
import sys
import io
import tarfile
import base64
import time
import requests

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Coolify Configuration
COOLIFY_URL = "https://coolify.cajuru.cloud/api/v1"
TOKEN = "8|80vN2hmTZUasrwsMZmo28ACTDe6ljwu6LiEE129S1e4c3f50"
PROJECT_UUID = "uh3neoi46bialhl81gxsf7n6" # Pitim Petiscaria project
SERVER_UUID = "zcc0o80osccsgssswgosco4o"  # localhost Coolify server
ENV_NAME = "production"
PRIMARY_DOMAIN = "http://pitim.187.77.41.37.sslip.io"

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def filter_tar(tarinfo):
    name = tarinfo.name
    # Exclude old cardapio files, temporary and cache files
    exclude_patterns = [
        "__pycache__", ".git", "uploads", "sound", "seed_data",
        "auth.py", "database.py", "index.html", "acesso.html",
        "andirbys", ".pyc", ".db", ".zip", ".wav"
    ]
    if any(p in name for p in exclude_patterns):
        return None
    return tarinfo

def create_bundle_dockerfile():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=9) as tar:
        req_path = os.path.join(BASE_DIR, "requirements.txt")
        tar.add(req_path, arcname="requirements.txt")

        tar.add(os.path.join(BASE_DIR, "app"), arcname="app", filter=filter_tar)
        tar.add(os.path.join(BASE_DIR, "templates"), arcname="templates", filter=filter_tar)

        for s in ["css", "js", "img"]:
            p = os.path.join(BASE_DIR, "static", s)
            if os.path.exists(p):
                tar.add(p, arcname=f"static/{s}", filter=filter_tar)

    compressed_bytes = buf.getvalue()
    b64_bundle = base64.b64encode(compressed_bytes).decode("utf-8")

    print(f"📦 Pacote comprimido: {len(compressed_bytes)} bytes (~{len(compressed_bytes)//1024} KB)")
    print(f"📦 Base64 total: {len(b64_bundle)} caracteres")

    # 7.5KB safe chunks to avoid Linux posix_spawn argument length limits
    chunk_size = 7500
    chunks = [b64_bundle[i:i+chunk_size] for i in range(0, len(b64_bundle), chunk_size)]
    print(f"📦 Dividido em {len(chunks)} blocos de ~7.5KB")

    echo_lines = [f'RUN printf "%s" "{c}" >> /tmp/bundle.b64' for c in chunks]
    echo_block = "\n".join(echo_lines)

    dockerfile = f"""FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

{echo_block}

RUN base64 -d /tmp/bundle.b64 | tar -xz -C /app && rm /tmp/bundle.b64

RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/data /app/data/uploads /app/data/uploads/ads

ENV PORT=8000
ENV DATA_DIR=/app/data
ENV PYTHONUNBUFFERED=1
ENV SESSION_SECRET=pitim-secret-cajuru-cloud-2026

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
"""
    return dockerfile

def main():
    print("=" * 65)
    print("🚀 DEPLOY PITIM PETISCARIA - SISTEMA DE TV BOX & PAINEL REMOTO")
    print(f"🌐 Domínio: {PRIMARY_DOMAIN}")
    print("=" * 65)

    # 1. Clean up old apps in this project or domain conflicts
    print("\n🔍 1. Verificando aplicações existentes no projeto Pitim Petiscaria...")
    try:
        r_env = requests.get(f"{COOLIFY_URL}/projects/{PROJECT_UUID}/{ENV_NAME}", headers=HEADERS)
        if r_env.status_code == 200:
            env_data = r_env.json()
            for app in env_data.get("applications", []):
                uuid = app.get("uuid")
                name = app.get("name")
                print(f"   Removendo aplicação anterior: {uuid} ({name})...")
                requests.delete(f"{COOLIFY_URL}/applications/{uuid}?delete_configurations=true", headers=HEADERS)
                time.sleep(1)
    except Exception as e:
        print(f"   Aviso ao listar recursos: {e}")

    # 2. Build Dockerfile with bundle
    print("\n📦 2. Criando pacote otimizado e Dockerfile...")
    dockerfile_content = create_bundle_dockerfile()
    b64_dockerfile = base64.b64encode(dockerfile_content.encode("utf-8")).decode("utf-8")

    # 3. Create Application in Coolify
    print("\n🌐 3. Registrando aplicação no Coolify...")
    app_payload = {
        "project_uuid": PROJECT_UUID,
        "server_uuid": SERVER_UUID,
        "environment_name": ENV_NAME,
        "dockerfile": b64_dockerfile,
        "ports_exposes": "8000"
    }

    resp = requests.post(f"{COOLIFY_URL}/applications/dockerfile", json=app_payload, headers=HEADERS)
    print(f"Status Code: {resp.status_code}")

    if resp.status_code not in [200, 201]:
        print(f"[ERRO] Falha ao criar aplicação no Coolify: {resp.text}")
        sys.exit(1)

    app_data = resp.json()
    app_uuid = app_data.get("uuid")
    print(f"\n[SUCESSO] Aplicação criada no Coolify! UUID: {app_uuid}")

    # 4. Configure Domain & Name
    print(f"\n🔧 4. Configurando domínio {PRIMARY_DOMAIN} e porta 8000...")
    patch_payload = {
        "name": "Pitim Petiscaria - TV",
        "description": "Sistema TV Box com Propagandas & Player YouTube e Painel de Controle Remoto",
        "domains": PRIMARY_DOMAIN,
        "ports_exposes": "8000",
        "health_check_path": "/api/state"
    }
    r_patch = requests.patch(f"{COOLIFY_URL}/applications/{app_uuid}", json=patch_payload, headers=HEADERS)
    print(f"Config Status: {r_patch.status_code}")

    # 5. Add Persistent Volume Storage (/app/data)
    print("\n💾 5. Configurando volume persistente para /app/data...")
    storage_payload = {
        "type": "persistent",
        "name": "pitim-data",
        "mount_path": "/app/data"
    }
    r_stor = requests.post(f"{COOLIFY_URL}/applications/{app_uuid}/storages", json=storage_payload, headers=HEADERS)
    print(f"Storage Status: {r_stor.status_code}")

    # 6. Trigger Deployment
    print(f"\n🚀 6. Disparando Deploy da aplicação {app_uuid}...")
    deploy_payload = {"uuid": app_uuid}
    r_deploy = requests.post(f"{COOLIFY_URL}/deploy", json=deploy_payload, headers=HEADERS)
    print(f"Deploy Trigger Status: {r_deploy.status_code}")

    if r_deploy.status_code in [200, 201]:
        deploy_info = r_deploy.json()
        deployments = deploy_info.get("deployments", [])
        deployment_uuid = deployments[0].get("deployment_uuid") if deployments else None
        print(f"\n✨ [OK] Deploy iniciado com sucesso no Coolify!")
        print(f"Deployment UUID: {deployment_uuid}")
        print(f"TV WebApp: {PRIMARY_DOMAIN}")
        print(f"Painel Remoto: {PRIMARY_DOMAIN}/acesso")

        # 7. Monitor deployment progress
        if deployment_uuid:
            print("\n⏳ 7. Monitorando progresso do build e deploy...")
            for i in range(60):
                time.sleep(3)
                r_status = requests.get(f"{COOLIFY_URL}/deployments/{deployment_uuid}", headers=HEADERS)
                if r_status.status_code == 200:
                    status_data = r_status.json()
                    st = status_data.get("status")
                    print(f"   Status atual [{i+1}/60]: {st}")
                    if st == "finished":
                        print(f"\n" + "=" * 65)
                        print(f"🎉 [SUCESSO TOTAL] Deploy concluído com sucesso!")
                        print(f"📺 TV WEBAPP: {PRIMARY_DOMAIN}")
                        print(f"📱 PAINEL DE CONTROLE / ACESSO: {PRIMARY_DOMAIN}/acesso")
                        print(f"🔑 Login: admin | Senha: admin123")
                        print("=" * 65)
                        break
                    elif st == "failed":
                        print(f"\n❌ [ERRO] O deploy falhou. Verificando logs...")
                        logs = status_data.get("logs", "")
                        print(logs[-1500:] if logs else "Sem logs disponíveis.")
                        break
    else:
        print(f"[AVISO] Deploy retornou status inesperado: {r_deploy.text}")

if __name__ == "__main__":
    main()
