Get-ChildItem -Path 'c:\Repositorio\sistema-financeiro\src' -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.sql | ForEach-Object {
    $content = Get-Content -Raw -Path $_.FullName
    $new = $content -replace 'public\.v2_' , 'public.bemaviv_' -replace 'public\.crm_contato_v2' , 'public.bemaviv_crm_contato'
    if ($new -ne $content) {
        Set-Content -Path $_.FullName -Value $new -Force
    }
}
