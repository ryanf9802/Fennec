param(
    [string]$OutputDirectory = "$PSScriptRoot\..\src\Fennec.App\Assets"
)

Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

function New-FennecBitmap([int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(11, 17, 29))
    $scale = $Size / 64.0
    $cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(101, 217, 238))
    $orange = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 138, 61))
    $points = @(
        [System.Drawing.PointF]::new(10*$scale,54*$scale), [System.Drawing.PointF]::new(10*$scale,20*$scale),
        [System.Drawing.PointF]::new(20*$scale,7*$scale), [System.Drawing.PointF]::new(31*$scale,20*$scale),
        [System.Drawing.PointF]::new(54*$scale,20*$scale), [System.Drawing.PointF]::new(54*$scale,30*$scale),
        [System.Drawing.PointF]::new(24*$scale,30*$scale), [System.Drawing.PointF]::new(24*$scale,37*$scale),
        [System.Drawing.PointF]::new(45*$scale,37*$scale), [System.Drawing.PointF]::new(45*$scale,47*$scale),
        [System.Drawing.PointF]::new(24*$scale,47*$scale), [System.Drawing.PointF]::new(24*$scale,54*$scale)
    )
    $graphics.FillPolygon($cyan, $points)
    $graphics.FillRectangle($orange, 45*$scale, 37*$scale, 9*$scale, 10*$scale)
    $cyan.Dispose(); $orange.Dispose(); $graphics.Dispose()
    return $bitmap
}

$sizes = @(16, 24, 32, 48, 128, 256)
foreach ($size in $sizes) {
    $bitmap = New-FennecBitmap $size
    $bitmap.Save((Join-Path $OutputDirectory "fennec-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$iconBitmap = New-FennecBitmap 256
$icon = [System.Drawing.Icon]::FromHandle($iconBitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $OutputDirectory "Fennec.ico"))
$icon.Save($stream)
$stream.Dispose(); $icon.Dispose(); $iconBitmap.Dispose()
