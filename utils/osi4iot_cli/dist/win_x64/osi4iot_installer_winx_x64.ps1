$DestinationDrive = Read-Host -Prompt "Enter a destination drive to install osi4iot (C)"

if ([string]::IsNullOrWhiteSpace($DestinationDrive))
{
    $DestinationDrive = "C"
}

if (Get-PSDrive $DestinationDrive -ErrorAction SilentlyContinue) {
    $UserName = [Environment]::UserName

    $UserFolder = "${DestinationDrive}:\Users\${UserName}"
    if ((Test-Path $UserFolder)) {
        $DestinationFolder = "${UserFolder}\osi4iot_cli"
        if (-not (Test-Path $DestinationFolder)) {
            New-Item  $DestinationFolder -ItemType Directory | Out-Null
        }

        $DestinationPath = "$DestinationFolder\osi4iot.exe"
        Write-Host "Downloading osi4iot_cli..."
        $source = 'https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/win_x64/osi4iot.exe'
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $source -OutFile $DestinationPath
        $ProgressPreference = 'Continue'
        Write-Host "Osi4iot_cli file downloaded."

        Write-Host "Updating path."
        $persistedPaths = [Environment]::GetEnvironmentVariable('Path', 'User') -split ';'
        if ($persistedPaths -notcontains $DestinationFolder) {
            $persistedPaths = $persistedPaths + $DestinationFolder | where { $_ }
            [Environment]::SetEnvironmentVariable('Path', $persistedPaths -join ';', 'User')
        }
    } else {
        $Warning = "The folder $UserFolder not exits."
        Write-Host $Warning
    }
} else {
    $Warning = "The drive $DestinationDrive not exits."
    Write-Host $Warning
}

