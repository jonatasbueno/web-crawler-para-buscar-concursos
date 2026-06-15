#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [[ "$PROJECT_DIR" == *'|'* ]] || [[ "$PROJECT_DIR" == *$'\n'* ]]; then
  echo "Caminho do projeto inválido para instalação do cron." >&2
  exit 1
fi

mkdir -p "$SYSTEMD_USER_DIR" "$PROJECT_DIR/data"

install_unit() {
  local template="$1"
  local dest="$2"
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$template" > "$dest"
}

install_unit "$PROJECT_DIR/systemd/crawler-concursos.service" \
  "$SYSTEMD_USER_DIR/crawler-concursos.service"

install_unit "$PROJECT_DIR/systemd/crawler-concursos-catchup.service" \
  "$SYSTEMD_USER_DIR/crawler-concursos-catchup.service"

cp "$PROJECT_DIR/systemd/crawler-concursos.timer" \
  "$SYSTEMD_USER_DIR/crawler-concursos.timer"

systemctl --user daemon-reload
systemctl --user enable --now crawler-concursos.timer
systemctl --user enable --now crawler-concursos-catchup.service

echo ""
echo "Timer instalado. Próxima execução:"
systemctl --user list-timers crawler-concursos.timer
echo ""
echo "Catch-up habilitado: roda ao ligar o PC se passou das 10h e ainda não executou hoje."
echo ""
echo "Para o timer funcionar sem login, execute:"
echo "  loginctl enable-linger \"\$USER\""
