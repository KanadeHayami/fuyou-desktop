# Persistent, local-only screen-region OCR worker. No screenshots are written to disk.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  Add-Type -AssemblyName System.Drawing
  [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
  [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
  [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
  [Windows.Globalization.Language, Windows.Foundation, ContentType=WindowsRuntime] | Out-Null
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FuyouCaptureNative {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref Point p);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
'@
  [FuyouCaptureNative]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hans-CN'))
  if ($null -eq $engine) { throw 'Windows Chinese OCR language support is not installed' }
  $asyncMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $recognizeMethod = $asyncMethod.MakeGenericMethod([Windows.Media.Ocr.OcrResult])
  $hasher = [Security.Cryptography.SHA256]::Create()
  $previousHash = ''
  $previousCursor = $null
  [Console]::WriteLine('{"ready":true}')
} catch {
  [Console]::WriteLine((@{ fatal = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
while ($null -ne ($request = [Console]::ReadLine())) {
  $bitmap = $null; $source = $null; $graphics = $null; $software = $null
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $process = [Diagnostics.Process]::GetCurrentProcess()
  $cpuStart = $process.TotalProcessorTime.TotalMilliseconds
  try {
    $command = $request | ConvertFrom-Json
    $region = $command.region
    # Defensive validation even though the main process also validates these fractions.
    if ($command.op -ne 'hover' -and (!$region -or $region.x -lt 0 -or $region.y -lt 0 -or $region.width -lt .05 -or $region.height -lt .05 -or ($region.x + $region.width) -gt 1.001 -or ($region.y + $region.height) -gt 1.001)) { throw 'Invalid capture region' }
    if ($command.op -eq 'file') {
      # Used by local fixture verification only; never exposed over renderer IPC.
      $source = [Drawing.Bitmap]::new([string]$command.path)
      $width = $source.Width; $height = $source.Height
    } elseif ($command.op -eq 'capture' -or $command.op -eq 'hover') {
      $handle = [FuyouCaptureNative]::GetForegroundWindow()
      [uint32]$owner = 0
      [FuyouCaptureNative]::GetWindowThreadProcessId($handle, [ref]$owner) | Out-Null
      $foreground = [Diagnostics.Process]::GetProcessById($owner)
      if ($foreground.ProcessName -ne 'dota2' -or [FuyouCaptureNative]::IsIconic($handle)) {
        $previousHash = ''
        $previousCursor = $null
        [Console]::WriteLine('{"kind":"idle","reason":"not-foreground"}')
        continue
      }
      $rect = [FuyouCaptureNative+Rect]::new(); $point = [FuyouCaptureNative+Point]::new()
      if (![FuyouCaptureNative]::GetClientRect($handle, [ref]$rect) -or ![FuyouCaptureNative]::ClientToScreen($handle, [ref]$point)) { throw 'Cannot locate game window' }
      $width = $rect.Right; $height = $rect.Bottom
      if ($width -lt 640 -or $height -lt 360) { throw 'Game window is too small' }
      if ($command.op -eq 'hover') {
        $cursor = [FuyouCaptureNative+Point]::new()
        if (![FuyouCaptureNative]::GetCursorPos([ref]$cursor)) { throw 'Cannot locate pointer' }
        $cursorX = $cursor.X - $point.X; $cursorY = $cursor.Y - $point.Y
        if ($cursorX -lt 0 -or $cursorX -ge $width -or $cursorY -lt 0 -or $cursorY -ge $height -or ($command.hudOnly -and $cursorY -lt $height * .5)) {
          $previousCursor = $null; $previousHash = ''
          [Console]::WriteLine('{"kind":"idle","reason":"outside-hud"}'); continue
        }
        $moved = $null -eq $previousCursor -or [Math]::Abs($cursor.X - $previousCursor.X) + [Math]::Abs($cursor.Y - $previousCursor.Y) -gt 8
        $previousCursor = $cursor
        if ($moved) { $previousHash = ''; [Console]::WriteLine('{"kind":"idle","reason":"pointer-moving"}'); continue }
        # A bounded crop follows the pointer; no assumptions about a cropped sample's screen position.
        $hoverWidth = [Math]::Min($width, [Math]::Min(1800, [Math]::Max(800, $width * .5)))
        $hoverHeight = [Math]::Min($height, [Math]::Min(1000, [Math]::Max(450, $height * .55)))
        $hoverLeft = [Math]::Max(0, [Math]::Min($width - $hoverWidth, $cursorX - $hoverWidth * .5))
        $hoverTop = [Math]::Max(0, [Math]::Min($height - $hoverHeight, $cursorY - $hoverHeight * .7))
        $region = @{ x=$hoverLeft/$width; y=$hoverTop/$height; width=$hoverWidth/$width; height=$hoverHeight/$height }
      }
    } else { throw 'Unsupported capture request' }
    $left = [int][Math]::Floor($width * $region.x); $top = [int][Math]::Floor($height * $region.y)
    $cropWidth = [Math]::Min([int][Math]::Floor($width * $region.width), $width - $left)
    $cropHeight = [Math]::Min([int][Math]::Floor($height * $region.height), $height - $top)
    if ($cropWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $cropHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'Capture region exceeds Windows OCR size limit' }
    $bitmap = [Drawing.Bitmap]::new($cropWidth, $cropHeight, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    if ($source) {
      $graphics.DrawImage($source, [Drawing.Rectangle]::new(0,0,$cropWidth,$cropHeight), [Drawing.Rectangle]::new($left,$top,$cropWidth,$cropHeight), [Drawing.GraphicsUnit]::Pixel)
    } else {
      $graphics.CopyFromScreen($point.X+$left,$point.Y+$top,0,0,$bitmap.Size,[Drawing.CopyPixelOperation]::SourceCopy)
      # Discard a frame if focus changed during the screen copy.
      if ([FuyouCaptureNative]::GetForegroundWindow() -ne $handle) { $previousHash=''; [Console]::WriteLine('{"kind":"idle","reason":"focus-changed"}'); continue }
    }
    $graphics.Dispose(); $graphics=$null
    $locked = $bitmap.LockBits([Drawing.Rectangle]::new(0,0,$cropWidth,$cropHeight),[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $bytes = New-Object byte[] ($locked.Stride*$locked.Height)
      [Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$bytes,0,$bytes.Length)
    } finally { $bitmap.UnlockBits($locked) }
    $hash = [Convert]::ToBase64String($hasher.ComputeHash($bytes))
    $captureMs = $timer.Elapsed.TotalMilliseconds
    $result = @{ kind='unchanged'; width=$cropWidth; height=$cropHeight; captureMs=[Math]::Round($captureMs,1); ocrMs=0 }
    if ($hash -ne $previousHash -or $command.force) {
      $buffer = [Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
      $software = [Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer($buffer,[Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,$cropWidth,$cropHeight,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore)
      $task = $recognizeMethod.Invoke($null,@($engine.RecognizeAsync($software)))
      if (!$task.Wait(12000)) { throw 'OCR timed out' }
      $lines = @($task.Result.Lines | ForEach-Object {
        $words = @($_.Words)
        $lineLeft = ($words | ForEach-Object {$_.BoundingRect.X} | Measure-Object -Minimum).Minimum
        $lineTop = ($words | ForEach-Object {$_.BoundingRect.Y} | Measure-Object -Minimum).Minimum
        @{ text=$_.Text; x=[Math]::Round($lineLeft/$cropWidth,4); y=[Math]::Round($lineTop/$cropHeight,4) }
      })
      $result.kind='recognized'; $result.lines=$lines
      $result.ocrMs=[Math]::Round($timer.Elapsed.TotalMilliseconds-$captureMs,1)
      $previousHash=$hash
    }
    if ($command.op -eq 'hover') {
      $afterCursor = [FuyouCaptureNative+Point]::new()
      if (![FuyouCaptureNative]::GetCursorPos([ref]$afterCursor) -or [FuyouCaptureNative]::GetForegroundWindow() -ne $handle -or [Math]::Abs($afterCursor.X-$cursor.X) + [Math]::Abs($afterCursor.Y-$cursor.Y) -gt 8) {
        $previousHash = ''; $previousCursor = $null
        [Console]::WriteLine('{"kind":"idle","reason":"focus-changed"}'); continue
      }
    }
    $process.Refresh()
    $result.cpuMs=[Math]::Round($process.TotalProcessorTime.TotalMilliseconds-$cpuStart,1)
    $result.memoryMB=[Math]::Round($process.WorkingSet64/1MB,1)
    $result.totalMs=[Math]::Round($timer.Elapsed.TotalMilliseconds,1)
    [Console]::WriteLine(($result | ConvertTo-Json -Depth 5 -Compress))
  } catch {
    $previousHash=''
    [Console]::WriteLine((@{ kind='error'; error=$_.Exception.Message } | ConvertTo-Json -Compress))
  } finally {
    if ($software) {$software.Dispose()}; if ($graphics) {$graphics.Dispose()}; if ($bitmap) {$bitmap.Dispose()}; if ($source) {$source.Dispose()}
  }
}
$hasher.Dispose()
