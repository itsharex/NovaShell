; NovaTerm NSIS Custom Installer Extensions
; This file is used by Tauri's NSIS bundler for additional customization.
; Place custom NSIS macros here that Tauri will include during build.

; --- Custom install actions ---
!macro customInstall
  ; Create Desktop shortcut
  CreateShortCut "$DESKTOP\NovaTerm.lnk" "$INSTDIR\NovaTerm.exe" "" "$INSTDIR\NovaTerm.exe" 0

  ; Add "Open NovaTerm here" to directory context menu
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaTerm" "" "Open NovaTerm here"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaTerm" "Icon" '"$INSTDIR\NovaTerm.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NovaTerm\command" "" '"$INSTDIR\NovaTerm.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaTerm" "" "Open NovaTerm here"
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaTerm" "Icon" '"$INSTDIR\NovaTerm.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\NovaTerm\command" "" '"$INSTDIR\NovaTerm.exe" "%V"'
!macroend

; --- Custom uninstall actions ---
!macro customUnInstall
  ; Remove Desktop shortcut
  Delete "$DESKTOP\NovaTerm.lnk"

  ; Remove context menu entries
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\NovaTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\NovaTerm"
!macroend
