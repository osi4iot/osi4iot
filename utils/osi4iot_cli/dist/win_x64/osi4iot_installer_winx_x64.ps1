$DestinationDrive = Read-Host -Prompt "Enter a destination drive to install osi4iot (C)"

if ([string]::IsNullOrWhiteSpace($DestinationDrive))
{
    $DestinationDrive = "C"
}

if (Get-PSDrive $DestinationDrive -ErrorAction SilentlyContinue) {
    $DestinationFolder = "${DestinationDrive}:\osi4iot_cli"
    if (-not (Test-Path $DestinationFolder)) {
        New-Item  $DestinationFolder -ItemType Directory | Out-Null
    }
    $DestinationPath = "$DestinationFolder\osi4iot.exe"
    $source = 'https://raw.githubusercontent.com/osi4iot/osi4iot/master/utils/osi4iot_cli/dist/win_x64/osi4iot.exe'
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $source -OutFile $DestinationPath
    $ProgressPreference = 'Continue'

    $positionfirstspace=$env:Path.IndexOf($DestinationFolder)
    if( $positionfirstspace -eq -1) {
        $newPath = "${env:Path}; ${DestinationFolder};"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = $newPath
    }
} else {
    $Warning = "The drive $DestinationDrive not exits."
    Write-Host $Warning
}

