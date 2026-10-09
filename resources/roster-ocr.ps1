# Local image-file OCR only. This worker never captures the screen.
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
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hans-CN'))
  if ($null -eq $engine) { throw 'Chinese OCR unavailable' }
  $asyncMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $recognize = $asyncMethod.MakeGenericMethod([Windows.Media.Ocr.OcrResult])
  [Console]::WriteLine('{"ready":true}')
} catch { [Console]::WriteLine((@{fatal=$_.Exception.Message} | ConvertTo-Json -Compress)); exit 1 }
while ($null -ne ($request = [Console]::ReadLine())) {
  $source=$null; $bitmap=$null; $graphics=$null; $software=$null
  try {
    $command = $request | ConvertFrom-Json
    if ($command.op -ne 'file') { throw 'File operation required' }
    $source = [Drawing.Bitmap]::new([string]$command.path)
    if ($source.Width -gt 12000 -or $source.Height -gt 12000 -or ($source.Width * $source.Height) -gt 40000000) { throw 'Image too large' }
    $scale = [Math]::Min(1,[Windows.Media.Ocr.OcrEngine]::MaxImageDimension/[Math]::Max($source.Width,$source.Height))
    $width=[int]($source.Width*$scale); $height=[int]($source.Height*$scale)
    $bitmap = [Drawing.Bitmap]::new($width,$height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics=[Drawing.Graphics]::FromImage($bitmap)
    $graphics.DrawImage($source,0,0,$width,$height)
    $graphics.Dispose(); $graphics=$null
    $locked=$bitmap.LockBits([Drawing.Rectangle]::new(0,0,$width,$height),[Drawing.Imaging.ImageLockMode]::ReadOnly,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $bytes=New-Object byte[] ($locked.Stride*$locked.Height)
      [Runtime.InteropServices.Marshal]::Copy($locked.Scan0,$bytes,0,$bytes.Length)
    } finally { $bitmap.UnlockBits($locked) }
    $buffer=[Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]::AsBuffer($bytes)
    $software=[Windows.Graphics.Imaging.SoftwareBitmap]::CreateCopyFromBuffer($buffer,[Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,$width,$height,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore)
    $task=$recognize.Invoke($null,@($engine.RecognizeAsync($software)))
    if (!$task.Wait(12000)) { throw 'OCR timeout' }
    $lines=@($task.Result.Lines | ForEach-Object {
      $words=@($_.Words)
      @{text=$_.Text; x=(($words | ForEach-Object {$_.BoundingRect.X} | Measure-Object -Minimum).Minimum / $width); y=(($words | ForEach-Object {$_.BoundingRect.Y} | Measure-Object -Minimum).Minimum / $height)}
    })
    [Console]::WriteLine((@{kind='recognized';lines=$lines} | ConvertTo-Json -Depth 5 -Compress))
  } catch { [Console]::WriteLine((@{kind='error';error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
  finally { if($software){$software.Dispose()}; if($graphics){$graphics.Dispose()}; if($bitmap){$bitmap.Dispose()}; if($source){$source.Dispose()} }
}
