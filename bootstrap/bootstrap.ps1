# Invoke as the following:
# Set-ExecutionPolicy Bypass -Scope Process -Force;iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/yak1ex/configurator/master/bootstrap/bootstrap.ps1'))

function main {
  param($options)

  ######################################################################
  # Install Scoop, if necessary
  Write-Host -ForegroundColor DarkCyan '[Scoop]'
  If(-not (Get-Command "scoop" -ErrorAction SilentlyContinue)) {
    Invoke-Expression (New-Object System.Net.WebClient).DownloadString($options.ScoopUrl)
  } else {
    Write-Host -ForegroundColor DarkGray "'Scoop' already installed."
  }

  ######################################################################
  # Install VS Code, if necessary
  Write-Host -ForegroundColor DarkCyan '[VS Code]'
  if(-not ((Get-Command code -ErrorAction SilentlyContinue|Select-Object Source) -match 'Microsoft VS Code')) {
    $temp = New-TemporaryFile
    $dest = ([System.IO.Path]::GetDirectoryName($temp.FullName) +'\' + [System.IO.Path]::GetFileNameWithoutExtension($temp.FullName) +'.exe')
    Remove-Item $temp
    Invoke-WebRequest -Uri "https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user" -OutFile $dest
    &$dest /VERYSILENT /NORESTART /MERGETASKS=!runcode,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath
    Remove-Item $dest
  } else {
    Write-Host -ForegroundColor DarkGray "'VS Code' already installed."
  }

  ######################################################################
  # Install my PS modules
  Write-Host -ForegroundColor DarkCyan "[$($options.ModuleName)]"
  scoop install git
  scoop bucket add $options.BucketName $options.BucketUrl
  scoop install $options.ModuleName.toLower()
  scoop update $options.ModuleName.toLower()
  If($null -ne (Get-Module -Name $options.ModuleName)) {
    Remove-Module $options.ModuleName
  }
  Import-Module $options.ModuleName

  ######################################################################
  # Import by scoopfiles
  $dir = "$env:USERPROFILE\.config\bootstrap"
  New-Item -ItemType directory -Path $dir -Force | Out-Null
  $author, $repo, $path = $options.ScoopFileDir
  $options.BaseScoopFile, (Get-ConfigPlace) | ForEach-Object {
    $scoopfile = "scoopfile.$($_.toLower()).json"
    Write-Host -ForegroundColor DarkCyan "[$scoopfile]"
    try {
      $date = Get-GitHubCommitDate $author $repo "$path/$scoopfile"
    } catch {
      Write-Host -ForegroundColor DarkYellow "WARN  '$scoopfile' does not exist on GitHub."
      return
    }
    if (-not (Test-Path -Path "$dir/$scoopfile" -NewerThan $date)) {
      Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$author/$repo/master/$path/$scoopfile" -OutFile "$dir/$scoopfile"
      $json = Get-Content "$dir/$scoopfile" | ConvertFrom-Json
      if ($json.pre_install) {
        Write-Host "Running pre_install script..."
        Invoke-Command ([scriptblock]::Create($json.pre_install -join "`r`n"))
      }
      scoop import "$dir/$scoopfile"
      if ($json.post_install) {
        Write-Host "Running post_install script..."
        Invoke-Command ([scriptblock]::Create($json.post_install -join "`r`n"))
      }
    } else {
      Write-Host -ForegroundColor DarkGray "'$dir/$scoopfile' is the latest, skip import."
    }
  }

  ######################################################################
  # Adjust after import
  Sync-ShimPESubsystem
}

############################################################
# Invoke main
############################################################

$options = @{
  "ScoopUrl" = 'https://get.scoop.sh';
  "BucketName" = 'yak1ex';
  "BucketUrl" = 'https://github.com/yak1ex/scoop-bucket';
  "ModuleName" = 'YakSetup';
  "BaseScoopFile" = 'base'
  "ScoopFileDir" = @('yak1ex', 'configurator', 'bootstrap')
}

main $options
