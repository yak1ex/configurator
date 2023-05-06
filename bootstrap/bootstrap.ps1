# Invoke as the following:
# Set-ExecutionPolicy Bypass -Scope Process -Force;iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/yak1ex/configurator/master/bootstrap/bootstrap.ps1'))

function main {
  param($options)

  ######################################################################
  # Install Scoop, if necessary
  Write-Host -ForegroundColor DarkCyan '[Scoop]'
  If(-not (Get-Command "scoop")) {
    Invoke-Expression (New-Object System.Net.WebClient).DownloadString($options.ScoopUrl)
  } else {
    Write-Host -ForegroundColor DarkGray "'Scoop' already installed."
  }

  ######################################################################
  # Install my PS modules
  Write-Host -ForegroundColor DarkCyan "[$($options.ModuleName)]"
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
      scoop import "$dir/$scoopfile"
      $json = Get-Content "$dir/$scoopfile" | ConvertFrom-Json
      if ($json.post_install) {
        Write-Host "Running post_install script..."
        Invoke-Command ([scriptblock]::Create($json.post_install -join "`r`n"))
      }
    } else {
      Write-Host -ForegroundColor DarkGray "'$dir/$scoopfile' is the latest, skip import."
    }
  }
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
