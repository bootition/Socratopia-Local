# 预检 e2e：默认目录不可写时，向导应自动回退到可写目录并提示（不真正安装）
$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

$installer = 'D:\Socratopia-Local\release\Socratopia-Local-Setup-User-0.1.0.exe'

function Get-Window([int]$procId) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $procId)
  return $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
}
function Get-Buttons([int]$procId) {
  $win = Get-Window $procId
  $btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)
  return $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
}
function Dismiss-Dialogs([int]$procId) {
  for ($i = 0; $i -lt 6; $i++) {
    $ok = Get-Buttons $procId | Where-Object { $_.Current.Name -match '确定|OK' } | Select-Object -First 1
    if (-not $ok) { return }
    Write-Output "[preflight] dismiss: $($ok.Current.Name)"
    $ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep 1
  }
}
function Get-DirText([int]$procId) {
  $win = Get-Window $procId
  $editCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit)
  $edit = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond) | Select-Object -First 1
  return $edit.Current.Name
}

Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -like '*Socratopia-Local-Setup*' } | Stop-Process -Force
Start-Sleep 2

$p = Start-Process -FilePath $installer -PassThru
Start-Sleep 4
Dismiss-Dialogs $p.Id

$radioCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::RadioButton)
$win = Get-Window $p.Id
$mine = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $radioCond) |
  Where-Object { $_.Current.Name -match '仅为我' } | Select-Object -First 1
if ($mine) { $mine.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() }

$next = Get-Buttons $p.Id | Where-Object { $_.Current.Name -match '下一步' } | Select-Object -First 1
$next.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Start-Sleep 3

$default = Get-DirText $p.Id
Write-Output "[preflight] default dir shown: $default"

# 直接点“安装”，让 leave 校验触发自动回退（预期停在目录页并改变路径）
$install = Get-Buttons $p.Id | Where-Object { $_.Current.Name -match '^安装' } | Select-Object -First 1
if ($install) { $install.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
Start-Sleep 3
Dismiss-Dialogs $p.Id
Start-Sleep 2

$after = Get-DirText $p.Id
Write-Output "[preflight] dir after auto-fallback: $after"
Write-Output "[preflight] changed: $($after -ne $default)"
$writable = $false
try {
  New-Item -ItemType Directory -Force -Path $after -ErrorAction Stop | Out-Null
  $t = Join-Path $after '.e2e-write-test'
  Set-Content -Path $t -Value 'x' -ErrorAction Stop
  Remove-Item $t -Force
  $writable = $true
} catch { $writable = $false }
Write-Output "[preflight] writable: $writable"

# 取消安装，不落盘
$cancel = Get-Buttons $p.Id | Where-Object { $_.Current.Name -match '取消' } | Select-Object -First 1
if ($cancel) { $cancel.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
Start-Sleep 2
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -like '*Socratopia-Local-Setup*' } | Stop-Process -Force
Write-Output '[preflight] done'
