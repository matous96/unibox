; Přechod z Uniboxu (dřívější název HubGetu, do verze 0.1.18) – háčky instalátoru NSIS.
;
; Data aplikace (nastavení, přihlášení, historie) jsou ve složce podle identifikátoru
; org.unibox.app, který se nezměnil – zůstanou. Starou instalaci (%LOCALAPPDATA%\Unibox)
; odinstaluje její vlastní odinstalátor v režimu aktualizace (/UPDATE): nesmaže data,
; zástupce ani automatické spuštění. Zástupci pak dostanou nový cíl a název, připnutí
; na hlavním panelu nový cíl a automatické spuštění novou hodnotu v klíči Run.
; Instalace z MSI přechází sama – MSI HubGetu má stejný UpgradeCode jako MSI Uniboxu
; (bundle.windows.wix.upgradeCode v tauri.conf.json).

!define HUBGET_LEGACY_NAME "Unibox"
!define HUBGET_LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Unibox"
!define HUBGET_RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"

; Složka odinstalovaného Uniboxu (prázdná = žádný přechod)
Var HubGetLegacyDir

!macro NSIS_HOOK_PREINSTALL
  StrCpy $HubGetLegacyDir ""
  Push $R8
  Push $R9
  ReadRegStr $R9 HKCU "${HUBGET_LEGACY_UNINSTKEY}" "InstallLocation"
  ${If} $R9 != ""
    ; InstallLocation je v uvozovkách
    StrCpy $R8 $R9 1
    ${If} $R8 == '"'
      StrCpy $R9 $R9 "" 1
      StrCpy $R9 $R9 -1
    ${EndIf}
    ${If} ${FileExists} "$R9\uninstall.exe"
    ${AndIf} $R9 != $INSTDIR
      StrCpy $HubGetLegacyDir $R9
      DetailPrint "Odinstalace předchozí verze (Unibox)…"
      ; _?= spustí odinstalátor na místě a počká na něj – sám sebe pak smazat neumí
      ExecWait '"$R9\uninstall.exe" /S /UPDATE _?=$R9'
      Delete "$R9\uninstall.exe"
      RMDir "$R9"
      DeleteRegKey HKCU "${HUBGET_LEGACY_UNINSTKEY}"
      DeleteRegKey HKCU "Software\${HUBGET_LEGACY_NAME}\${HUBGET_LEGACY_NAME}"
      DeleteRegKey /ifempty HKCU "Software\${HUBGET_LEGACY_NAME}"
    ${EndIf}
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend

; Zástupce Uniboxu → zástupce HubGetu (nový cíl a název); když už nový je, starý pryč
!macro HUBGET_MOVE_SHORTCUT OLD NEW
  ${If} ${FileExists} "${OLD}"
    ${If} ${FileExists} "${NEW}"
      Delete "${OLD}"
    ${Else}
      !insertmacro SetShortcutTarget "${OLD}" "$INSTDIR\${MAINBINARYNAME}.exe"
      Rename "${OLD}" "${NEW}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $HubGetLegacyDir != ""
    Push $R9
    !insertmacro HUBGET_MOVE_SHORTCUT "$SMPROGRAMS\${HUBGET_LEGACY_NAME}.lnk" "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !insertmacro HUBGET_MOVE_SHORTCUT "$DESKTOP\${HUBGET_LEGACY_NAME}.lnk" "$DESKTOP\${PRODUCTNAME}.lnk"
    ; Připnutí na hlavním panelu: jen nový cíl – přejmenování zástupce by připnutí zrušilo
    StrCpy $R9 "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${HUBGET_LEGACY_NAME}.lnk"
    ${If} ${FileExists} $R9
      !insertmacro SetShortcutTarget $R9 "$INSTDIR\${MAINBINARYNAME}.exe"
    ${EndIf}
    ; Automatické spuštění po přihlášení (plugin autostart ukládá hodnotu podle názvu aplikace)
    ReadRegStr $R9 HKCU "${HUBGET_RUNKEY}" "${HUBGET_LEGACY_NAME}"
    ${If} $R9 != ""
      WriteRegStr HKCU "${HUBGET_RUNKEY}" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe" --autostart'
      DeleteRegValue HKCU "${HUBGET_RUNKEY}" "${HUBGET_LEGACY_NAME}"
    ${EndIf}
    Pop $R9
  ${EndIf}
!macroend
