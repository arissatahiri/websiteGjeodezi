# Gjeodeti I.T — local static server (no Node/Python needed)
$ErrorActionPreference = "Stop"
$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = Get-Location }

# Use 127.0.0.1 (avoids Windows URLACL conflicts on "localhost")
$url = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
  $listener.Start()
} catch {
  Write-Host "Porti $port eshte i zene. Provo te mbyllesh dritaren tjeter ose ndrysho portin." -ForegroundColor Red
  Write-Host $_.Exception.Message
  pause
  exit 1
}

Write-Host ""
Write-Host "  Gjeodeti I.T server" -ForegroundColor Cyan
Write-Host "  Hap: $url" -ForegroundColor Green
Write-Host "  Folder: $root"
Write-Host "  Ctrl+C per ta ndalur" -ForegroundColor DarkGray
Write-Host ""

Start-Process $url

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2"= "font/woff2"
  ".map"  = "application/json"
  ".txt"  = "text/plain; charset=utf-8"
  ".md"   = "text/plain; charset=utf-8"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  $rel = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart("/"))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }

  $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    $res.StatusCode = 403
    $res.Close()
    continue
  }

  if ((Test-Path $path -PathType Container)) {
    $path = Join-Path $path "index.html"
  }

  if (-not (Test-Path $path -PathType Leaf)) {
    $res.StatusCode = 404
    $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
    continue
  }

  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $res.ContentLength64 = $bytes.Length
  $res.AddHeader("Cache-Control", "no-cache")
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}
