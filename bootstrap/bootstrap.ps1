# Invoke as the following:
# Set-ExecutionPolicy Bypass -Scope Process -Force;iex ((New-Object System.Net.WebClient).DownloadString('https://yak3.myhome.cx/rdr/bootstrap'))

############################################################
# Admin check
############################################################

If(!([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
  Echo 'You need Administrator rights'
  Exit
}

$conf = @(
  ('Afxw', 'Fit', {param($pf);return "$pf\ToolGUI\afxw"}),
  ('FFmpeg', 'Fit', {param($pf);return "$pf\ToolCUI\ffmpeg"}),
  ('GTK', 'Fit', 'c:\usr\local\gtk2'),
  ('KeySwap', '32', {param($pf);return "$pf\Utility\keyswap"})
)

# TODO: check outdated
function main {
  param($yaksetup_content)

  ######################################################################
  # Install chocolatey, if necessary
  Echo '[Chocolatey]'
  # Preparation
  $psprofile_dir=(${env:USERPROFILE}+"\Documents\WindowsPowerShell")
  $psprofile_path=($psprofile_dir+"\Microsoft.PowerShell_profile.ps1")
  If(!(Test-Path $psprofile_dir)) {
    mkdir $psprofile_dir
  }
  If(!(Test-Path $psprofile_path) -or (Get-Item $psprofile_path).Length -lt 4) {
    echo "####" | Out-File -Encoding Default -FilePath $psprofile_path
  }
# TODO: Update chocolatey?
  If((dir -name env:) -notcontains 'ChocolateyInstall') {
    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
  } else {
    Echo 'Chocolatey already installed'
  }

  ######################################################################
  # Install my PS modules
  $modpath=(${env:PSModulePath}.split(';') | ? {$_ -match 'Users.*WindowsPowerShell' })
  $modname='YakSetup'
  If(!(Test-Path $modpath/$modname)) { mkdir $modpath/$modname }
  Echo $yaksetup_content | Out-File -Encoding Default -FilePath $modpath/$modname/$modname.psm1
  If((Get-Module -Name $modname) -ne $null) {
    Remove-Module $modname
  }
  Import-Module $modname
  Echo "[$modname]"
  Echo "Install $modname PSmodule"

  ######################################################################
  # Install non-chocolatey targets
  foreach($item in $conf) {
    Echo ('['+$item[0]+']')
    invoke_helper 'Install' $item
  }
}

function make_spec {
  param([int[]]$type, $location)
  $result=@{}
  If($location -is 'System.Management.Automation.ScriptBlock') {
    $loc=$location
  } else {
    $loc={return $location}
  }
  foreach($bits in $type) {
    $result[$bits]=@{"location"=(&$loc -type $bits -pf (Get-ProgramFiles $bits))}
  }
  return $result
}

function invoke_helper_one {
  param($verb, $name, $spec)

  $generic="$verb$name"
  if(Test-Path "function:$generic") {
    $result=(& $generic $spec)
  } else {
    $result=@{}
    foreach($bits in $spec.Keys) {
      foreach($func in @("$generic$bits", "$verb")) {
        if(Test-Path "function:$func") {
          $temp=(& $func $spec[$bits])
          $result[$bits]=$temp[$bits]
        }
      }
    }
  }
  return $result
}

function invoke_helper {
  param($verb, $item)
  $type=@(Expand-Bits($item[1]))
  $spec=(make_spec -type $type -location $item[2])
  $rver=(invoke_helper_one "GetRVer" $item[0] $spec)
  $lver=(invoke_helper_one "GetLVer" $item[0] $spec)
#Echo ($rver | ConvertTo-Xml -Depth 3).InnerXml
#Echo ($lver | ConvertTo-Xml -Depth 3).InnerXml
  foreach($key in $spec.Keys) {
    $lspec=@{$key=$spec[$key]}
    $lspec[$key].rver = $rver[$key]
    $lspec[$key].lver = $lver[$key]
    if($rver[$key].numver -gt $lver[$key].numver) {
      Echo "$($item[0])$key : Remote version $($rver[$key].ver) is newer than local version $($lver[$key].ver)"
      if($verb -eq 'Install') {
        $install=0
        while($install -eq 0 -and $true -eq (invoke_helper_one "IsLocked" $item[0] $lspec)[$key]) {
          $install=(Select-Menu "Locked" "How to process?" @(@("&Retry","Retry install"),@("&Skip","Skip install")))
        }
        if($install -eq 0) {
          invoke_helper_one $verb $item[0] $lspec
        }
      }
    } else {
      $mes="$($item[0])$key : Local version $($lver[$key].ver) is equal to or newer than remote version $($rver[$key].ver)"
      if($verb -eq 'Install') {
        $mes="Skip, $mes"
      }
      Echo "$mes"
    }
  }
}

############################################################
# Installers
############################################################

function NumVer {
  param($ver,$count,$rate)
  $parts=($ver -split '[.-]')
  for($i=$parts.Count;$i -lt $count;++$i) { $parts+=0 }
  $result=0
  foreach($part in $parts) {
    $result=$result*$rate+[int]$part
  }
  return $result
}

# A fallback function for IsLocked
# Always returns false
function IsLocked {
  param($spec)
  return @{32=$false;64=$false}
}

######
# Afxw

function GetRVerAfxw {
  param($spec)

  $base='http://akt.d.dooo.jp/'
  $html='akt_afxw.html'
  $filter_=@{32='<a id="\$afxw32\$" href="(.*)">';64='<a id="\$afxw64\$" href="(.*)">'}
  $filter=@{}
  foreach($key in $spec.Keys) {
    $filter[$key] = $filter_[$key]
  }
  $urls=Get-ArchivePath -url "$base$html" -spec $filter -base $base
  $results=@{}
  foreach($key in $spec.Keys) {
    $results[$key]=@{url=$urls[$key]}
    if($urls[$key] -match "afxw\d+_(\d)(\d+).zip") {
      $results[$key].ver=($matches[1]+"."+$matches[2])
      $results[$key].numver=[int]$matches[1]*100+[int]$matches[2]
    }
  }
  return $results
}

function GetLVerAfxw {
  param($spec)

  $results=@{}
  foreach($key in $spec.Keys) {
    If((Test-Path "$($spec[$key].location)\AFXW.txt") -and (cat "$($spec[$key].location)\AFXW.txt" | select -index 2) -match 'v(\d+)\.(\d+)') {
      $results[$key]=@{ver=($matches[1]+"."+$matches[2]);numver=([int]$matches[1]*100+[int]$matches[2])}
    }
  }
  return $results
}

# TODO: consider keys
function IsLockedAfxw {
  param($spec)
  $result=@(Get-Process | ? { $_.Name -eq "afxw"}).Count -gt 0
  return @{32=$result;64=$result}
}

function InstallAfxw {
  param($spec)

  foreach($key in $spec.Keys) {
    Install-Archive $spec[$key].rver.url $spec[$key].location
  }
}

########
# FFmpeg

function GetRVerFFmpeg {
  param($spec)

  $verurl="https://www.gyan.dev/ffmpeg/builds/git-version"
  $ver=(New-Object System.Net.WebClient).DownloadString($verurl)
  $base="ffmpeg-${ver}-full_build"

  if($ver -match "^(\d{4}-\d{2}-\d{2})") {
    $results=@{64=@{
      "url"="https://www.gyan.dev/ffmpeg/builds/packages/${base}.7z";
      "dir"=$base;
      "ver"=$ver;
      "numver"=(NumVer $matches[1] 3 100)
    }}
  }
  return $results
}

function GetLVerFFmpeg {
  param($spec)

  $results=@{}
  foreach($key in $spec.Keys) {
    If((Test-Path "$($spec[$key].location)\README.txt") -and (cat "$($spec[$key].location)\README.txt" | ? { $_ -match 'Version: \d{4}-\d{2}-\d{2}-git-' } | select -first 1) -match 'Version: ((\d{4}-\d{2}-\d{2})-git-[0-9a-f]+)') {
      $results[$key]=@{ver=$matches[1];numver=(NumVer $matches[2] 3 100)}
    }
  }
  return $results
}

# FFmpeg is rarely locked

function InstallFFmpeg {
  param($spec)

  foreach($key in $spec.Keys) {
    Install-Archive $spec[$key].rver.url (split-path -parent $spec[$key].location)
    If(Test-Path $spec[$key].location) {
      Get-ChildItem -Recurse $spec[$key].location
      $choice=Select-Menu "[Confirmation]" "Delete these files?" @(@("&Yes", "Delete these files"), @("&No", "Retain these files"))
      If($choice -eq 0) { Remove-Item -Recurse $spec[$key].location }
    }
    $dir=$spec[$key].rver.dir
    Move-Item ((split-path -parent $spec[$key].location)+"\$dir") $spec[$key].location
    Add-PathEnv ($spec[$key].location+'\bin')
  }
}

#####
# Gtk

function GetRVerGtk {
  param($spec)

  $gtk=@{
    32='http://ftp.gnome.org/pub/GNOME/binaries/win32/gtk+/2.24/gtk+-bundle_2.24.10-20120208_win32.zip';
    64='http://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip'
  }

  $results=@{}
  foreach($key in $spec.Keys) {
    $results[$key]=@{url=$gtk[$key]}
    If($gtk[$key] -match '([^/]*)\.zip$') {
      $results[$key].ver=$matches[1]
      if($gtk[$key] -match '_([\d.]+)-(\d{8})_') {
        $results[$key].numver=(NumVer $matches[1] 3 100)*100000000+[int]$matches[2]
      }
    }
  }
  return $results
}

function GetLVerGtk {
  param($spec)

  $results=@{}
  foreach($key in $spec.Keys) {
    $txt=(ls ($spec[$key].location+"\*.README.txt") | % { $_.Name })
    If($txt -match '([^/]*)\.README.txt$') {
      $results[$key]=@{ver=$matches[1]}
      if($txt -match '_([\d.]+)-(\d{8})_') {
        $results[$key].numver=(NumVer $matches[1] 3 100)*100000000+[int]$matches[2]
      }
    }
  }
  return $results
}

# Gtk is rarely locked

function InstallGtk {
  param($spec)

  foreach($key in $spec.Keys) {
    Install-Archive $spec[$key].rver.url $spec[$key].location
    Add-PathEnv ($spec[$key].location+'\bin')
  }
}

#########
# KeySwap

function GetRVerKeySwap32 {
  param($spec)

  $results=@{}
  $history=(New-Object System.Net.WebClient).DownloadString('http://www.asahi-net.or.jp/~ee7k-nsd/keyswpup.htm')
  If(($history.Split("`n") | ? { $_ -match "Version \d+\.\d+<BR>" } | select -index 0) -match 'Version (\d+\.\d+)') {
    $results[32]=@{ver=$matches[1];numver=(NumVer $matches[1] 2 100)}
  }
  return $results
}

function GetLVerKeySwap32 {
  param($spec)
  $results=@{}
  If((cat ($spec.location+"\readme.txt") | Out-String) -match 'KeySwap Ver.(\d+\.\d+)') {
    $results[32]=@{ver=$matches[1];numver=(NumVer $matches[1] 2 100)}
  }
  return $results
}

# KeySwap is rarely locked

function InstallKeySwap32 {
  param($spec)

  Install-Archive 'http://www.asahi-net.or.jp/~ee7k-nsd/keyswap.lzh' ($spec.location+"\..")
}

############################################################
# My PS module content
############################################################

$yaksetup_content=@'
# YakSetup.psm1

function Select-Menu {
  <#
   .Synopsis
    Show CUI menu.

   .Description
    Show CUI menu.

   .Parameter Title
    Menu title

   .Parameter Message
    Message for menu

   .Parameter Options
    Array of 2-element Array of String. The 1st element is label and the 2nd element is help message.

   .Parameter Default
    Default selection. 0-based index of options. If omitted, 0 is used.

   .Outputs
    Intger. 0-based index of options.

   .Example
    Select-Menu "Confirm" "Delete these files?" @(@("&Yes", "Delete files"), @("&No", "Retain files"))
    Show menu for delete confirmation.
  #>
  param(
    [parameter(Mandatory=$true)][string] $title,
    [parameter(Mandatory=$true)][string] $message,
    [parameter(Mandatory=$true)][Object[]] $options,
    [parameter(Mandatory=$false)][Int] $default=0
  )

  $choice=[System.Management.Automation.Host.ChoiceDescription[]]($options | % { New-Object System.Management.Automation.Host.ChoiceDescription $_ })
  return $host.ui.PromptForChoice($title, $message, $choice, $default)
}

function Invoke-Bootstrap {
  <#
   .Synopsis
    Invoke the latest bootstrap from GitHub

   .Description
    Invoke the latest bootstrap from GitHub
  #>

  iex ((New-Object System.Net.WebClient).DownloadString('https://yak3.myhome.cx/rdr/bootstrap'))
}

function Request-Head {
  <#
   .Synopsis
    Issue HTTP HEAD request to the specifed URL.

   .Description
    Issue HTTP HEAD request to the specifed URL.

   .Parameter Url
    The URL that HTTP HEAD request is issued to.

   .Outputs
    System.Net.WebResponse. You can examine response header content via Headers property.

   .Example
   $r=Request-Head('http://www.example.com/');Echo $r.LastModified
   Get last modified date of the specified URL.
  #>
  param(
    [parameter(Mandatory=$true)][string] $url=''
  )

# from https://stackoverflow.com/questions/3268926/head-with-webclient
  $request = [System.Net.WebRequest]::Create($url)
  $request.Method = "HEAD"
  return $request.GetResponse()
}

function Get-ArchivePath {
  <#
   .Synopsis
    Get archive paths from URL content by using regexp.

   .Description
    Get archive paths from URL content by using regexp.
    This function accepts multiple regexs and assumes each $matches[1] has archive path.
    If specified, base URL is prepreded for each match result.

   .Parameter Spec
    The hashtable to contain regexps to apply to the URL content, or
    The hashtable to contain hashtables having a regexp, a url and a base.

   .Parameter Url
    Optional. The URL to contain archive paths

   .Parameter Base
    Optional. The Base URL prepended to match results

   .Outputs
    string[]. Its content consists of the first capture of each matchers. Base URL is prepended if specified.

   .Example
    $base='http://akt.d.dooo.jp/';$html='akt_afxw.html';$urls=Get-ArchivePath -url "$base$html" -spec @{'32'='<a id="\$afxw32\$" href="(.*)">';'64'='<a id="\$afxw64\$" href="(.*)">'} -base $base
    Using common URL and base

   .Example
    $base='http://akt.d.dooo.jp/';$html='akt_afxw.html';$urls=Get-ArchivePath -url "$base$html" -spec @{'32'=@{'matcher'='<a id="\$afxw32\$" href="(.*)">'};'64'=@{'matcher'='<a id="\$afxw64\$" href="(.*)">'}} -base $base
    Using common URL and base with explict matcher

   .Example
    $base='http://akt.d.dooo.jp/';$html='akt_afxw.html';$urls=Get-ArchivePath -spec @{'32'=@{'url'=$url;'base'=$base;'matcher'='<a id="\$afxw32\$" href="(.*)">'};'64'=@{'url'=$url;'base'=$base;'matcher'='<a id="\$afxw64\$" href="(.*)">'}}
    All in one spec
  #>
  param(
    [parameter(Mandatory=$true)][Hashtable] $spec,
    [parameter(Mandatory=$false)][string] $url='',
    [parameter(Mandatory=$false)][string] $base=''
  )

  $result=@{}
  $myspec=@{}
  foreach($key in $spec.Keys) {
    $matcher=$null
    $myspec[$key] = @{}
    if($spec[$key] -is 'Hashtable' -and $spec[$key].Keys -contains 'url') {
      $myspec[$key]['url'] = $spec[$key]['url']
    } elseif($url -ne '') {
      $myspec[$key]['url'] = $url
    } else {
      Write-Warning "No url is specified for $key"
    }
    if($spec[$key] -is 'Hashtable' -and $spec[$key].Keys -contains 'base') {
      $myspec[$key]['base'] = $spec[$key]['base']
    } elseif($base -ne '') {
      $myspec[$key]['base'] = $base
    }
    if($spec[$key] -is 'Hashtable') {
      if($spec[$key].Keys -contains 'matcher') {
        $matcher=$spec[$key]['matcher']
      }
    } else {
      $matcher=$spec[$key]
    }
    if($matcher -ne $null) {
      if($matcher -is "System.Management.Automation.ScriptBlock") {
        $myspec[$key]['matcher'] = $matcher
      } else {
        # GetNewClosure() is necessary so that each script block sees each $matcher
        $myspec[$key]['matcher'] = { param($content) if($content -match $matcher) { $matches[1] } }.GetNewClosure()
      }
    }
  }
  foreach($key in $spec.Keys) {
    if($myspec[$key]['url'] -ne $cururl) {
      $cururl=$myspec[$key]['url']
      $content=(New-Object System.Net.WebClient).DownloadString($cururl)
    }
    $temp=&$myspec[$key]['matcher'] -content $content
    if($temp -ne $null) {
      $result[$key] = ($myspec[$key]['base']+$temp)
    }
  }
  return $result
}

function Install-Archive {
  <#
   .Synopsis
    Extract contents of the specified archive to the specified location.

   .Description
    Extract contents of the specified archive to the specified location.
    This function uses 7z.exe installed by Chocolatey.

   .Parameter Url
    The URL of the installing archive

   .Parameter Location
    The install location that the archive will be extracted to.

   .Example
    Install-Archive 'http://akt.d.dooo.jp/lzh/afxw32_161.zip' "${env:ProgramFiles}\ToolGUI\afxw"
  #>
  param(
    [string] $url,
    [string] $location
  )
  Echo "Install $url to $location"
  $tfile=$env:TEMP+'\'+[System.IO.Path]::GetRandomFileName()
# Download as a file
  (New-Object System.Net.WebClient).DownloadFile($url, $tfile)
# Extraction
  & "${env:ChocolateyInstall}\tools\7z.exe" x "$tfile" "-o$location" -y
  Remove-Item $tfile
}

function Add-PathEnv {
  <#
   .Synopsis
    Add the specified path to the PATH environment variable for machine configuration.

   .Description
    Add the specified path to the PATH environment variable for machine configuration.
    If the exising path is specified, the addition is skipped to avoid duplication.
    The addition is persistent.

   .Parameter Path
    The path to be added to the PATH environment variable

   .Example
    Add-PathEnv "c:\"
  #>
  param(
    [string] $path
  )
  If($env:PATH.split(';') -notcontains $path) {
    Echo "Append $path to PATH for machine"
    [Environment]::SetEnvironmentVariable("Path", $env:Path+";$path", [System.EnvironmentVariableTarget]::Machine )
  }
}

function Test-64BitProcess {
  <#
   .Synopsis
    Returns $true if we are in 64bit process

   .Description
    Returns $true if we are in 64bit process

   .Outputs
    [Boolean]

   .Example
    If(Test-64BitProcess) { Echo "64bit process" }
  #>
  return $env:PROCESSOR_ARCHITECTURE -eq "AMD64"
}

function Test-64BitEnv {
  <#
   .Synopsis
    Returns $true if we are in 64bit environment

   .Description
    Returns $true if we are in 64bit environment

   .Outputs
    [Boolean]

   .Example
    If(Test-64BitEnv) { Echo "64bit env" }
  #>
  return (Get-ChildItem env: -Name) -contains "PROCESSOR_ARCHITEW6432" -or (Test-64BitProcess)
}

function Test-Admin {
  <#
   .Synopsis
    Returns $true if we have Administrator rights

   .Description
    Returns $true if we are Administrator rights

   .Outputs
    [Boolean]

   .Example
    If(Test-Admin) { Echo "Admin" }
  #>
  return ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
}

function Get-ProgramFiles {
  <#
   .Synopsis
    Returns a path to ProgramFiles for the specified bits

   .Description
    Returns a path to ProgramFiles for the specified bits

   .Outputs
    [string]

   .Example
    If(Test-Admin) { Echo "Admin" }
  #>
  param($bits)
  If($bits -eq '32') {
    If(Test-64BitEnv) {
      return ${env:ProgramFiles(x86)}
    } else {
      return ${env:ProgramFiles}
    }
  } else {
    If(Test-64BitEnv) {
      If(Test-64BitProcess) {
        return ${env:ProgramFiles}
      } else {
        return ${env:ProgramW6432}
      }
    }
    return $null
  }
}

function Get-ShortPathFolder {
  <#
   .Synopsis
    Get the short path name of the specified folder path

   .Description
    Get the short path name of the specified folder path

   .Outputs
    [string] The short path name of the specified folder path

   .Example
    Get-ShortPathFolder "c:\Program Files"
  #>
  param ($folder)

  $fso=New-Object -ComObject Scripting.FileSystemObject
  $f=$fso.GetFolder($folder)
  return $f.ShortPath
}

function Get-ConfigPlace {
  <#
   .Synopsis
    Get where we are for install configuration

   .Description
    Get where we are for install configuration

   .Outputs
    [string] One of 'Office'|'Home'

   .Example
    Get-ConfigPlace
  #>

  return @{'DNJP'='Office';'ADJECTIVE'='Home'}[$env:USERDOMAIN]
}

function Expand-Bits {
  <#
   .Synopsis
    Get bits configuration to be installed

   .Description
    Get bits configuration to be installed

   .Parameter Type
    One of 'Fit'|'Both'|'64'|'32'

   .Outputs
    [Integer[]]

   .Example
    Expand-Bits 'Fit'
  #>
  param($type)
  switch($type) {
  'Fit' { If(Test-64BitEnv) { return @(64) } else { return @(32) }}
  'Both' { If(Test-64BitEnv) { return (64, 32) } else { return @(32) }}
  '64' { If(Test-64BitEnv) { return @(64) } else { return @() }}
  '32' { return @(32) }
  }
}

# SupportBits, UpgradeByUninstallAndInstall, Args@{bits={(args,...)}}
# --params: to pass to the package
# -ia: --install-args to pass to the native installer
$Both = 0
$table=@{
  'jre8'=('Both', $true, @{
    32={('--force', '--params', '"/exclude:64"', '-ia', "`"INSTALLDIR=`"`"${pf}\Library\Java\jre`"`"`"")};
    64={('--force', '--params', '"/exclude:32"', '-ia', "`"INSTALLDIR=`"`"${pf}\Library\Java\jre`"`"`"")}
  });
  'jdk8'=('Both', $true, @{
    32={('--force', '--params', '"x64=false"', '-ia', "`"INSTALLDIR=`"`"${pf}\Library\Java\jdk`"`"`"")};
    64={('--force', '--params', '"x64=true"', '-ia', "`"INSTALLDIR=`"`"${pf}\Library\Java\jdk`"`"`"")}
  });
  'git.install'=('Fit', $true, @{
    $Both={('--params', '/GitOnlyOnPath /NoAutoCrlf /WindowsTerminal /NoShellIntegration /WindowsTerminalProfile', '-ia', "`"/DIR=`"`"${pf}\ToolCUI\Git`"`"`"")}
  });
  'irfanview'=('Fit', $false, @{
    $Both={('-ia', "`"/folder=`"`"${pf}\ToolGUI\IrfanView`"`"`"")}
  });
  'notepadplusplus.install'=('Fit', $false, @{
    $Both={('-ia', "/D=${pfs}\ToolGUI\notepad++")}
  });
  'svn'=('32', $false, @{32={('-ia', "`"INSTALLDIR=`"`"${pf}\ToolCUI\Subversion`"`"`"")}});
  'anaconda3'=('Fit', $false, @{
    $Both={('--params', '/D:c:\usr\local\anaconda3', '--execution-timeout', '3600')}
  });
  'strawberryperl'=('Fit', $true, @{
    $Both={('-ia', "`"INSTALLDIR=`"`"c:\usr\local\strawberry`"`"`"")}
  });
  'mpc-hc-clsid2'=('Fit', $false, @{
    $Both={('-ia', "`"/TASKS=!desktopicon /DIR=`"`"${pf}\ToolGUI\MPC-HC`"`"`"")}
  });
  'winmerge'=('Fit', $false, @{
    $Both={('-ia', "`"/TASKS= /DIR=`"`"${pf}\ToolGUI\WinMerge`"`"`"")}
  });
}

function Cho {
  <#
   .Synopsis
    choco upgrade with calculated arguments

   .Description
    Invoke choco upgrade with calculated arguments

   .Example
    Cho jdk8
    Upgrade jdk8

   .Example
    Cho
    List available targets
  #>
  param($target)

  If($target -eq $null) {
    $table.GetEnumerator() | sort Name | % Name
  } Elseif($table.Keys -contains $target) {
    $type=$table[$target][0]
    $reinstall=$table[$target][1]
    $params=$table[$target][2]
    $bits=(Expand-Bits $type)
    If($reinstall) {
      echo "choco uninstall $target"
      choco uninstall $target
    }
    foreach($bit in $bits) {
      $pf=(Get-ProgramFiles $bit)
      $pfs=(Get-ShortPathFolder $pf)
      If($params.Contains($Both)) {
        $actual_params=&$params[$Both]
      } Else {
        $actual_params=&$params[$bit]
      }
      If($reinstall) {
        echo "choco install $target $actual_params"
        choco install $target @actual_params
      } Else {
        echo "choco upgrade $target $actual_params"
        choco upgrade $target @actual_params
      }
    }
  } else {
    Echo "$target not found"
  }
}

Export-ModuleMember -function Select-Menu, Invoke-Bootstrap, Request-Head, Get-ArchivePath, Install-Archive, Add-PathEnv, Test-64BitEnv, Test-64BitProcess, Test-Admin, Get-ProgramFiles, Get-ConfigPlace, Expand-Bits, Cho
'@

############################################################
# Invoke main
############################################################

main $yaksetup_content
