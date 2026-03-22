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

# Inline Sounds
Get-ChildItem "$PWD\..\sounds" -File | ForEach-Object {
    $key = "sounds/" + $_.Name
    $ext = $_.Extension.ToLower()
    $mime = "audio/mpeg"
    if ($ext -eq ".wav") { $mime = "audio/wav" }
    
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
    // Extract key (e.g. 'db/codes.csv' or 'sounds/success.mp3') from URL
    const parts = url.split('/');
    const fileName = parts[parts.length - 1];
    const folder = parts[parts.length - 2] || '';
    const key = (folder && ['db', 'images', 'sounds'].includes(folder)) ? (folder + '/' + fileName) : fileName;

    if (window.GOONIES_STORAGE[key]) {
      const data = window.GOONIES_STORAGE[key];
      // If it's a data URI (image/audio), return as blob if needed, otherwise text
      return {
        ok: true,
        text: () => Promise.resolve(decodeB64(data)),
        status: 200
      };
    }
    return originalFetch(url);
  };

  // --- INTERCEPT IMAGE SRC ---
  // --- INTERCEPT IMAGE SRC ---
  const originalSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (originalSrcDesc && originalSrcDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set: function(val) {
        if (typeof val === 'string' && !val.startsWith('data:')) {
            const fileName = val.split('/').pop();
            const key = 'images/' + fileName;
            if (window.GOONIES_STORAGE[key]) {
               val = window.GOONIES_STORAGE[key];
            }
        }
        originalSrcDesc.set.call(this, val);
      },
      get: function() { return originalSrcDesc.get.call(this); }
    });
  }

  // --- INTERCEPT AUDIO ---
  // 1. Patch the constructor
  const OriginalAudio = window.Audio;
  const originalAudioSrcDesc = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, 'src') || 
                               Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  
  if (originalAudioSrcDesc && originalAudioSrcDesc.set) {
    window.Audio = function(src) {
      const instance = new OriginalAudio();
      if (src) {
         instance.src = src; 
      }
      return instance;
    };
    window.Audio.prototype = OriginalAudio.prototype;

    // 2. Patch the setter on the prototype
    Object.defineProperty(HTMLAudioElement.prototype, 'src', {
      set: function(val) {
        if (typeof val === 'string' && !val.startsWith('data:')) {
            const fileName = val.split('/').pop();
            const key = 'sounds/' + fileName;
            if (window.GOONIES_STORAGE[key]) {
              val = window.GOONIES_STORAGE[key];
            }
        }
        originalAudioSrcDesc.set.call(this, val);
      },
      get: function() { return originalAudioSrcDesc.get.call(this); }
    });
  }
</script>
"@

# --- 4. Assemble HTML ---
Write-Host "Assembling goonies-escape.html..." -ForegroundColor Cyan

# Remove original scripts and PWA stuff
$html = $html.Replace('<script src="app.js"></script>', '')
$html = $html.Replace('<script src="sw.js"></script>', '')
$html = $html.Replace('<link rel="manifest" href="manifest.json" />', '')
# Remove ALL icon/favicon related links
$html = [regex]::Replace($html, '<link rel="(icon|shortcut icon|apple-touch-icon)" .*? />', '')

# Inline CSS
$targetCss = '<link rel="stylesheet" href="style.css" />'
$html = $html.Replace($targetCss, "<style>`n$css`n</style>")

# Inline PapaParse
$targetPapa = '<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>'
if ($html.Contains($targetPapa)) {
    $html = $html.Replace($targetPapa, "<script>`n$papaJs`n</script>")
}

# Inject Meta, Portable Loader, and app.js at the end of body
# We do it this way to ensure it's ALWAYS found and applied before app logic
$inlinedScripts = @"
$portableLoader
<script>
// --- INLINED APP LOGIC ---
$appJs
</script>
"@

$html = $html.Replace('</body>', "$inlinedScripts`n</body>")

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
