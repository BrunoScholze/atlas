param($PromptFile, $OutputFile, $RepoPath, $LogFile)

# -------------------------------------------------------
# Helpers de log
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
# Força UTF-8 no console para não corromper a saída do Claude
# -------------------------------------------------------
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

# -------------------------------------------------------
# Início
# -------------------------------------------------------
LogSep
Log "INFO" "=== AGENTE DE CHAMADOS - POWERSHELL INICIADO ==="
LogSep
Log "INFO" "PromptFile : $PromptFile"
Log "INFO" "OutputFile : $OutputFile"
Log "INFO" "RepoPath   : $RepoPath"
Log "INFO" "LogFile    : $LogFile"
LogSep

# Lê o prompt para logging
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
$ticketInfo = if ($ticketLine) { $ticketLine.Trim() } else { '(nao encontrado)' }
$funcInfo   = if ($funcLine)   { $funcLine.Trim()   } else { '(nao encontrado)' }
Log "INFO" "Ticket         : $ticketInfo"
Log "INFO" "Funcionalidades: $funcInfo"
LogSep

# Muda para o diretório do repositório
Log "INFO" "Mudando para repositorio: $RepoPath"
try {
    Set-Location $RepoPath
    Log "INFO" "Diretorio atual: $(Get-Location)"
} catch {
    Log "ERROR" "Falha ao mudar de diretorio: $_"
    exit 1
}

LogSep
Log "INFO" "Chamando Claude Code via stdin..."
Log "INFO" "Flags: --dangerously-skip-permissions --print"
LogSep

# -------------------------------------------------------
# Executa o Claude Code — pipe nativo do PowerShell (evita cmd /c)
# -------------------------------------------------------
$startTime = Get-Date
try {
    $promptContent = [System.IO.File]::ReadAllText($PromptFile, [System.Text.Encoding]::UTF8)
    $result        = $promptContent | & claude --dangerously-skip-permissions --print
    $exitCode      = $LASTEXITCODE
} catch {
    Log "ERROR" "Excecao ao chamar claude: $_"
    exit 1
}

$elapsed = [int]((Get-Date) - $startTime).TotalSeconds
LogSep
Log "INFO" "Claude finalizado. Exit code: $exitCode | Tempo: ${elapsed}s"

# -------------------------------------------------------
# Grava o resultado em UTF-8
# -------------------------------------------------------
if ($result -and ($result | Out-String).Trim().Length -gt 0) {
    $resultStr = ($result | Out-String).Trim()
    # Remove BOM se presente (U+FEFF)
    if ($resultStr.Length -gt 0 -and [int][char]$resultStr[0] -eq 65279) {
        $resultStr = $resultStr.Substring(1)
    }
    Log "INFO" "Resultado: $($resultStr.Length) chars"

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
    Log "WARN" "Claude nao retornou conteudo (resultado vazio)"
    Log "WARN" "Exit code foi: $exitCode"
    [System.IO.File]::WriteAllText($OutputFile, "", [System.Text.Encoding]::UTF8)
}

LogSep
Log "INFO" "=== POWERSHELL CONCLUIDO ==="
LogSep
