#!/usr/bin/env bash
set -euo pipefail

# If you could not download the model from the official site, you can use the mirror site.
# Just remove the comment of the following line.
# 如果你无法从官方网站下载模型，你可以使用镜像网站。
# 只需要移除下面一行的注释即可。
# export HF_ENDPOINT=https://hf-mirror.com

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${ROOT_DIR}/webui/Main.py"
VENV_DIR="${ROOT_DIR}/.venv"
PY="${VENV_DIR}/bin/python"
PIP="${VENV_DIR}/bin/pip"
ST="${VENV_DIR}/bin/streamlit"

ensure_venv_and_requirements() {
  local need_install=0

  if [ ! -d "${VENV_DIR}" ]; then
    need_install=1
    if command -v uv >/dev/null 2>&1; then
      uv venv "${VENV_DIR}" -p python3
    else
      python3 -m venv "${VENV_DIR}"
    fi
  fi

  local req_file="${ROOT_DIR}/requirements.txt"
  local req_hash_file="${VENV_DIR}/.requirements.sha256"
  local current_hash=""
  if command -v shasum >/dev/null 2>&1; then
    current_hash=$(shasum -a 256 "$req_file" | awk '{print $1}')
  elif command -v sha256sum >/dev/null 2>&1; then
    current_hash=$(sha256sum "$req_file" | awk '{print $1}')
  else
    need_install=1
  fi

  if [ ! -x "${ST}" ]; then
    need_install=1
  elif [ -n "${current_hash}" ] && [ ! -f "${req_hash_file}" ]; then
    need_install=1
  elif [ -n "${current_hash}" ] && [ -f "${req_hash_file}" ] && [ "$(cat "${req_hash_file}")" != "${current_hash}" ]; then
    need_install=1
  fi

  if [ $need_install -eq 1 ]; then
    if command -v uv >/dev/null 2>&1; then
      uv pip install -p "${PY}" -r "$req_file"
    else
      "${PIP}" install --upgrade pip
      "${PIP}" install -r "$req_file"
    fi
    if [ -n "${current_hash}" ]; then
      echo "${current_hash}" >"${req_hash_file}"
    fi
  fi
}

ensure_venv_and_requirements

# Prefer binding to all interfaces and disable CORS/XSRF for reverse proxies/tunnels.
PORT="${PORT:-8501}"
exec "${ST}" run "${APP}" \
  --server.address="0.0.0.0" \
  --server.port="${PORT}" \
  --server.enableCORS=false \
  --server.enableXsrfProtection=false \
  --browser.gatherUsageStats=false
