#!/usr/bin/env bash
# Args: <PromptFile> <OutputFile> <RepoPath> <LogFile> [modo]
PROMPT_FILE="$1"
OUTPUT_FILE="$2"
REPO_PATH="$3"
LOG_FILE="$4"
MODO="${5:-}"

log() {
  local level="$1"
  local msg="$2"
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S.000')
  local line="[$ts] [$level] $msg"
  echo "$line"
  [ -n "$LOG_FILE" ] && echo "$line" >> "$LOG_FILE"
}

sep() { log "----" "----------------------------------------------------------------"; }

sep
log "INFO" "=== AGENTE DE CHAMADOS - BASH INICIADO ==="
sep
log "INFO" "PromptFile : $PROMPT_FILE"
log "INFO" "OutputFile : $OUTPUT_FILE"
log "INFO" "RepoPath   : $REPO_PATH"
log "INFO" "LogFile    : $LOG_FILE"
sep

if [ ! -f "$PROMPT_FILE" ]; then
  log "ERROR" "Arquivo de prompt não encontrado: $PROMPT_FILE"
  exit 1
fi

log "INFO" "Mudando para repositório: $REPO_PATH"
if ! cd "$REPO_PATH" 2>/dev/null; then
  log "ERROR" "Falha ao mudar de diretório: $REPO_PATH"
  exit 1
fi
log "INFO" "Diretório atual: $(pwd)"

sep
log "INFO" "Chamando Claude Code via stdin..."
if [ "$MODO" = "continue" ]; then
  log "INFO" "Flags: --dangerously-skip-permissions --print --continue"
else
  log "INFO" "Flags: --dangerously-skip-permissions --print"
fi
sep

START=$(date +%s)

if [ "$MODO" = "continue" ]; then
  RESULT=$(claude --dangerously-skip-permissions --print --continue < "$PROMPT_FILE" 2>>"$LOG_FILE")
else
  RESULT=$(claude --dangerously-skip-permissions --print < "$PROMPT_FILE" 2>>"$LOG_FILE")
fi
EXIT_CODE=$?

END=$(date +%s)
ELAPSED=$((END - START))

sep
log "INFO" "Claude finalizado. Exit code: $EXIT_CODE | Tempo: ${ELAPSED}s"

if [ -n "$RESULT" ]; then
  log "INFO" "Resultado: ${#RESULT} chars"
  printf '%s' "$RESULT" > "$OUTPUT_FILE"
  log "INFO" "output.txt gravado com sucesso"
else
  log "WARN" "Claude não retornou conteúdo (resultado vazio)"
  printf '' > "$OUTPUT_FILE"
fi

sep
log "INFO" "=== BASH CONCLUÍDO ==="
sep
