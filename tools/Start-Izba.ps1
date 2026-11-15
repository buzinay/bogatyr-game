$ErrorActionPreference = 'Stop'
$projectFolder = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectFolder
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeFile = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodeFile) {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) { $nodeFile = $bundledNode }
}
if (-not $nodeFile) {
    Write-Host 'Node.js не найден. Откройте README.md: там есть другой способ запуска через Python.'
    exit 1
}
$gameUrl = 'http://127.0.0.1:4173/'
$listener = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host 'Порт 4173 уже занят. Если игра уже запущена, откройте http://127.0.0.1:4173/ в браузере.'
    Write-Host 'Для повторного запуска сначала остановите предыдущий запуск.'
    exit 1
}
$serverFile = Join-Path $PSScriptRoot 'serve.cjs'
$previewProcess = Start-Process -FilePath $nodeFile -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $projectFolder -WindowStyle Hidden -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $response = Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 1; $ready = $response.StatusCode -eq 200 } catch {}
        if ($ready) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw 'Не удалось запустить локальный просмотр.' }
    # The launcher is explicitly intended to open a visible game for the user.
    Start-Process $gameUrl
    Write-Host 'Игра открыта: http://127.0.0.1:4173/'
    Write-Host 'Это только локальный просмотр. Ничего не опубликовано в интернете.'
    Read-Host 'Оставьте это окно открытым. Чтобы остановить просмотр, нажмите Enter'
} finally {
    if (-not $previewProcess.HasExited) { Stop-Process -Id $previewProcess.Id -ErrorAction SilentlyContinue }
}
