; Funkce a texty vzhledu instalátoru HubGetu (nastavení viz unibox-ui.nsh).
; Vkládá ho šablona installer.nsi po jazycích – proměnné stránek Modern UI
; už v tu chvíli existují.

LangString uniboxWelcomeTitle ${LANG_CZECH} "Vítejte v HubGetu"
LangString uniboxWelcomeText ${LANG_CZECH} "HubGet je obchod s aplikacemi pro Windows. Přes 25 000 aplikací z WinGetu, Chocolatey a Scoopu nainstalujete jedním kliknutím – bezpečně, bez reklam a přibalených doplňků.$\r$\n$\r$\nInstalace verze ${VERSION} zabere jen chvíli a nepotřebuje práva správce."
LangString uniboxFinishTitle ${LANG_CZECH} "HubGet je připravený"
LangString uniboxFinishText ${LANG_CZECH} "Instalace je hotová. HubGet najdete v nabídce Start."

LangString uniboxWelcomeTitle ${LANG_ENGLISH} "Welcome to HubGet"
LangString uniboxWelcomeText ${LANG_ENGLISH} "HubGet is an app store for Windows. Install over 25,000 apps from WinGet, Chocolatey and Scoop in one click – safely, with no ads or bundled extras.$\r$\n$\r$\nInstalling version ${VERSION} takes just a moment and doesn't need administrator rights."
LangString uniboxFinishTitle ${LANG_ENGLISH} "HubGet is ready"
LangString uniboxFinishText ${LANG_ENGLISH} "Installation is complete. You'll find HubGet in the Start menu."

!macro UNIBOX_FUNCTIONS UN

  ; Nastaví obrázek $HubGet.ImgPath do ovládacího prvku $HubGet.ImgHwnd přesně
  ; v jeho velikosti: výřez se stejným poměrem stran (na střed, s $HubGet.ImgAlign = 1
  ; zarovnaný vpravo) a kvalitní zmenšení (HALFTONE) – obrázek je ostrý při
  ; jakémkoli zvětšení obrazovky i velikosti písma. Novou bitmapu vrátí
  ; v $HubGet.ImgResult (0 = nepovedlo se, zůstane obrázek od Modern UI).
  Function ${UN}HubGet.SmoothImage
    Push $0
    Push $1
    Push $2
    Push $3
    Push $4
    Push $5
    Push $6
    Push $7
    Push $8
    Push $9
    Push $R0
    Push $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    StrCpy $HubGet.ImgResult 0

    ; Velikost ovládacího prvku v pixelech ($1 × $2)
    System::Call "*(i 0, i 0, i 0, i 0) p .r0"
    System::Call "user32::GetClientRect(p $HubGet.ImgHwnd, p r0)"
    System::Call "*$0(i, i, i .r1, i .r2)"
    System::Free $0
    IntCmp $1 0 unibox_done unibox_done
    IntCmp $2 0 unibox_done unibox_done

    ; Zdrojový obrázek ($3) a jeho rozměry ($4 × $5)
    System::Call 'user32::LoadImageW(p 0, w "$HubGet.ImgPath", i 0, i 0, i 0, i 0x2010) p .r3'
    IntCmp $3 0 unibox_done
    System::Call "*(i, i, i, i, i, p) p .r0"
    System::Call "gdi32::GetObjectW(p r3, i 24, p r0)"
    System::Call "*$0(i, i .r4, i .r5)"
    System::Free $0

    ; Výřez zdroje se stejným poměrem stran jako ovládací prvek: $6, $7 (začátek), $8 × $9
    IntOp $6 $1 * $5
    IntOp $7 $2 * $4
    ${If} $6 > $7
      ; Prvek je širší – celá šířka, výška na střed
      StrCpy $8 $4
      IntOp $9 $2 * $4
      IntOp $9 $9 / $1
      StrCpy $6 0
      IntOp $7 $5 - $9
      IntOp $7 $7 / 2
    ${Else}
      ; Prvek je užší – celá výška, šířka na střed nebo vpravo
      StrCpy $9 $5
      IntOp $8 $1 * $5
      IntOp $8 $8 / $2
      IntOp $6 $4 - $8
      ${If} $HubGet.ImgAlign != 1
        IntOp $6 $6 / 2
      ${EndIf}
      StrCpy $7 0
    ${EndIf}

    ; Zmenšení s HALFTONE do nové bitmapy ($R3)
    System::Call "user32::GetDC(p 0) p .R0"
    System::Call "gdi32::CreateCompatibleDC(p R0) p .R1"
    System::Call "gdi32::CreateCompatibleDC(p R0) p .R2"
    System::Call "gdi32::CreateCompatibleBitmap(p R0, i r1, i r2) p .R3"
    System::Call "gdi32::SelectObject(p R1, p r3) p .R4"
    System::Call "gdi32::SelectObject(p R2, p R3) p .R5"
    System::Call "gdi32::SetStretchBltMode(p R2, i 4)"
    System::Call "gdi32::SetBrushOrgEx(p R2, i 0, i 0, p 0)"
    System::Call "gdi32::StretchBlt(p R2, i 0, i 0, i r1, i r2, p R1, i r6, i r7, i r8, i r9, i 0xCC0020)"
    System::Call "gdi32::SelectObject(p R1, p R4)"
    System::Call "gdi32::SelectObject(p R2, p R5)"
    System::Call "gdi32::DeleteDC(p R1)"
    System::Call "gdi32::DeleteDC(p R2)"
    System::Call "user32::ReleaseDC(p 0, p R0)"
    System::Call "gdi32::DeleteObject(p r3)"

    ; STM_SETIMAGE, IMAGE_BITMAP
    SendMessage $HubGet.ImgHwnd 0x0172 0 $R3
    StrCpy $HubGet.ImgResult $R3

    unibox_done:
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
    Pop $9
    Pop $8
    Pop $7
    Pop $6
    Pop $5
    Pop $4
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd

  ; Záhlaví: titulek polotučným písmem, podtitulek tlumeně, ostré logo vpravo
  Function ${UN}HubGet.GUIInit
    Push $0
    CreateFont $0 "$(^Font)" 10 600
    SendMessage $mui.Header.Text ${WM_SETFONT} $0 0
    SetCtlColors $mui.Header.SubText "${UNIBOX_MUTED_COLOR}" "${MUI_BGCOLOR}"
    !ifdef MUI_HEADERIMAGE
      StrCpy $HubGet.ImgHwnd $mui.Header.Image
      StrCpy $HubGet.ImgPath "$PLUGINSDIR\modern-header.bmp"
      StrCpy $HubGet.ImgAlign 1
      Call ${UN}HubGet.SmoothImage
    !endif
    Pop $0
  FunctionEnd

!macroend

!insertmacro UNIBOX_FUNCTIONS ""
!insertmacro UNIBOX_FUNCTIONS "un."

; Úvodní a závěrečná obrazovka: ostrý boční panel, větší titulek, tlumený text
!macro UNIBOX_STYLE_WIZARD_PAGE IMAGE TITLE TEXT
  Push $0
  ; Bitmapa z minulého zobrazení (tlačítko Zpět) už nikde není
  ${If} $HubGet.SidebarBitmap <> 0
    System::Call "gdi32::DeleteObject(p $HubGet.SidebarBitmap)"
  ${EndIf}
  StrCpy $HubGet.ImgHwnd ${IMAGE}
  StrCpy $HubGet.ImgPath "$PLUGINSDIR\modern-wizard.bmp"
  StrCpy $HubGet.ImgAlign 0
  Call HubGet.SmoothImage
  StrCpy $HubGet.SidebarBitmap $HubGet.ImgResult
  CreateFont $0 "$(^Font)" 16 600
  SendMessage ${TITLE} ${WM_SETFONT} $0 1
  SetCtlColors ${TEXT} "${UNIBOX_MUTED_COLOR}" "${MUI_BGCOLOR}"
  Pop $0
!macroend

Function HubGet.WelcomeShow
  !insertmacro UNIBOX_STYLE_WIZARD_PAGE $mui.WelcomePage.Image $mui.WelcomePage.Title $mui.WelcomePage.Text
FunctionEnd

Function HubGet.FinishShow
  !insertmacro UNIBOX_STYLE_WIZARD_PAGE $mui.FinishPage.Image $mui.FinishPage.Title $mui.FinishPage.Text
FunctionEnd
