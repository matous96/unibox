# Grafika instalátoru Uniboxu (NSIS): boční panel úvodní a závěrečné obrazovky
# a obrázek v záhlaví ostatních stránek. Kreslí se ve vysokém rozlišení podle
# loga (website/assets/unibox-logo.svg) – instalátor si je pak kvalitně zmenší
# podle DPI obrazovky (src-tauri/nsis/unibox-ui.nsh).
#
#   powershell -ExecutionPolicy Bypass -File scripts\installer-art.ps1
#
# Výstup: src-tauri/nsis/sidebar.bmp a src-tauri/nsis/header.bmp (24 bit – NSIS jiné neumí).

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\src-tauri\nsis'

function Color([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

# Obdélník se zaoblenými rohy
function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

# Měkký kruhový přechod (záře v pozadí)
function Glow($g, [float]$cx, [float]$cy, [float]$r, [string]$hex, [int]$alpha) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddEllipse($cx - $r, $cy - $r, 2 * $r, 2 * $r)
  $b = New-Object System.Drawing.Drawing2D.PathGradientBrush($p)
  $b.CenterColor = Color $hex $alpha
  $b.SurroundColors = @(Color $hex 0)
  $g.FillPath($b, $p)
  $b.Dispose(); $p.Dispose()
}

# Logo Uniboxu (viewBox 64 × 64) v levém horním rohu ($x, $y) o velikosti $size
function Logo($g, [float]$x, [float]$y, [float]$size) {
  $state = $g.Save()
  $g.TranslateTransform($x, $y)
  $g.ScaleTransform($size / 64, $size / 64)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF 0, 64), (Color '#5b77ff'), (Color '#4560f5'))
  $g.FillPath($bg, (RoundRect 0 0 64 64 15))
  $tile = {
    param($cx, $cy, $angle, $hex)
    $s = $g.Save()
    $g.TranslateTransform($cx, $cy)
    $g.RotateTransform($angle)
    $g.FillPath((New-Object System.Drawing.SolidBrush (Color $hex)), (RoundRect -5 -5 10 10 2.5))
    $g.Restore($s)
  }
  & $tile 24 22 -12 '#f59e0b'
  & $tile 32 15 0 '#38bdf8'
  & $tile 40 22 12 '#10b981'
  $flap = New-Object System.Drawing.SolidBrush (Color '#ffffff' 179)
  $g.FillPolygon($flap, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 15, 31), (New-Object System.Drawing.PointF 32, 31), (New-Object System.Drawing.PointF 27, 24), (New-Object System.Drawing.PointF 9, 24)))
  $g.FillPolygon($flap, [System.Drawing.PointF[]]@((New-Object System.Drawing.PointF 32, 31), (New-Object System.Drawing.PointF 49, 31), (New-Object System.Drawing.PointF 55, 24), (New-Object System.Drawing.PointF 37, 24)))
  $g.FillPath((New-Object System.Drawing.SolidBrush (Color '#ffffff')), (RoundRect 15 31 34 21 3))
  $g.Restore($state)
}

function NewCanvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  @($bmp, $g)
}

# ── Boční panel (úvodní a závěrečná obrazovka, poměr 164 : 314) ─────────────
$W = 600; $H = 1149
$bmp, $g = NewCanvas $W $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF $W, $H), (Color '#6a84ff'), (Color '#3b4ee0'))
$g.FillRectangle($bg, 0, 0, $W, $H)
Glow $g ($W * 0.15) ($H * 0.08) ($W * 0.9) '#ffffff' 70
Glow $g ($W * 0.95) ($H * 0.95) ($W * 0.95) '#8b5cf6' 120
Glow $g ($W * 0.5) ($H * 0.42) ($W * 0.55) '#ffffff' 45

# Logo s měkkým stínem a jemným světlým okrajem
$L = $W * 0.46
$lx = ($W - $L) / 2
$ly = $H * 0.40 - $L / 2
for ($i = 14; $i -ge 1; $i--) {
  $spread = $i * 3.2
  $shadow = New-Object System.Drawing.SolidBrush (Color '#1e1b6b' 9)
  $g.FillPath($shadow, (RoundRect ($lx - $spread) ($ly - $spread + 18) ($L + 2 * $spread) ($L + 2 * $spread) ($L * 0.234 + $spread)))
}
$ring = New-Object System.Drawing.Pen((Color '#ffffff' 90), 6)
$g.DrawPath($ring, (RoundRect ($lx - 3) ($ly - 3) ($L + 6) ($L + 6) ($L * 0.234 + 3)))
Logo $g $lx $ly $L

# Název
$font = New-Object System.Drawing.Font('Segoe UI Semibold', 72, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$g.DrawString('Unibox', $font, (New-Object System.Drawing.SolidBrush (Color '#ffffff')), (New-Object System.Drawing.RectangleF 0, ($ly + $L + 46), $W, 110), $fmt)

# Tři barevné body (dlaždice z loga)
$dots = @('#f59e0b', '#38bdf8', '#10b981')
for ($i = 0; $i -lt 3; $i++) {
  $cx = $W / 2 + ($i - 1) * 34
  $g.FillEllipse((New-Object System.Drawing.SolidBrush (Color $dots[$i])), ($cx - 8), ($H * 0.86 - 8), 16, 16)
}
$g.Dispose()
$bmp.Save((Join-Path $out 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

# ── Záhlaví (ostatní stránky, poměr 150 : 57, logo vpravo na bílém pozadí) ──
$W = 600; $H = 228
$bmp, $g = NewCanvas $W $H
$g.Clear((Color '#ffffff'))
$L = $H * 0.62
Logo $g ($W - $L - $H * 0.16) (($H - $L) / 2) $L
$g.Dispose()
$bmp.Save((Join-Path $out 'header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()

Write-Host "Hotovo: $out\sidebar.bmp, $out\header.bmp"
