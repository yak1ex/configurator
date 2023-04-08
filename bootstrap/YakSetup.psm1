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

  $choice=[System.Management.Automation.Host.ChoiceDescription[]]($options | ForEach-Object { New-Object System.Management.Automation.Host.ChoiceDescription $_ })
  return $host.ui.PromptForChoice($title, $message, $choice, $default)
}

function Invoke-Bootstrap {
  <#
   .Synopsis
    Invoke the latest bootstrap from GitHub

   .Description
    Invoke the latest bootstrap from GitHub
  #>

  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://yak3.mydns.jp/rdr/bootstrap'))
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
    [parameter(Mandatory=$true)][string] $url
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
    if($null -ne $matcher) {
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
    if($null -ne $temp) {
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
  Write-Output "Install $url to $location"
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
    Write-Output "Append $path to PATH for machine"
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

# ref. https://stackoverflow.com/questions/40348069/export-powershell-5-enum-declaration-from-a-module
$enum_types = @"
public enum PESubsystem {
  WindowsGUI = 2,
  WindowsCUI = 3
}
"@

# ref. https://stackoverflow.com/questions/25730978/powershell-add-type-cannot-add-type-already-exist
if (-not ("PESubsystem" -as [type])) {
  Add-Type $enum_types
}

function HandlePESubsystem {
  <#
   .Synopsis
    Set Subsystem information to a PE executable

   .Description
    Set Subsystem information to a PE executable

   .Parameter Path
    Path to a PE executable. Mandatory parameter.

   .Parameter Subsystem
    Specify new subsystem value
    [PESubsystem]
    WindowsGUI(2)
    WindowsCUI(3)

   .Outputs
    Return old subsystem value
    [PESubsystem]
    WindowsGUI(2)
    WindowsCUI(3)

   .Example
    HandlePESubsytem "C:\\Windows\\explorer.exe" [PESubsystem]::WindowsGUI
  #>
  param([Parameter(Mandatory=$true)]$path, [AllowNull()][Nullable[PESubsystem]]$new_subsystem)
  $file_bytes = [System.IO.File]::ReadAllBytes($path)
  $pe_offset = [System.BitConverter]::ToUInt32($file_bytes, 0x3c)
  $signature = [System.Text.Encoding]::ASCII.GetString($file_bytes, $pe_offset, 4)
  if ($signature -ne "PE`0`0") {
    throw "Not PE executable"
  }
  #$optional_header_magic = [System.BitConverter]::ToUInt16($file_bytes, $pe_offset + 24)
  $subsystem_offset = $pe_offset + 24 + 68
  $old_subsystem = [System.BitConverter]::ToInt16($file_bytes, $subsystem_offset)
  if ($null -ne $subsystem) {
    [System.Buffer]::BlockCopy([System.BitConverter]::GetBytes([uint16]$new_subsystem), 0, $file_bytes, $subsystem_offset, 2)
    [System.IO.File]::WriteAllBytes($path, $file_bytes)
  }
  return [PESubsystem]$old_subsystem
}

function Get-PESubsystem {
  <#
   .Synopsis
    Get Subsystem information from a PE executable

   .Description
    Get Subsystem information from a PE executable

   .Parameter Path
    Path to a PE executable. Mandatory parameter.

   .OUtputs
    Integer(PESubsystem)
    WindowsGUI(2)
    WindowsCUI(3)

   .Example
    GetPESubsytem "C:\\Windows\\explorer.exe"
  #>
  param([Parameter(Mandatory=$true)]$path)
  return HandlePESubsystem $path
}

function Set-PESubsystem {
  <#
   .Synopsis
    Set Subsystem information to a PE executable

    .Description
    Get Subsystem information to a PE executable

   .Parameter Path
    Path to a PE executable. Mandatory parameter.

   .Parameter Subsystem
    Specify new subsystem value. Mandatory parameter.
    [PESubsystem]
    WindowsGUI(2)
    WindowsCUI(3)

   .OUtputs
    [PESubsystem]
    WindowsGUI(2)
    WindowsCUI(3)

   .Example
    GetPESubsytem "C:\\Windows\\explorer.exe"
  #>
  param([Parameter(Mandatory=$true)]$path, [Parameter(Mandatory=$true)][PESubsystem]$subsystem)
  return HandlePESubsystem $path $subsystem
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
  'temurin'=('Fit', $true, @{
    $Both={('--params',"/ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith /INSTALLDIR=${pf}\Library\Java\jdk")};
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
  'miniforge3'=('Fit', $false, @{
    $Both={('--params', '/InstallationType:JustMe')}
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
  param(
    [string[]]
    [Parameter(Position=0, ValueFromRemainingArguments)]
    $targets)

  If($targets.Count -eq 0) {
    $table.GetEnumerator() | Sort-Object Name | ForEach-Object Name
  } Else {
    $rargs = $targets.Where{$_ -notin $table.Keys}
    foreach($target in $targets.Where{$_ -in $table.Keys}) {
      $type=$table[$target][0]
      $reinstall=$table[$target][1]
      $params=$table[$target][2]
      $bits=(Expand-Bits $type)
      If($reinstall) {
        Write-Output "choco uninstall $target $rargs"
        choco uninstall $target $rargs
      }
      foreach($bit in $bits) {
        $pf=(Get-ProgramFiles $bit)
        [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseDeclaredVarsMoreThanAssignments', 'pfs', Justification='Prepare for use in $params block')]
        $pfs=(Get-ShortPathFolder $pf)
        If($params.Contains($Both)) {
          $actual_params=&$params[$Both]
        } Else {
          $actual_params=&$params[$bit]
        }
        If($reinstall) {
          Write-Output "choco install $target $actual_params $rargs"
          choco install $target @actual_params $rargs
        } Else {
          Write-Output "choco upgrade $target $actual_params $rargs"
          choco upgrade $target @actual_params $rargs
        }
      }
    }
  }
}

Export-ModuleMember -function Select-Menu, Invoke-Bootstrap, Request-Head, Get-ArchivePath, Install-Archive, Add-PathEnv, Test-64BitEnv, Test-64BitProcess, Test-Admin, Get-ProgramFiles, Get-ConfigPlace, Get-PESubsystem, Set-PESubsystem, Expand-Bits, Cho
