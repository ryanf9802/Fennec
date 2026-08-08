param(
    [string]$OutputDirectory = "$PSScriptRoot\..\src\Fennec.App\Assets",
    [string]$SourceDirectory = "$PSScriptRoot\..\assets\brand"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

function Read-SvgPathPoints([string]$Path, [int]$PathIndex) {
    $content = [System.IO.File]::ReadAllText($Path)
    $paths = [regex]::Matches($content, '<path\b[^>]*\bd="([^"]+)"')
    if ($paths.Count -le $PathIndex) { throw "Missing path $PathIndex in $Path" }

    $values = [regex]::Matches($paths[$PathIndex].Groups[1].Value, '-?\d+(?:\.\d+)?') |
        ForEach-Object { [double]::Parse($_.Value, [Globalization.CultureInfo]::InvariantCulture) }
    if ($values.Count % 2 -ne 0) { throw "Path $PathIndex in $Path has an unmatched coordinate" }

    $points = @()
    for ($index = 0; $index -lt $values.Count; $index += 2) {
        $points += ,@($values[$index], $values[$index + 1])
    }
    return ,$points
}

$primaryPath = Join-Path $SourceDirectory "fennec-a-mark-primary.svg"
$microPath = Join-Path $SourceDirectory "fennec-a-mark-micro-primary.svg"
$primaryMark = Read-SvgPathPoints $primaryPath 0
$primaryAccent = Read-SvgPathPoints $primaryPath 1
$microMark = Read-SvgPathPoints $microPath 0
$microAccent = Read-SvgPathPoints $microPath 1

function New-FennecBitmap([int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(101, 217, 238))
    $orange = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 138, 61))

    $micro = $Size -le 24
    $mark = if ($micro) { $microMark } else { $primaryMark }
    $accent = if ($micro) { $microAccent } else { $primaryAccent }
    $bounds = @(
        ($mark | ForEach-Object { $_[0] } | Measure-Object -Minimum).Minimum,
        ($mark | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum,
        ($mark | ForEach-Object { $_[0] } | Measure-Object -Maximum).Maximum,
        ($mark | ForEach-Object { $_[1] } | Measure-Object -Maximum).Maximum
    )
    $scale = ($Size * 0.80) / ($bounds[3] - $bounds[1])
    $offsetX = ($Size - (($bounds[2] - $bounds[0]) * $scale)) / 2 - ($bounds[0] * $scale)
    $offsetY = ($Size - (($bounds[3] - $bounds[1]) * $scale)) / 2 - ($bounds[1] * $scale)

    function Convert-Points($source) {
        [System.Drawing.PointF[]]@($source | ForEach-Object {
            [System.Drawing.PointF]::new($_[0] * $scale + $offsetX, $_[1] * $scale + $offsetY)
        })
    }

    $graphics.FillPolygon($cyan, (Convert-Points $mark))
    $graphics.FillPolygon($orange, (Convert-Points $accent))
    $cyan.Dispose(); $orange.Dispose(); $graphics.Dispose()
    return $bitmap
}

$sizes = @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256)
foreach ($size in $sizes) {
    $bitmap = New-FennecBitmap $size
    $bitmap.Save((Join-Path $OutputDirectory "fennec-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

function Write-MultiImageIcon([string]$Path, [int[]]$IconSizes) {
    $images = [System.Collections.Generic.List[byte[]]]::new()
    foreach ($size in $IconSizes) {
        $images.Add([System.IO.File]::ReadAllBytes((Join-Path $OutputDirectory "fennec-$size.png")))
    }
    $stream = [System.IO.File]::Create($Path)
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$IconSizes.Count)
        $offset = 6 + (16 * $IconSizes.Count)
        for ($index = 0; $index -lt $IconSizes.Count; $index++) {
            $size = $IconSizes[$index]
            $image = $images[$index]
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$image.Length)
            $writer.Write([uint32]$offset)
            $offset += $image.Length
        }
        foreach ($image in $images) { $writer.Write($image) }
    }
    finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

Write-MultiImageIcon (Join-Path $OutputDirectory "Fennec.ico") $sizes
