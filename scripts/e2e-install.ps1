# Socratopia-Local 真实安装 e2e（仅在本机测试目录内操作）
# 安装到 D:\SocratopiaApps\Socratopia-Local（可写目录），验证：
#   向导完成 -> 桌面/开始菜单快捷方式 -> 启动 + 打包自检 -> 静默卸载 -> 用户数据保留
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$installer = 'D:\Socratopia-Local\release\Socratopia-Local-Setup-User-0.1.0.exe'
$installDir = 'D:\SocratopiaApps\Socratopia-Local'
$exe = Join-Path $installDir 'Socratopia-Local.exe'
$uninstaller = Join-Path $installDir 'Uninstall Socratopia-Local.exe'
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Socratopia-Local.lnk'
$startMenuLnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Socratopia-Local.lnk'
$userDataRoot = Join-Path $env:APPDATA 'Socratopia-Local\Socratopia-Local'
$marker = Join-Path $userDataRoot 'uninstall-keep-marker.txt'
$selfTestOut = 'D:\SocratopiaApps\selftest.json'

function Log([string]$m) { Write-Output "[e2e] $m" }

# --- safety guards -------------------------------------------------------
if ($installDir -notlike 'D:\SocratopiaApps\Socratopia-Local*') { throw "refusing: $installDir" }
if (-not (Test-Path $installer)) { throw "installer missing: $installer" }

Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -like '*Socratopia*' } |
  Stop-Process -Force
Start-Sleep 2

if (Test-Path $installDir) {
  Remove-Item -Recurse -Force $installDir -ErrorAction SilentlyContinue
}
if (Test-Path $desktopLnk) { Remove-Item -Force $desktopLnk -ErrorAction SilentlyContinue }
if (Test-Path $startMenuLnk) { Remove-Item -Force $startMenuLnk -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $userDataRoot -Force | Out-Null
Set-Content -Path $marker -Value 'keep-me-on-uninstall' -Encoding UTF8
Remove-Item $selfTestOut -Force -ErrorAction SilentlyContinue

function Dismiss-Dialogs([int]$procId) {
  for ($round = 0; $round -lt 6; $round++) {
    $win = Get-Window $procId
    if (-not $win) { return }
    $btnCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Button)
    $ok = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond) |
      Where-Object { $_.Current.Name -match '确定|OK' } | Select-Object -First 1
    if (-not $ok) { return }
    Log "dismissing dialog: $($win.Current.Name)"
    $ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep 1
  }
}

function Get-Window([int]$procId) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $procId)
  return $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
}

Log "starting installer"
$p = Start-Process -FilePath $installer -PassThru
Start-Sleep 4
Dismiss-Dialogs $p.Id
$win = Get-Window $p.Id
if (-not $win) { throw 'installer window not found' }

$radioCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::RadioButton)
$btnCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Button)
$editCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Edit)

$mine = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $radioCond) |
  Where-Object { $_.Current.Name -match '仅为我' } | Select-Object -First 1
if ($mine) { $mine.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() }
$next = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond) |
  Where-Object { $_.Current.Name -match '下一步' } | Select-Object -First 1
$next.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Start-Sleep 3
Dismiss-Dialogs $p.Id

$win = Get-Window $p.Id
$edit = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond) | Select-Object -First 1
Log "preflight default dir: '$($edit.Current.Name)'"
$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($installDir)
Start-Sleep 1

$win = Get-Window $p.Id
$install = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond) |
  Where-Object { $_.Current.Name -match '安装' } | Select-Object -First 1
$install.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Log "install clicked at $(Get-Date -Format HH:mm:ss)"

$installed = $false
for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Seconds 2
  if (Test-Path $exe) { $installed = $true; Log "installed after $($i*2)s"; break }
  if (-not (Get-Process -Id $p.Id -ErrorAction SilentlyContinue)) {
    Log "installer exited at $($i*2)s (no exe)"; break
  }
}
if (-not $installed) { throw 'installation did not produce the executable' }

# finish page -> 完成
$win = Get-Window $p.Id
if ($win) {
  $finish = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond) |
    Where-Object { $_.Current.Name -match '完成' } | Select-Object -First 1
  if ($finish) { $finish.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
}
Start-Sleep 3
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -like 'Socratopia-Local*' -and $_.Path -like "$installDir*" } |
  Stop-Process -Force

Log "desktop shortcut: $(Test-Path $desktopLnk)"
Log "start-menu shortcut: $(Test-Path $startMenuLnk)"
$shell = New-Object -ComObject WScript.Shell
if (Test-Path $desktopLnk) {
  $lnk = $shell.CreateShortcut($desktopLnk)
  Log "desktop target: $($lnk.TargetPath)"
}

Log "running packaged self-test from the installed copy"
$env:SOCRATOPIA_SELF_TEST_OUT = $selfTestOut
$st = Start-Process -FilePath $exe -PassThru -Wait
Log "self-test exit: $($st.ExitCode)"
Remove-Item Env:SOCRATOPIA_SELF_TEST_OUT -ErrorAction SilentlyContinue
if (Test-Path $selfTestOut) {
  $report = Get-Content $selfTestOut -Raw | ConvertFrom-Json
  Log "self-test ok: $($report.ok) checks: $($report.checks.Count)"
  $report.checks | ForEach-Object { Log ("  {0} {1} - {2}" -f ($(if ($_.ok) {'PASS'} else {'FAIL'})), $_.name, $_.detail) }
}

Log "uninstalling silently"
if (Test-Path $uninstaller) {
  $u = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru -Wait
  Log "uninstaller exit: $($u.ExitCode)"
  Start-Sleep 4
} else {
  Log 'uninstaller not found'
}

if ((Test-Path $installDir) -and -not (Get-ChildItem $installDir -Force -ErrorAction SilentlyContinue)) {
  Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
Log "install dir after uninstall: $(Test-Path $installDir)"
Log "desktop shortcut after uninstall: $(Test-Path $desktopLnk)"
Log "user data marker kept: $(Test-Path $marker)"

Remove-Item $marker -Force -ErrorAction SilentlyContinue
Log 'e2e finished'
