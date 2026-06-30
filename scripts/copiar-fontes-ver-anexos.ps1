param(
    [string]$Origem  = "C:\azure\EMS2\progress\src",
    [string]$Destino = "C:\azure\atlas\repos\EMS2\progress\src"
)

$arquivos = @(
    "cpp\api\v1\productionMobile.p",
    "fch\fchman\fchmanproductionmobile.p"
)

$copiados = 0
$naoEncontrados = @()

foreach ($rel in $arquivos) {
    $src = Join-Path $Origem  $rel
    $dst = Join-Path $Destino $rel

    if (-not (Test-Path $src)) {
        $naoEncontrados += $rel
        continue
    }

    $dir = Split-Path $dst -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    Copy-Item -Path $src -Destination $dst -Force
    Write-Host "OK  $rel"
    $copiados++
}

Write-Host ""
Write-Host "Copiados : $copiados"

if ($naoEncontrados.Count -gt 0) {
    Write-Host "Nao encontrados ($($naoEncontrados.Count)):"
    $naoEncontrados | ForEach-Object { Write-Host "    $_" }
}
