# =====================================================================
#  FASE 1 - RESTAURAR O DUMP NO POSTGRESQL LOCAL
# =====================================================================
#  Cria o banco 'sheto' local e restaura o dump gerado pelo 01-dump.ps1.
#  Ao final, compara linha a linha contra o inventario da origem.
#
#  Uso:  .\02-restaurar.ps1                  (usa o backup mais recente)
#        .\02-restaurar.ps1 -Pasta "C:\..."  (usa um backup especifico)
# =====================================================================

param(
    [string]$Pasta = "",
    [string]$Banco = "sheto",
    [string]$PgUser = "postgres",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Stop"

function Passo($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Aviso($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }
function Erro($msg)  { Write-Host "    [ERRO] $msg" -ForegroundColor Red }

# --- 1. Ferramentas ---------------------------------------------------
Passo "Localizando PostgreSQL"
$pgBin = $null
foreach ($v in @("18","17","16","15")) {
    $try = "C:\Program Files\PostgreSQL\$v\bin"
    if (Test-Path (Join-Path $try "psql.exe")) { $pgBin = $try; break }
}
if (-not $pgBin) { Erro "PostgreSQL nao encontrado"; exit 1 }
$psql = Join-Path $pgBin "psql.exe"
Ok $pgBin

# --- 2. Achar o backup ------------------------------------------------
Passo "Localizando backup"
if (-not $Pasta) {
    $raiz = Join-Path ([Environment]::GetFolderPath('Desktop')) "SHETO-BACKUP"
    if (-not (Test-Path $raiz)) { Erro "Nenhum backup em $raiz. Rode 01-dump.ps1 primeiro."; exit 1 }
    $Pasta = (Get-ChildItem $raiz -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
}
$dumpSql = Join-Path $Pasta "completo.sql"
if (-not (Test-Path $dumpSql)) { Erro "completo.sql nao encontrado em $Pasta"; exit 1 }
Ok $Pasta

# --- 3. Senha do postgres local ---------------------------------------
if (-not $env:PGPASSWORD) {
    Aviso "Variavel PGPASSWORD nao definida."
    $sec = Read-Host "Senha do usuario '$PgUser' no PostgreSQL local" -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
$base = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser)

# --- 4. Testar conexao local ------------------------------------------
Passo "Testando PostgreSQL local"
$v = & $psql @base -d postgres -tAc "select version();" 2>&1
if ($LASTEXITCODE -ne 0) { Erro "Nao conectou no Postgres local:"; Write-Host $v -ForegroundColor Red; exit 1 }
Ok (($v -join ' ').Substring(0, [Math]::Min(60, ($v -join ' ').Length)))

# --- 5. Proteger banco existente --------------------------------------
Passo "Verificando banco '$Banco'"
$existe = & $psql @base -d postgres -tAc "select 1 from pg_database where datname='$Banco';" 2>&1
if ($existe -match '1') {
    Aviso "O banco '$Banco' JA EXISTE."
    $resp = Read-Host "Fazer backup dele e recriar? Digite SIM para continuar"
    if ($resp -ne "SIM") { Write-Host "Cancelado."; exit 0 }

    $pgDump = Join-Path $pgBin "pg_dump.exe"
    $antes = Join-Path $Pasta "local-antes-de-recriar.sql"
    Passo "Salvando estado atual do banco local em $antes"
    & $pgDump @base -d $Banco -f $antes
    if ($LASTEXITCODE -eq 0) { Ok "Backup do banco local salvo" } else { Erro "Falhou - abortando por seguranca"; exit 1 }

    & $psql @base -d postgres -c "drop database $Banco;" | Out-Null
}

# --- 6. Criar e restaurar ---------------------------------------------
Passo "Criando banco '$Banco'"
& $psql @base -d postgres -c "create database $Banco;" | Out-Null
if ($LASTEXITCODE -ne 0) { Erro "Falha ao criar o banco"; exit 1 }
Ok "criado"

Passo "Criando schema 'auth' (o dump espera que exista)"
& $psql @base -d $Banco -c "create schema if not exists auth;" | Out-Null
Ok "auth"

Passo "Restaurando (avisos sobre extensoes/roles do Supabase sao esperados)"
$log = Join-Path $Pasta "restauracao.log"
& $psql @base -d $Banco -v ON_ERROR_STOP=0 -f $dumpSql *> $log
Ok "log em $log"

$erros = (Select-String -Path $log -Pattern '^(ERROR|ERRO)' -AllMatches).Count
if ($erros -gt 0) { Aviso "$erros linha(s) de erro no log - revise (muitas sao inofensivas: roles/extensoes do Supabase)" }

# --- 7. Conferencia final --------------------------------------------
Passo "Conferindo linha a linha contra a origem"
$sqlInv = @"
select table_schema || '.' || table_name as tabela,
       (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                      false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema in ('public','auth') and table_type='BASE TABLE'
order by 1;
"@
$destino = & $psql @base -d $Banco -tA -F'|' -c $sqlInv 2>&1

$origemPath = Join-Path $Pasta "inventario-origem.txt"
if (-not (Test-Path $origemPath)) { Aviso "inventario-origem.txt ausente - sem comparacao"; exit 0 }

$origem = @{}
Get-Content $origemPath | Where-Object { $_ -match '\|' } | ForEach-Object {
    $p = $_ -split '\|'; $origem[$p[0].Trim()] = [int64]$p[1]
}
$dest = @{}
$destino | Where-Object { $_ -match '\|' } | ForEach-Object {
    $p = $_ -split '\|'; $dest[$p[0].Trim()] = [int64]$p[1]
}

$linhas = @()
$divergencias = 0
foreach ($t in ($origem.Keys | Sort-Object)) {
    $o = $origem[$t]
    $d = if ($dest.ContainsKey($t)) { $dest[$t] } else { -1 }
    if ($d -eq $o) { $status = "OK" }
    elseif ($d -eq -1) { $status = "FALTANDO"; $divergencias++ }
    else { $status = "DIVERGENTE"; $divergencias++ }
    $linhas += [pscustomobject]@{ Tabela=$t; Origem=$o; Local=$d; Status=$status }
}
$linhas | Format-Table -AutoSize

$relatorio = Join-Path $Pasta "conferencia.txt"
$linhas | Format-Table -AutoSize | Out-String | Out-File $relatorio -Encoding utf8

Write-Host "`n=====================================================" -ForegroundColor Cyan
if ($divergencias -eq 0) {
    Write-Host " RESTAURACAO INTEGRA - todas as tabelas conferem" -ForegroundColor Green
} else {
    Write-Host " $divergencias TABELA(S) DIVERGENTE(S) - NAO PROSSIGA" -ForegroundColor Red
}
Write-Host " Relatorio: $relatorio"
Write-Host "=====================================================`n" -ForegroundColor Cyan
