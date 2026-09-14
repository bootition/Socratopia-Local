; ---------------------------------------------------------------------------
; Socratopia-Local installer customisation (plain NSIS, no LogicLib)
;
; Why this exists: on managed/locked-down Windows profiles the default
; install directory (%LOCALAPPDATA%\Programs\Socratopia-Local) can be
; read-only. The NSIS extraction then fails halfway through and the
; uninstaller write fails with "cannot open file for writing". This file:
;
; 1. preflights the directory before extraction (customInit),
; 2. validates the directory chosen on the directory page and, when it
;    is not writable, automatically falls back to a writable location
;    instead of blocking (SocratopiaInstallDirLeave),
; 3. tells the user on uninstall that their learning data is kept.
;
; Registers used: $R4 path, $R5 result, $R6 original dir, $R7 file handle.
; ---------------------------------------------------------------------------

!ifndef BUILD_UNINSTALLER
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE SocratopiaInstallDirLeave
!endif

!ifndef BUILD_UNINSTALLER
; $R4 = candidate path -> $R5 = 1 when writable, 0 otherwise.
Function SocratopiaTryDir
  StrCpy $R5 0
  ClearErrors
  CreateDirectory "$R4"
  IfErrors socratopia_try_done
  FileOpen $R7 "$R4\.socratopia-write-test" w
  IfErrors socratopia_try_done
  FileClose $R7
  Delete "$R4\.socratopia-write-test"
  StrCpy $R5 1
  socratopia_try_done:
FunctionEnd

; Input $R6 = preferred path. Output: $R4 = chosen path, $R5 = 1 when
; writable, 0 when nothing worked.
Function SocratopiaFindWritableDir
  StrCpy $R4 $R6
  Call SocratopiaTryDir
  StrCmp $R5 1 socratopia_find_done

  StrCpy $R4 "$LOCALAPPDATA\Socratopia-Local"
  Call SocratopiaTryDir
  StrCmp $R5 1 socratopia_find_done

  StrCpy $R4 "$PROFILE\Socratopia-Local"
  Call SocratopiaTryDir
  StrCmp $R5 1 socratopia_find_done

  StrCpy $R4 "$DOCUMENTS\Socratopia-Local"
  Call SocratopiaTryDir
  socratopia_find_done:
FunctionEnd

Function SocratopiaInstallDirLeave
  StrCpy $R6 $INSTDIR
  Call SocratopiaFindWritableDir
  StrCmp $R5 1 socratopia_leave_ok

  ; Nothing writable at all: keep the user on the page with a clear reason.
  MessageBox MB_ICONSTOP|MB_OK "无法写入安装目录：$\r$\n$INSTDIR$\r$\n$\r$\n请返回并选择其它可写目录（例如 D:\Socratopia-Local），或取消安装后使用便携版。"
  Abort

  socratopia_leave_ok:
    StrCmp $R4 $R6 socratopia_leave_done
    ; The picked directory is not writable but a fallback is: switch to it
    ; and stay on the page so the learner can see the new path.
    StrCpy $INSTDIR $R4
    MessageBox MB_ICONINFORMATION|MB_OK "所选目录不可写，已自动改为：$\r$\n$INSTDIR$\r$\n$\r$\n如果你希望安装到别处，可以在本页修改。"
    Abort
  socratopia_leave_done:
FunctionEnd
!endif

!macro customInit
  StrCpy $R6 $INSTDIR
  Call SocratopiaFindWritableDir
  StrCmp $R5 1 0 socratopia_init_none
  StrCmp $R4 $R6 socratopia_init_end
  StrCpy $INSTDIR $R4
  IfSilent socratopia_init_end
  MessageBox MB_ICONINFORMATION|MB_OK "默认安装目录不可写，已自动改为：$\r$\n$INSTDIR$\r$\n$\r$\n你仍可在下一页更改安装位置。"
  Goto socratopia_init_end
  socratopia_init_none:
    IfSilent socratopia_init_end
    MessageBox MB_ICONEXCLAMATION|MB_OK "没有找到可写的默认安装目录。$\r$\n请在下一页手动选择一个可写目录（例如 D:\Socratopia-Local），或取消安装后使用便携版。"
  socratopia_init_end:
!macroend

; The learning data lives in %APPDATA%\Socratopia-Local\Socratopia-Local
; and is intentionally kept on uninstall.
!macro customUnInstall
  IfSilent socratopia_uninstall_end
  MessageBox MB_ICONINFORMATION|MB_OK "Socratopia-Local 已卸载。$\r$\n$\r$\n你的学习数据仍保留在：$\r$\n$APPDATA\Socratopia-Local\Socratopia-Local$\r$\n$\r$\n如需彻底删除，请手动删除该目录。"
  socratopia_uninstall_end:
!macroend
