$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# --- Helper functions ---
function Get-B64($path) {
    if (Test-Path $path) {
        $bytes = [IO.File]::ReadAllBytes($path)
        return [Convert]::ToBase64String($bytes)
    }
    return ""
}

# --- 1. Load Files ---
Write-Host "Reading components from root..." -ForegroundColor Cyan
$html = [IO.File]::ReadAllText("$PWD\..\index.html", $utf8NoBom)
$css = [IO.File]::ReadAllText("$PWD\..\style.css", $utf8NoBom)
$appJs = [IO.File]::ReadAllText("$PWD\..\app.js", $utf8NoBom)
$papaJs = [IO.File]::ReadAllText("$PWD\papaparse.min.js", $utf8NoBom)

# --- 2. Process Resources ---
Write-Host "Inlining Data and Images (this might take a moment)..." -ForegroundColor Cyan
$storage = @{}

# Inline CSVs
$storage["db/codes.csv"] = Get-B64 "$PWD\..\db\codes.csv"
$storage["db/heros.csv"] = Get-B64 "$PWD\..\db\heros.csv"
$storage["db/dictionary.csv"] = Get-B64 "$PWD\..\db\dictionary.csv"

# Inline Images
Get-ChildItem "$PWD\..\images" -File | ForEach-Object {
    $key = "images/" + $_.Name
    $ext = $_.Extension.ToLower()
    $mime = "image/jpeg" # default
    if ($ext -eq ".png") { $mime = "image/png" }
    elseif ($ext -eq ".svg") { $mime = "image/svg+xml" }
    elseif ($ext -eq ".ico") { $mime = "image/x-icon" }
    
    $b64 = Get-B64 $_.FullName
    $storage[$key] = "data:$mime;base64,$b64"
}

# Convert Storage to JSON
$storageJson = $storage | ConvertTo-Json -Compress

# --- 3. Build the Portable Loader ---
$portableLoader = @"
<script>
  window.IS_PORTABLE = true;
  window.GOONIES_STORAGE = $storageJson;

  // Helper to decode Base64 UTF-8 string
  function decodeB64(b64) {
    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  // --- INTERCEPT FETCH ---
  const originalFetch = window.fetch;
  window.fetch = async (url) => {
    // Normalize URL
    const cleanUrl = url.replace('./', '');
    if (window.GOONIES_STORAGE[cleanUrl]) {
      const data = window.GOONIES_STORAGE[cleanUrl];
      // If it's a data URI (image), return as blob if needed, otherwise text
      return {
        ok: true,
        text: () => Promise.resolve(decodeB64(data)),
        status: 200
      };
    }
    return originalFetch(url);
  };

  // --- INTERCEPT IMAGE SRC ---
  const originalSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set: function(val) {
      if (typeof val === 'string') {
          // Normalize the path for matching
          const parts = val.split('/');
          const fileName = parts[parts.length - 1];
          const folder = parts[parts.length - 2] || '';
          const lookup = folder ? (folder + '/' + fileName) : fileName;
          
          // Check various forms
          const key = window.GOONIES_STORAGE[val] ? val : 
                      window.GOONIES_STORAGE['images/' + fileName] ? 'images/' + fileName : null;
          
          if (key && window.GOONIES_STORAGE[key].startsWith('data:')) {
            val = window.GOONIES_STORAGE[key];
          }
      }
      originalSrcDesc.set.call(this, val);
    },
    get: function() {
        return originalSrcDesc.get.call(this);
    }
  });
</script>
"@

# --- 4. Assemble HTML ---
Write-Host "Assembling goonies-escape.html..." -ForegroundColor Cyan

# Remove PWA stuff
$html = $html.Replace('<link rel="manifest" href="manifest.json" />', '')
# Use regex for apple-touch-icon as it might vary
$html = [regex]::Replace($html, '<link rel="apple-touch-icon" .*? />', '')

# Inline CSS
$targetCss = '<link rel="stylesheet" href="style.css" />'
$html = $html.Replace($targetCss, "<style>`n$css`n</style>")

# Inline PapaParse (matching the CDN version now in index.html)
$targetPapa = '<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>'
if ($html.Contains($targetPapa)) {
    $html = $html.Replace($targetPapa, "<script>`n$papaJs`n</script>")
} else {
    # Fallback for local path if user changed it
    $targetPapaLocal = '<script src="lib/papaparse.min.js"></script>'
    $html = $html.Replace($targetPapaLocal, "<script>`n$papaJs`n</script>")
}

# Inject Portable Loader and app.js
$targetApp = '<script src="app.js"></script>'
$scripts = $portableLoader + "`n<script>`n" + $appJs + "`n</script>"
$html = $html.Replace($targetApp, $scripts)

# Fix image references in the static HTML (e.g. setup image)
foreach ($key in $storage.Keys) {
    if ($storage[$key].StartsWith("data:")) {
        $html = $html.Replace("src=""$key""", "src=""" + $storage[$key] + """")
    }
}

# --- 5. Export ---
[IO.File]::WriteAllText("$PWD\goonies-escape.html", $html, $utf8NoBom)
Write-Host "Done! ONE-FILE portable version created: goonies-escape.html" -ForegroundColor Green
Write-Host "File size: $( (Get-Item goonies-escape.html).Length / 1KB ) KB" -ForegroundColor Yellow
