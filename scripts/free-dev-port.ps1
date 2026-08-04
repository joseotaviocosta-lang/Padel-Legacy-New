[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 5174,

    [string]$ProjectRoot = "",

    [switch]$AllowReuse = $true,
    [switch]$TerminateStaleProjectProcess = $true,
    [switch]$LaunchVite,
    [switch]$DiagnoseOnly,

    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if (-not $ProjectRoot) {
    $ProjectRoot = (Get-Location).Path
}
$ProjectRoot = (Resolve-Path -Path $ProjectRoot).Path
$DevUrl = "http://127.0.0.1:$Port/"

function Get-ListeningProcessIds {
    param([int]$TargetPort)

    try {
        $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop
        return @($connections | ForEach-Object { [int]$_.OwningProcess } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    }
    catch {
        Write-Verbose "Get-NetTCPConnection indisponivel; usando netstat.exe. Motivo: $($_.Exception.Message)"
    }

    $escapedPort = [regex]::Escape([string]$TargetPort)
    $pattern = "^\s*TCP\s+\S+:$escapedPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
    $processIds = foreach ($line in (& netstat.exe -ano -p tcp 2>$null)) {
        if ($line -match $pattern) { [int]$Matches[1] }
    }
    return @($processIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
}

function Get-ProcessDetails {
    param([int]$ProcessId)

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    $winProc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue

    [pscustomobject]@{
        PID = $ProcessId
        Name = if ($process) { $process.ProcessName } else { 'Unknown' }
        ExecutablePath = if ($winProc) { $winProc.ExecutablePath } else { $null }
        CommandLine = if ($winProc) { $winProc.CommandLine } else { $null }
        WorkingDirectory = if ($winProc) { $winProc.WorkingDirectory } else { $null }
        IsRunning = $null -ne $process
    }
}

function Probe-DevUrl {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 6 -UseBasicParsing
        return [pscustomobject]@{
            Success = $true
            StatusCode = $response.StatusCode
            Content = $response.Content
            ResponseUri = $response.BaseResponse.ResponseUri.AbsoluteUri
        }
    }
    catch {
        return [pscustomobject]@{
            Success = $false
            Message = $_.Exception.Message
        }
    }
}

function Is-ValidPadelViteServer {
    param($Probe)

    if (-not $Probe.Success) { return $false }
    if ($Probe.Content -match '/@vite/client') { return $true }
    if ($Probe.Content -match '<title>Padel Legacy') { return $true }
    if ($Probe.Content -match 'Padel Legacy') { return $true }
    return $false
}

function Is-ProjectOwnedProcess {
    param($Details)

    if (-not $Details) { return $false }
    $projectPath = $ProjectRoot.TrimEnd('\')
    if ($Details.ExecutablePath -and $Details.ExecutablePath.StartsWith($projectPath, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($Details.WorkingDirectory -and $Details.WorkingDirectory.StartsWith($projectPath, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($Details.CommandLine -and $Details.CommandLine -match [regex]::Escape($projectPath)) { return $true }
    return $false
}

function Format-ProcessSummary {
    param($Details)

    $commandLine = if ($Details.CommandLine) { $Details.CommandLine } else { '<nenhuma linha de comando disponível>' }
    $path = if ($Details.ExecutablePath) { $Details.ExecutablePath } else { '<caminho não disponível>' }
    $working = if ($Details.WorkingDirectory) { $Details.WorkingDirectory } else { '<diretório não disponível>' }

    return @"
PID: $($Details.PID)
Processo: $($Details.Name)
Executável: $path
Diretório: $working
Comando: $commandLine
"@
}

function Wait-ForPortFree {
    param(
        [int]$TargetPort,
        [int]$TimeoutSeconds
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $listeners = @(Get-ListeningProcessIds -TargetPort $TargetPort)
        if ($listeners.Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

function Start-ViteServer {
    Write-Host "[dev-port] Iniciando Vite no projeto $ProjectRoot..." -ForegroundColor Green
    Set-Location -Path $ProjectRoot
    & npm exec vite -- --mode desktop
    return $LASTEXITCODE
}

function Print-DevPortReport {
    param(
        [string]$State,
        [string]$Message,
        [array]$Processes
    )

    Write-Host "[$State] $Message"
    if ($Processes) {
        foreach ($proc in $Processes) {
            Write-Host (Format-ProcessSummary -Details $proc)
        }
    }
}

try {
    $listenerPids = @(Get-ListeningProcessIds -TargetPort $Port)
    if ($listenerPids.Count -eq 0) {
        Print-DevPortReport -State 'PORT_FREE' -Message "Porta $Port disponível."
        if ($LaunchVite) { exit (Start-ViteServer) }
        exit 0
    }

    $processDetails = $listenerPids | ForEach-Object { Get-ProcessDetails -ProcessId $_ }
    $probe = Probe-DevUrl -Url $DevUrl
    $isValidServer = $AllowReuse -and (Is-ValidPadelViteServer -Probe $probe)

    if ($isValidServer) {
        Print-DevPortReport -State 'REUSE_EXISTING_SERVER' -Message "Servidor Vite do Padel Legacy já está ativo na porta $Port. Reutilizando." -Processes $processDetails
        if ($DiagnoseOnly) { exit 0 }
        exit 0
    }

    $projectProcesses = $processDetails | Where-Object { Is-ProjectOwnedProcess $_ }
    if ($projectProcesses.Count -gt 0) {
        Print-DevPortReport -State 'STALE_PROJECT_PROCESS_BLOCKING' -Message "A porta $Port está em uso por processo(s) do próprio projeto, mas não responde como um servidor Vite compatível." -Processes $projectProcesses
        if ($DiagnoseOnly) {
            Write-Host "Ação recomendada: finalize manualmente os processos acima ou aguarde que o script os encerre." -ForegroundColor Yellow
            exit 1
        }

        if (-not $TerminateStaleProjectProcess) {
            Write-Host "A porta não será liberada automaticamente porque TerminateStaleProjectProcess está desativado." -ForegroundColor Yellow
            exit 1
        }

        foreach ($proc in $projectProcesses) {
            try {
                Stop-Process -Id $proc.PID -Force -ErrorAction Stop
                Write-Host "[dev-port] Processo antigo do próprio projeto encerrado: PID $($proc.PID)" -ForegroundColor Cyan
            }
            catch {
                Write-Host "[dev-port] Falha ao encerrar PID $($proc.PID): $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        if (-not (Wait-ForPortFree -TargetPort $Port -TimeoutSeconds $TimeoutSeconds)) {
            Write-Host "[dev-port] A porta $Port não foi liberada dentro de $TimeoutSeconds segundos." -ForegroundColor Red
            exit 1
        }

        Write-Host "[STALE_PROJECT_PROCESS_TERMINATED] Processo antigo encerrado. Porta $Port liberada." -ForegroundColor Green
        if ($LaunchVite) { exit (Start-ViteServer) }
        exit 0
    }

    Print-DevPortReport -State 'FOREIGN_PROCESS_BLOCKING' -Message "A porta $Port está sendo usada por outro processo e não será encerrada." -Processes $processDetails
    Write-Host "Feche o processo acima ou configure manualmente outra porta. O servidor Padel Legacy não pode reutilizar este processo." -ForegroundColor Red
    exit 1
}
catch {
    Write-Host "Falha ao preparar a porta de desenvolvimento $Port. $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
