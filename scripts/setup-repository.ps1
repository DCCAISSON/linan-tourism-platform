param(
    [int]$MinimumFreeGB = 30
)

$ErrorActionPreference = 'Stop'

$repoRoot = (& git.exe rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'The current directory is not inside a Git repository.'
}

Push-Location $repoRoot
try {
    git.exe config core.hooksPath .githooks
    git.exe config core.autocrlf false
    git.exe config core.safecrlf warn
    git.exe config pull.ff only
    git.exe config fetch.prune true
    git.exe config commit.template .gitmessage

    $driveName = (Split-Path -Qualifier $repoRoot).TrimEnd(':')
    $drive = Get-PSDrive -Name $driveName
    $freeGB = [math]::Round($drive.Free / 1GB, 2)

    [pscustomobject]@{
        RepoRoot = $repoRoot
        Branch = (& git.exe branch --show-current)
        HooksPath = (& git.exe config core.hooksPath)
        PullMode = (& git.exe config pull.ff)
        FreeGB = $freeGB
        MinimumFreeGB = $MinimumFreeGB
        CapacityReady = $freeGB -ge $MinimumFreeGB
    } | ConvertTo-Json -Compress

    if ($freeGB -lt $MinimumFreeGB) {
        Write-Warning "The repository drive has ${freeGB}GB free; keep at least ${MinimumFreeGB}GB before installing the full toolchain."
    }
}
finally {
    Pop-Location
}
