# Reuniões — Lógica de Filtros do Dashboard

> Última atualização: 2026-03-24
> Arquivos: `public/widgets/dashboard/form.js` (fetchMeetings ~L4239)
> Aplica-se a: wish-board + dashboard_tela

---

## Visão Geral

O dashboard exibe reuniões em 5 blocos:

| Bloco | ID | O que mostra |
|-------|----|-------------|
| Acontecendo agora | `meetings-now` | Reuniões na hora atual com status "agendado" |
| Total do período | `meetings-today` | Futuras + Realizadas válidas |
| Agendadas (futuras) | `meetings-week` | Ainda não ocorreram |
| Realizadas | `meetings-month` | Já ocorreram e são válidas |
| Criadas hoje | `meetings-created-today` | Registradas no CRM hoje |

---

## Fonte de Dados

- **Tabela:** `agendamento`
- **Campos usados:** `data`, `hora`, `leadId`, `vendedor`, `score_final`, `tipo_agendamento`, `statusReuniao`, `created_at`

---

## Filtros Aplicados

### 1. Query ao Supabase

```
FROM agendamento
WHERE leadId IS NOT NULL
  AND data >= [início do período]
  AND data <= [fim do período]
  AND vendedor = [vendedor selecionado]   -- se houver filtro de vendedor
```

**Nota:** Não filtramos `statusReuniao` na query. Todas as reuniões do período são trazidas.

### 2. Filtros no JavaScript (pós-query)

| Filtro | Descrição |
|--------|-----------|
| Agência | Se o filtro de agência está ativo, faz lookup `leads.agencia` via `leadId` e remove quem não pertence à agência |
| Diretores | Remove reuniões de vendedores com `diretorVendas=true` ou `usuarioInterno=true` |

### 3. Classificação: Futura vs Passada

Para cada reunião, o dashboard verifica se `data + hora > agora`:

- **Futura:** data/hora posterior ao momento atual
- **Passada:** data/hora igual ou anterior ao momento atual

Se não há `hora` preenchida, compara apenas a `data` com o dia de hoje.

**Importante — Timezone:** O campo `hora` no banco é `timetz` e vem com sufixo `+00` (ex: `16:00:00+00`), mas o valor armazenado **já é horário local (BRT)**. O `parseMeetingDateTimeYmdHm` remove o offset antes de criar o `Date`, para interpretar corretamente como horário local.

---

## Regra de Validação: `isValidMeeting()`

Define se uma reunião **passada** conta como válida:

```javascript
function isValidMeeting(row) {
    // Ligação realizada → sempre conta
    if (row.tipo_agendamento === 'a23a700b-673e-4e7f-afed-8f0eb56c1455') return true;
    // Score IA preenchido → conta
    if (row.score_final !== null && row.score_final !== undefined && row.score_final !== '') return true;
    // Sem score e sem ligação → NÃO conta
    return false;
}
```

### Resumo:

| Condição | Conta? |
|----------|--------|
| Reunião com score IA preenchido | Sim |
| Ligação realizada (tipo_agendamento = LIGACAO_ID) | Sim |
| Reunião sem score e não é ligação | Não |
| Reunião cancelada com score preenchido | **Sim** (não filtramos status) |
| Reunião futura (qualquer status) | Sim (não exige score) |

---

## Contagem por Bloco

### Acontecendo Agora (`meetings-now`)
```
WHERE statusReuniao = 'agendado'
  AND data = hoje
  AND hora (parte HH) = hora atual
  AND vendedor não é diretor
  AND agência (se filtro ativo)
```
Não exige score (reunião em andamento).

### Total do Período (`meetings-today`)
```
countTotal = countFuture + countPast
```

### Agendadas / Futuras (`meetings-week`)
```
Reuniões com data/hora > agora
Conta TODAS (sem exigir score — ainda não aconteceram)
```

### Realizadas (`meetings-month`)
```
Reuniões com data/hora <= agora
Somente as que passam em isValidMeeting():
  - score_final preenchido OU
  - tipo_agendamento = Ligação
```

### Criadas Hoje (`meetings-created-today`)
```
WHERE created_at entre 00:00 e 23:59 de hoje
  AND leadId IS NOT NULL
  AND vendedor não é diretor
  AND agência (se filtro ativo)
```
Conta todas as criadas hoje, independente da data da reunião.

---

## Divergências Conhecidas vs Queries SQL Externas

| Aspecto | Dashboard | Query SQL típica |
|---------|-----------|-----------------|
| Filtro de status | **Não filtra** (qualquer status com score conta) | Geralmente filtra `statusReuniao IN ('realizada','Realizada')` |
| Canceladas | Não exclui explicitamente | Exclui `NOT IN ('cancelado','Cancelada')` |
| Diretores | Exclui | Geralmente não exclui |
| Agência | Filtra via `leads.agencia` | Geralmente não filtra |
| Futuras | Conta todas | Geralmente não conta |

**Principal divergência:** O dashboard conta qualquer reunião passada que tenha score preenchido, independente do `statusReuniao`. Queries SQL externas costumam exigir `statusReuniao = 'realizada'`.

---

## Constantes

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `LIGACAO_TIPO_ID` | `a23a700b-673e-4e7f-afed-8f0eb56c1455` | UUID do tipo "Ligação" na tabela `agendamento.tipo_agendamento` |
