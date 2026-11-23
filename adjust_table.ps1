$inputPath = "c:/Repositorio/sistema-financeiro/tabela-preco.json"
$outputPath = "c:/Repositorio/sistema-financeiro/tabela_atualizada.json"

# Read JSON
$data = Get-Content -Path $inputPath -Raw | ConvertFrom-Json

# Define replacements
$replacements = @{
    "BOX" = "CAIXA"
    "SLIM" = "FINO"
}

foreach ($item in $data) {
    # Remove ponto if exists
    if ($item.PSObject.Properties.Name -contains "ponto") { $item.PSObject.Properties.Remove('ponto') }
    foreach ($field in @('product_line','product_name')) {
        if ($item.$field -and $item.$field -is [string]) {
            $text = $item.$field
            foreach ($k in $replacements.Keys) {
                $v = $replacements[$k]
                $text = $text -replace "\b$k\b", $v
            }
            $item.$field = $text
        }
    }
}

# Write output JSON with indentation
$data | ConvertTo-Json -Depth 10 -Compress | Out-File -FilePath $outputPath -Encoding utf8
Write-Host "Adjusted table written to $outputPath"
