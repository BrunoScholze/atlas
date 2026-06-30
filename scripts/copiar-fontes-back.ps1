param(
    [string]$Origem  = "C:\azure\EMS2\progress\src",
    [string]$Destino = "C:\azure\atlas\repos\EMS2\progress\src"
)

$arquivos = @(
    # --- API REST facade ---
    "cpp\api\v1\productionOrder.p",

    # --- API handlers ---
    "cpp\apiProductionOrder.p",
    "cpp\apiProductionOrderV1.i",
    "cpp\apiProductionOrderV2.p",
    "cpp\apiProductionOrderV2.i",

    # --- cpapi301 — unidade completa (main + todos os includes) ---
    "cpp\cpapi301.p",
    "cpp\cpapi301a.p",
    "cpp\cpapi301b.p",
    "cpp\cpapi301c.p",
    "cpp\cpapi301c.i",
    "cpp\cpapi301.i",
    "cpp\cpapi301.i3",
    "cpp\cpapi301.i4",
    "cpp\cpapi301.i5",
    "cpp\cpapi301.i6",
    "cpp\cpapi301.i7",
    "cpp\cpapi301.i8",
    "cpp\cpapi301.i9",
    "cpp\cpapi301.i11",
    "cpp\cpapi301.i12",
    "cpp\cpapi301.i13",
    "cpp\cpapi301.i14",
    "cpp\cpapi301.i15",
    "cpp\cpapi301.i16",
    "cpp\cpapi301.i17",
    "cpp\cpapi301.i18",
    "cpp\cpapi301.i19",
    "cpp\cpapi301.i20",
    "cpp\cpapi301.i21",
    "cpp\cpapi301.i22",
    "cpp\cpapi301.i23",
    "cpp\cpapi301.i24",
    "cpp\cpapi301.i25",
    "cpp\cpapi301.i26",
    "cpp\cpapi301.i27",
    "cpp\cpapi301.i28",
    "cpp\cpapi301.i29",
    "cpp\cpapi301.i30",
    "cpp\cpapi301.i31",
    "cpp\cpapi301.i32",
    "cpp\cpapi301.i33",
    "cpp\cpapi301.i34",
    "cpp\cpapi301.i35",
    "cpp\cpapi301.i36",
    "cpp\cpapi301.i37",

    # --- Utilitários de query ---
    "cdp\utils.i"
)

$copiados  = 0
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
