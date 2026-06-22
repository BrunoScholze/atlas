@echo off
:: Script que executa o Claude Code no repositório do app
:: Argumento %1: caminho do arquivo com o prompt
:: --dangerously-skip-permissions: necessário para modo não-interativo (sem aprovação manual)

cd /d "%REPO_PATH%"
claude --dangerously-skip-permissions --print < "%~1"
