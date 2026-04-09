$ErrorActionPreference = 'Stop'
$tempDir = "temp_fx_build"

if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null

Copy-Item "assets" -Destination "$tempDir\assets" -Recurse
Copy-Item "data" -Destination "$tempDir\data" -Recurse
Copy-Item "src" -Destination "$tempDir\src" -Recurse
Copy-Item "manifest-firefox.json" -Destination "$tempDir\manifest.json"
Copy-Item "LICENSE" -Destination "$tempDir"

Rename-Item -Path "$tempDir\data\WikiItems.json" -NewName "WikiItems.dat"
Rename-Item -Path "$tempDir\data\quests.json" -NewName "quests.dat"
Rename-Item -Path "$tempDir\data\merge_shops.json" -NewName "merge_shops.dat"

Get-ChildItem -Path "$tempDir\src\scripts" -Recurse -Filter "*.js" | ForEach-Object {
    (Get-Content -Path $_.FullName) -replace 'WikiItems\.json', 'WikiItems.dat' -replace 'quests\.json', 'quests.dat' -replace 'merge_shops\.json', 'merge_shops.dat' | Set-Content -Path $_.FullName
}

(Get-Content -Path "$tempDir\manifest.json") -replace 'WikiItems\.json', 'WikiItems.dat' -replace 'quests\.json', 'quests.dat' -replace 'merge_shops\.json', 'merge_shops.dat' | Set-Content -Path "$tempDir\manifest.json"

if (Test-Path "AQWikiTools-Firefox.zip") { Remove-Item "AQWikiTools-Firefox.zip" }
tar.exe -a -c -f AQWikiTools-Firefox.zip -C $tempDir assets data src manifest.json LICENSE

Remove-Item -Recurse -Force $tempDir
