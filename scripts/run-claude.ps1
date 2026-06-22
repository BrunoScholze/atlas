param($PromptFile, $OutputFile, $RepoPath, $LogFile)

# -------------------------------------------------------
# Helpers de log — escreve no arquivo E na janela visível
# -------------------------------------------------------
function Log {
    param($Level, $Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    if ($LogFile) { Add-Content -Path $LogFile -Value $line -Encoding UTF8 }
}

function LogSep { Log "----" "----------------------------------------------------------------" }

# -------------------------------------------------------
# Início
# -------------------------------------------------------
LogSep
Log "INFO" "=== AGENTE DE CHAMADOS — POWERSHELL INICIADO ==="
LogSep
Log "INFO" "PromptFile : $PromptFile"
Log "INFO" "OutputFile : $OutputFile"
Log "INFO" "RepoPath   : $RepoPath"
Log "INFO" "LogFile    : $LogFile"
LogSep

# Lê o prompt
Log "INFO" "Lendo prompt_temp.txt..."
try {
    $prompt = [System.IO.File]::ReadAllText($PromptFile, [System.Text.Encoding]::UTF8)
    Log "INFO" "Prompt lido: $($prompt.Length) chars"
} catch {
    Log "ERROR" "Falha ao ler prompt: $_"
    exit 1
}

# Extrai TICKET_ID e FUNCIONALIDADES do prompt para log
$ticketLine = ($prompt -split "`n" | Where-Object { $_ -match "^TICKET_ID\s*:" } | Select-Object -First 1)
$funcLine   = ($prompt -split "`n" | Where-Object { $_ -match "^FUNCIONALIDADES\s*:" } | Select-Object -First 1)
Log "INFO" "Ticket       : $($ticketLine.Trim())"
Log "INFO" "Funcionalidades: $($funcLine.Trim())"
LogSep

# Muda para o diretório do repositório
Log "INFO" "Mudando para repositório: $RepoPath"
try {
    Set-Location $RepoPath
    Log "INFO" "Diretório atual: $(Get-Location)"
} catch {
    Log "ERROR" "Falha ao mudar de diretório: $_"
    exit 1
}

LogSep
Log "INFO" "Enviando prompt para o Claude Code via pipe..."
Log "INFO" "Flags: --dangerously-skip-permissions --print"
Log "INFO" "Aguardando resposta (sem timeout)..."
LogSep

# -------------------------------------------------------
# Heartbeat em background — escreve no log a cada 5s
# enquanto o Claude processa
# -------------------------------------------------------
$startTime = Get-Date
$logFileRef = $LogFile
$heartbeat = Start-Job -ScriptBlock {
    param($lf, $st)
    while ($true) {
        Start-Sleep -Seconds 5
        $elapsed = [int]((Get-Date) - $st).TotalSeconds
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
        $line = "[$ts] [WAIT] Claude processando... ${elapsed}s decorridos"
        Write-Output $line
        if ($lf) { Add-Content -Path $lf -Value $line -Encoding UTF8 }
    }
} -ArgumentList $logFileRef, $startTime

# -------------------------------------------------------
# Executa o Claude Code
# -------------------------------------------------------
try {
    $result = $prompt | & claude --dangerously-skip-permissions --print 2>&1
    $exitCode = $LASTEXITCODE
} catch {
    Log "ERROR" "Exceção ao chamar claude: $_"
    Stop-Job $heartbeat -ErrorAction SilentlyContinue
    Remove-Job $heartbeat -ErrorAction SilentlyContinue
    exit 1
}

# Para o heartbeat
Stop-Job $heartbeat -ErrorAction SilentlyContinue
Remove-Job $heartbeat -ErrorAction SilentlyContinue

$elapsed = [int]((Get-Date) - $startTime).TotalSeconds

LogSep
Log "INFO" "Claude finalizado. Exit code: $exitCode | Tempo: ${elapsed}s"

# -------------------------------------------------------
# Verifica e grava o resultado
# -------------------------------------------------------
if ($result -and ($result | Out-String).Trim().Length -gt 0) {
    $resultStr = ($result | Out-String).Trim()
    Log "INFO" "Resultado: $($resultStr.Length) chars"

    # Preview das primeiras 3 linhas
    $preview = ($resultStr -split "`n" | Select-Object -First 3) -join " | "
    Log "INFO" "Preview  : $preview"

    try {
        [System.IO.File]::WriteAllText($OutputFile, $resultStr, [System.Text.Encoding]::UTF8)
        Log "INFO" "output.txt gravado com sucesso"
    } catch {
        Log "ERROR" "Falha ao gravar output.txt: $_"
        exit 1
    }
} else {
    Log "WARN" "Claude não retornou conteúdo! (resultado vazio)"
    Log "WARN" "Exit code foi: $exitCode"
    [System.IO.File]::WriteAllText($OutputFile, "", [System.Text.Encoding]::UTF8)
}

LogSep
Log "INFO" "=== POWERSHELL CONCLUÍDO ==="
LogSep
