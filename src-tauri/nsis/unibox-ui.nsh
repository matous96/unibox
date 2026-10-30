; Vzhled instalátoru HubGetu (NSIS, Modern UI 2) – nastavení, která musí
; platit ještě před stránkami. Šablona installer.nsi ho vkládá jako
; installerHooks (tauri.conf.json); funkce stránek a texty jsou v
; unibox-pages.nsh, který se vkládá až po jazycích.

!define UNIBOX_NSIS_DIR "${__FILEDIR__}"

; Písmo Windows 10 / 11 místo zastaralého „MS Shell Dlg“
SetFont "Segoe UI" 9

; Barvy designového systému HubGetu: text, tlumený text a pozadí
!define UNIBOX_TEXT_COLOR "0F172A"
!define UNIBOX_MUTED_COLOR "5B6475"
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "${UNIBOX_TEXT_COLOR}"

; Logo v pravé části záhlaví
!define MUI_HEADERIMAGE_RIGHT

; Vlastní texty úvodní a závěrečné obrazovky (LangString v unibox-pages.nsh)
!define MUI_WELCOMEPAGE_TITLE "$(uniboxWelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(uniboxWelcomeText)"
!define MUI_FINISHPAGE_TITLE "$(uniboxFinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(uniboxFinishText)"

; Úprava záhlaví po spuštění instalátoru i odinstalátoru
!define MUI_CUSTOMFUNCTION_GUIINIT HubGet.GUIInit
!define MUI_CUSTOMFUNCTION_UNGUIINIT un.HubGet.GUIInit

; Průběh bez dlouhého výpisu – ukáže ho tlačítko Podrobnosti
ShowInstDetails hide
ShowUninstDetails hide

; Ostré obrázky (unibox-pages.nsh): vstup, výstup a bitmapy k uvolnění
Var HubGet.ImgHwnd
Var HubGet.ImgPath
Var HubGet.ImgAlign
Var HubGet.ImgResult
Var HubGet.SidebarBitmap

; Přechod z Uniboxu (dřívější název) – odinstalace staré verze, zástupci, automatické spuštění
!include "${UNIBOX_NSIS_DIR}\hubget-migrate.nsh"
