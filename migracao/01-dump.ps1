# =====================================================================
#  FASE 0 - DUMP DE SEGURANCA DO SUPABASE
# =====================================================================
#  Este script SOMENTE LE do Supabase. Nada e alterado ou apagado la.
#  Gera 3 artefatos, em 2 locais diferentes:
#    1. completo.backup  -> formato custom (restauracao seletiva)
#    2. completo.sql     -> SQL puro (legivel, restaura em qualquer PG)
#    3. auth_users.sql   -> so os usuarios/senhas (o mais critico)
# =====================================================================

$ErrorActionPreference = "Stop"

function Passo($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Erro($msg)  { Write-Host "    [ERRO] $msg" -ForegroundColor Red }

# --- 1. Localizar o pg_dump -------------------------------------------
Passo "Localizando ferramentas do PostgreSQL"
$pgBin = $null
foreach ($v in @("18","17","16","15")) {
    $try = "C:\Program Files\PostgreSQL\$v\bin"
    if (Test-Path (Join-Path $try "pg_dump.exe")) { $pgBin = $try; break }
}
if (-not $pgBin) {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { $pgBin = Split-Path $cmd.Source }
}
if (-not $pgBin) {
    Erro "pg_dump nao encontrado. Instale o PostgreSQL antes de rodar este script."
    exit 1
}
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql   = Join-Path $pgBin "psql.exe"
Ok "pg_dump: $pgDump"
Ok ((& $pgDump --version) -join '')

# --- 2. Ler a connection string ---------------------------------------
Passo "Lendo credencial de conexao"
$confPath = Join-Path $PSScriptRoot "conexao.local"
if (-not (Test-Path $confPath)) {
    Erro "Arquivo nao encontrado: $confPath"
    Write-Host "    Copie 'conexao.local.exemplo' para 'conexao.local' e preencha a senha." -ForegroundColor Yellow
    exit 1
}
$CONN = (Get-Content $confPath | Where-Object { $_ -match '^\s*postgres' } | Select-Object -First 1).Trim()
if (-not $CONN) { Erro "Nenhuma connection string encontrada em conexao.local"; exit 1 }
if ($CONN -match 'SUA_SENHA_AQUI|YOUR-PASSWORD') {
    Erro "A senha ainda nao foi preenchida em conexao.local"; exit 1
}
if ($CONN -match ':6543/') {
    Erro "Porta 6543 (Transaction pooler) nao suporta pg_dump."
    Write-Host "    Troque para :5432 (Session pooler ou Direct connection)." -ForegroundColor Yellow
    exit 1
}
# Mostra o destino sem revelar a senha
$safe = $CONN -replace '(?<=//)([^:]+):([^@]+)(?=@)', '$1:*****'
Ok "Destino: $safe"

# --- 3. Testar a conexao ----------------------------------------------
Passo "Testando conexao (somente leitura)"
$teste = & $psql $CONN -tAc "select current_database() || ' @ ' || version();" 2>&1
if ($LASTEXITCODE -ne 0) {
    Erro "Falha ao conectar:"
    Write-Host $teste -ForegroundColor Red
    Write-Host "`n    Causas comuns:" -ForegroundColor Yellow
    Write-Host "      - Projeto Supabase pausado (Resume no dashboard)" -ForegroundColor Yellow
    Write-Host "      - Senha incorreta ou com caractere especial nao codificado" -ForegroundColor Yellow
    Write-Host "      - Rede sem IPv6: use o Session pooler em vez do Direct" -ForegroundColor Yellow
    exit 1
}
Ok ($teste -join ' ')

# --- 4. Inventario ANTES do dump (prova de integridade) ---------------
Passo "Inventariando linhas por tabela (isso e a prova de que nada se perdeu)"
$sqlInv = @"
select table_schema || '.' || table_name as tabela,
       (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                      false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema in ('public','auth') and table_type='BASE TABLE'
order by 1;
"@
$inventario = & $psql $CONN -tA -F'|' -c $sqlInv 2>&1
if ($LASTEXITCODE -ne 0) { Erro "Falha ao inventariar"; Write-Host $inventario; exit 1 }
$totalTabelas = ($inventario | Where-Object { $_ -match '\|' }).Count
$totalLinhas  = ($inventario | Where-Object { $_ -match '\|' } | ForEach-Object { [int64]($_ -split '\|')[1] } | Measure-Object -Sum).Sum
Ok "$totalTabelas tabelas, $totalLinhas linhas no total"

# --- 5. Preparar destinos ---------------------------------------------
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$destinos = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) "SHETO-BACKUP\$stamp"),
    (Join-Path ([Environment]::GetFolderPath('MyDocuments')) "SHETO-BACKUP\$stamp")
)
$principal = $destinos[0]
Passo "Preparando destinos"
foreach ($d in $destinos) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
    Ok $d
}

$inventario | Out-File -FilePath (Join-Path $principal "inventario-origem.txt") -Encoding utf8

# --- 6. Os dumps ------------------------------------------------------
Passo "Dump 1/3 - completo, formato custom"
& $pgDump $CONN --schema=public --schema=auth --no-owner --no-privileges `
    -Fc -f (Join-Path $principal "completo.backup")
if ($LASTEXITCODE -ne 0) { Erro "Dump custom falhou"; exit 1 }
Ok "completo.backup"

Passo "Dump 2/3 - completo, SQL puro"
& $pgDump $CONN --schema=public --schema=auth --no-owner --no-privileges `
    -f (Join-Path $principal "completo.sql")
if ($LASTEXITCODE -ne 0) { Erro "Dump SQL falhou"; exit 1 }
Ok "completo.sql"

Passo "Dump 3/3 - auth.users isolado (senhas bcrypt)"
& $pgDump $CONN --table=auth.users --data-only --column-inserts --no-owner --no-privileges `
    -f (Join-Path $principal "auth_users.sql")
if ($LASTEXITCODE -ne 0) {
    Erro "Dump de auth.users falhou - senhas podem precisar de reset manual"
} else {
    Ok "auth_users.sql"
}

# --- 7. Verificar que os arquivos tem conteudo real --------------------
Passo "Verificando integridade dos arquivos gerados"
$problemas = 0
foreach ($f in @("completo.backup","completo.sql","auth_users.sql")) {
    $p = Join-Path $principal $f
    if (-not (Test-Path $p)) { Erro "$f nao foi criado"; $problemas++; continue }
    $kb = [math]::Round((Get-Item $p).Length / 1KB, 1)
    if ($kb -lt 1) { Erro "$f esta vazio ($kb KB)"; $problemas++ }
    else { Ok "$f - $kb KB" }
}

# Confere que o SQL realmente contem CREATE TABLE (o schema que falta no repo)
$nTabelas = (Select-String -Path (Join-Path $principal "completo.sql") -Pattern '^CREATE TABLE' -AllMatches).Count
if ($nTabelas -lt 1) { Erro "Nenhum CREATE TABLE no dump - schema NAO foi capturado!"; $problemas++ }
else { Ok "$nTabelas CREATE TABLE capturados" }

# --- 8. Segunda copia -------------------------------------------------
Passo "Replicando para o segundo local"
Copy-Item -Path (Join-Path $principal "*") -Destination $destinos[1] -Recurse -Force
Ok $destinos[1]

# --- 9. Resumo --------------------------------------------------------
Write-Host "`n=====================================================" -ForegroundColor Cyan
if ($problemas -eq 0) {
    Write-Host " BACKUP CONCLUIDO COM SUCESSO" -ForegroundColor Green
} else {
    Write-Host " BACKUP CONCLUIDO COM $problemas PROBLEMA(S) - REVISE" -ForegroundColor Red
}
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Tabelas : $totalTabelas"
Write-Host " Linhas  : $totalLinhas"
Write-Host " Local 1 : $($destinos[0])"
Write-Host " Local 2 : $($destinos[1])"
Write-Host "=====================================================`n" -ForegroundColor Cyan
