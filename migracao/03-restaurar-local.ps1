# =====================================================================
#  FASE 1 - RESTAURAR O DUMP (extraido via MCP) NO POSTGRESQL LOCAL
# =====================================================================
#  Cria o banco 'sheto' local e restaura:
#    01-schema.sql      -> tabelas, constraints, indices, funcoes
#    02-auth-users.sql  -> usuarios com senha bcrypt (auth.users)
#    02-data.sql        -> dados das 17 tabelas public
#
#  A carga de dados roda com session_replication_role=replica para nao
#  depender da ordem de insercao respeitar as foreign keys.
#
#  Ao final, compara linha a linha contra o inventario de origem.
#
#  Uso:  .\03-restaurar-local.ps1
# =====================================================================

param(
    [string]$Banco = "sheto",
    [string]$PgUser = "postgres",
    [string]$PgHost = "localhost",
    [int]$PgPort = 5432
)

$ErrorActionPreference = "Continue"
$dumps = Join-Path $PSScriptRoot "dumps"

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

# --- 2. Conferir arquivos de dump --------------------------------------
Passo "Conferindo arquivos de dump em $dumps"
foreach ($f in @("01-schema.sql","02-auth-users.sql","02-data.sql","00-inventario-origem.txt")) {
    $p = Join-Path $dumps $f
    if (-not (Test-Path $p)) { Erro "Faltando: $f"; exit 1 }
    Ok "$f ($([math]::Round((Get-Item $p).Length/1KB,1)) KB)"
}

# --- 3. Senha do postgres local ----------------------------------------
if (-not $env:PGPASSWORD) {
    Aviso "Variavel PGPASSWORD nao definida."
    $sec = Read-Host "Senha do usuario '$PgUser' no PostgreSQL local" -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
$base = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser)

Passo "Testando PostgreSQL local"
$v = & $psql @base -d postgres -tAc "select version();" 2>&1
if ($LASTEXITCODE -ne 0) { Erro "Nao conectou:"; Write-Host $v -ForegroundColor Red; exit 1 }
Ok "conectado"

# --- 4. Proteger banco existente ----------------------------------------
Passo "Verificando banco '$Banco'"
$existe = & $psql @base -d postgres -tAc "select 1 from pg_database where datname='$Banco';" 2>&1
if ($existe -match '1') {
    Aviso "O banco '$Banco' JA EXISTE."
    $resp = Read-Host "Fazer backup dele e recriar? Digite SIM para continuar"
    if ($resp -ne "SIM") { Write-Host "Cancelado."; exit 0 }

    $pgDump = Join-Path $pgBin "pg_dump.exe"
    $antes = Join-Path $dumps "local-antes-de-recriar_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
    Passo "Salvando estado atual do banco local em $antes"
    & $pgDump @base -d $Banco -f $antes
    if ($LASTEXITCODE -eq 0) { Ok "Backup do banco local salvo" } else { Erro "Falhou - abortando por seguranca"; exit 1 }

    & $psql @base -d postgres -c "drop database $Banco;" | Out-Null
}

# --- 5. Criar banco e schema auth ---------------------------------------
Passo "Criando banco '$Banco'"
& $psql @base -d postgres -c "create database $Banco;" | Out-Null
if ($LASTEXITCODE -ne 0) { Erro "Falha ao criar o banco"; exit 1 }
Ok "criado"

& $psql @base -d $Banco -c "create schema if not exists auth;" | Out-Null
Ok "schema auth criado"

# --- 6. Restaurar schema -------------------------------------------------
$log = Join-Path $dumps "restauracao.log"
"" | Out-File $log -Encoding utf8

Passo "Restaurando 01-schema.sql (tabelas, constraints, funcoes)"
& $psql @base -d $Banco -v ON_ERROR_STOP=1 -f (Join-Path $dumps "01-schema.sql") *>> $log
if ($LASTEXITCODE -ne 0) { Erro "Falha no schema - veja $log"; exit 1 }
Ok "schema restaurado"

# --- 7. Restaurar dados (sem checagem de FK/trigger, ordem nao importa) --
Passo "Restaurando dados (auth.users + 17 tabelas public)"
$dataScript = @"
SET session_replication_role = replica;
\i '$($( (Join-Path $dumps "02-auth-users.sql") -replace '\\','/'))'
\i '$($( (Join-Path $dumps "02-data.sql") -replace '\\','/'))'
SET session_replication_role = DEFAULT;
"@
$tmpScript = Join-Path $dumps "_carregar_dados.sql"
$dataScript | Out-File $tmpScript -Encoding utf8

& $psql @base -d $Banco -v ON_ERROR_STOP=1 -f $tmpScript *>> $log
$dataOk = ($LASTEXITCODE -eq 0)
Remove-Item $tmpScript -Force -ErrorAction SilentlyContinue
if (-not $dataOk) { Erro "Falha ao carregar dados - veja $log"; exit 1 }
Ok "dados carregados"

$erros = (Select-String -Path $log -Pattern '^(ERROR|ERRO)' -AllMatches -ErrorAction SilentlyContinue).Count
if ($erros -gt 0) { Aviso "$erros linha(s) de erro no log ($log) - revise" }

# --- 8. Conferencia final ------------------------------------------------
Passo "Conferindo linha a linha contra a origem"
$sqlInv = @"
select table_schema || '.' || table_name as tabela,
       (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
                      false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema in ('public','auth') and table_name not like 'schema_migrations'
  and table_type='BASE TABLE'
  and (table_schema = 'public' or table_name = 'users')
order by 1;
"@
$destino = & $psql @base -d $Banco -tA -F'|' -c $sqlInv 2>&1

$origem = @{
    "auth.users" = 59
    "public.areas_planejamento" = 9
    "public.componentes_curriculares" = 352
    "public.escolas" = 486
    "public.horario_aulas" = 2998
    "public.horarios" = 11
    "public.niveis_ensino" = 52
    "public.professores" = 164
    "public.professores_componentes" = 574
    "public.profiles" = 58
    "public.series" = 75
    "public.series_aulas_fixas" = 8
    "public.series_componentes" = 960
    "public.solicitacoes_restricoes" = 8
    "public.turmas" = 113
    "public.turmas_professores" = 885
    "public.turnos" = 85
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

$relatorio = Join-Path $dumps "conferencia.txt"
$linhas | Format-Table -AutoSize | Out-String | Out-File $relatorio -Encoding utf8

Write-Host "`n=====================================================" -ForegroundColor Cyan
if ($divergencias -eq 0) {
    Write-Host " RESTAURACAO INTEGRA - todas as 17 tabelas conferem" -ForegroundColor Green
} else {
    Write-Host " $divergencias TABELA(S) DIVERGENTE(S) - NAO PROSSIGA" -ForegroundColor Red
}
Write-Host " Relatorio: $relatorio"
Write-Host "=====================================================`n" -ForegroundColor Cyan
