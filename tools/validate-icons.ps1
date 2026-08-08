param(
    [string]$AssetDirectory = "$PSScriptRoot\..\src\Fennec.App\Assets"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$requiredSizes = @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256)
$cyan = [System.Drawing.Color]::FromArgb(101, 217, 238)
$orange = [System.Drawing.Color]::FromArgb(255, 138, 61)

foreach ($size in $requiredSizes) {
    $path = Join-Path $AssetDirectory "fennec-$size.png"
    if (-not [System.IO.File]::Exists($path)) { throw "Missing icon asset: $path" }
    $bitmap = [System.Drawing.Bitmap]::new($path)
    try {
        if ($bitmap.Width -ne $size -or $bitmap.Height -ne $size) {
            throw "$path is $($bitmap.Width)x$($bitmap.Height), expected ${size}x${size}"
        }
        $last = $size - 1
        foreach ($corner in @(@(0, 0), @($last, 0), @(0, $last), @($last, $last))) {
            if ($bitmap.GetPixel($corner[0], $corner[1]).A -ne 0) { throw "$path has an opaque background" }
        }
        $hasCyan = $false
        $hasOrange = $false
        for ($x = 0; $x -lt $size -and (-not $hasCyan -or -not $hasOrange); $x++) {
            for ($y = 0; $y -lt $size -and (-not $hasCyan -or -not $hasOrange); $y++) {
                $pixel = $bitmap.GetPixel($x, $y)
                $hasCyan = $hasCyan -or ($pixel.A -gt 0 -and [Math]::Abs($pixel.R - $cyan.R) -le 24 -and [Math]::Abs($pixel.G - $cyan.G) -le 24 -and [Math]::Abs($pixel.B - $cyan.B) -le 24)
                $hasOrange = $hasOrange -or ($pixel.A -gt 0 -and [Math]::Abs($pixel.R - $orange.R) -le 32 -and [Math]::Abs($pixel.G - $orange.G) -le 32 -and [Math]::Abs($pixel.B - $orange.B) -le 32)
            }
        }
        if (-not $hasCyan -or -not $hasOrange) { throw "$path does not contain the primary cyan/orange mark" }
    }
    finally { $bitmap.Dispose() }
}

$iconPath = Join-Path $AssetDirectory "Fennec.ico"
$stream = [System.IO.File]::OpenRead($iconPath)
$reader = [System.IO.BinaryReader]::new($stream)
try {
    if ($reader.ReadUInt16() -ne 0 -or $reader.ReadUInt16() -ne 1) { throw "$iconPath is not a Windows icon" }
    $count = $reader.ReadUInt16()
    if ($count -ne $requiredSizes.Count) { throw "$iconPath has $count images; expected $($requiredSizes.Count)" }
    $actualSizes = @()
    $entries = @()
    for ($index = 0; $index -lt $count; $index++) {
        $width = $reader.ReadByte()
        $height = $reader.ReadByte()
        $reader.ReadByte() | Out-Null
        $reader.ReadByte() | Out-Null
        $planes = $reader.ReadUInt16()
        $bitDepth = $reader.ReadUInt16()
        $imageLength = $reader.ReadUInt32()
        $imageOffset = $reader.ReadUInt32()
        $actualSize = if ($width -eq 0 -and $height -eq 0) { 256 } elseif ($width -eq $height) { [int]$width } else { throw "$iconPath contains a non-square image" }
        if ($planes -ne 1 -or $bitDepth -ne 32) { throw "$iconPath entry $actualSize is not 32-bit RGBA" }
        $actualSizes += $actualSize
        $entries += [pscustomobject]@{ Size = $actualSize; Length = $imageLength; Offset = $imageOffset }
    }
    if (Compare-Object $requiredSizes $actualSizes) { throw "$iconPath does not contain the required sizes" }
    foreach ($entry in $entries) {
        if ($entry.Offset + $entry.Length -gt $stream.Length) { throw "$iconPath entry $($entry.Size) exceeds the file boundary" }
        $stream.Position = $entry.Offset
        $iconBytes = $reader.ReadBytes($entry.Length)
        $pngBytes = [System.IO.File]::ReadAllBytes((Join-Path $AssetDirectory "fennec-$($entry.Size).png"))
        if ([Convert]::ToBase64String($iconBytes) -ne [Convert]::ToBase64String($pngBytes)) {
            throw "$iconPath entry $($entry.Size) does not match its validated transparent PNG"
        }
    }
}
finally {
    $reader.Dispose()
    $stream.Dispose()
}

Write-Output "Fennec icon validation passed: transparent cyan/orange PNGs and 32-bit multi-resolution ICO"
