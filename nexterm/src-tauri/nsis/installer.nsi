; NovaShell NSIS Custom Installer Extensions
; This file is used by Tauri's NSIS bundler for additional customization.
; Place custom NSIS macros here that Tauri will include during build.

; --- Custom install actions ---
!macro customInstall
  ; Create Desktop shortcut
  CreateShortCut "$DESKTOP\NovaShell.lnk" "$INSTDIR\NovaShell.exe" "" "$INSTDIR\NovaShell.exe" 0

  ; Add "Open NovaShell here" to directory context menu
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaShell" "" "Open NovaShell here"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaShell" "Icon" '"$INSTDIR\NovaShell.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaShell\command" "" '"$INSTDIR\NovaShell.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaShell" "" "Open NovaShell here"
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaShell" "Icon" '"$INSTDIR\NovaShell.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaShell\command" "" '"$INSTDIR\NovaShell.exe" "%V"'
!macroend

; --- Custom uninstall actions ---
!macro customUnInstall
  ; Remove Desktop shortcut
  Delete "$DESKTOP\NovaShell.lnk"

  ; Remove context menu entries
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\NovaShell"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\NovaShell"
!macroend
