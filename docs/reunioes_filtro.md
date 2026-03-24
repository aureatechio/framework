# Reuniões — Lógica de Filtros do Dashboard

> Última atualização: 2026-03-24
> Arquivos: `public/widgets/dashboard/form.js` (fetchMeetings ~L4239)
> Aplica-se a: wish-board + dashboard_tela

---

## Resumo dos 6 Cards

| Card | Cor | ID | Filtros específicos | O que conta |
|------|-----|----|---------------------|-------------|
| **Acontecendo agora** | Vermelho | `meetings-now` | `statusReuniao = 'agendado'` + `data = hoje` + `hora (HH) = hora atual` | Reuniões em andamento neste momento |
| **Mês** (label dinâmico) | Azul | `meetings-today` | `data` no período + (`isValidMeeting` OR futura) | Futuras + Realizadas válidas (score ou ligação) |
| **Agendadas** | Cinza | `meetings-week` | `data/hora > agora` | Todas as futuras, sem exigir score |
| **Realizadas** | Verde | `meetings-month` | `data/hora <= agora` + `isValidMeeting()` | Passadas COM score preenchido ou ligação |
| **Total s/ score** | Laranja | `meetings-all-past` | `data/hora <= agora` | Todas as passadas, SEM filtro de score |
| **Criadas hoje** | Roxo | `meetings-created-today` | `created_at` entre 00:00 e 23:59 de hoje | Registradas no CRM hoje, qualquer data |

---

## Filtros Comuns (aplicados a TODOS os cards)

| Filtro | Descrição | Onde |
|--------|-----------|------|
| `leadId IS NOT NULL` | Só reuniões vinculadas a um lead | Query Supabase |
| Período | `data >= início` e `data <= fim` do período do header | Query Supabase |
| Vendedor | Se filtro ativo, `vendedor = UUID selecionado` | Query Supabase |
| Exclui diretores | `vendedores.diretorVendas = true` ou `usuarioInterno = true` | JavaScript (pós-query) |
| Agência | Se filtro ativo, cruza `leadId → leads.agencia` | JavaScript (pós-query) |

**Nota:** Não filtramos `statusReuniao` na query principal. Todas as reuniões do período são trazidas e classificadas no JS.

---

## Fonte de Dados

- **Tabela:** `agendamento`
- **Campos usados:** `data`, `hora`, `leadId`, `vendedor`, `score_final`, `tipo_agendamento`, `statusReuniao`, `created_at`

---

## Classificação: Futura vs Passada

Para cada reunião, o dashboard combina `data + hora` e compara com o momento atual:

- **Futura:** `data/hora > agora` → conta sem exigir score
- **Passada:** `data/hora <= agora` → precisa passar em `isValidMeeting()` para contar como "Realizada"

Se `hora` não está preenchida, usa `00:00` como fallback.

### Timezone

O campo `hora` no banco é `timetz` e vem com sufixo `+00` (ex: `16:00:00+00`), mas o valor armazenado **já é horário local (BRT)**. A função `parseMeetingDateTimeYmdHm` remove o offset antes de criar o `Date`, para interpretar corretamente como horário local.

```javascript
// Exemplo: "16:00:00+00" → remove "+00" → "16:00:00" → interpreta como 16h BRT
const raw = String(hm || '00:00').trim() || '00:00';
const time = raw.replace(/[+-]\d{2}(:\d{2})?$/, '');
const dt = new Date(`${data}T${time}`);
```

---

## Regra de Validação: `isValidMeeting()`

Define se uma reunião **passada** conta como "Realizada":

```javascript
function isValidMeeting(row) {
    // Ligação → sempre conta
    if (row.tipo_agendamento === 'a23a700b-673e-4e7f-afed-8f0eb56c1455') return true;
    // Score IA preenchido → conta
    if (row.score_final !== null && row.score_final !== undefined && row.score_final !== '') return true;
    // Sem score e sem ligação → NÃO conta
    return false;
}
```

| Condição | Conta como "Realizada"? | Conta como "Total s/ score"? |
|----------|------------------------|------------------------------|
| Score IA preenchido | Sim | Sim |
| Ligação (tipo_agendamento = LIGACAO_ID) | Sim | Sim |
| Sem score e não é ligação | **Não** | **Sim** |
| Cancelada com score preenchido | Sim (não filtra status) | Sim |
| Futura (qualquer status) | N/A (é futura) | N/A (é futura) |

---

## Detalhamento por Card

### 1. Acontecendo Agora (vermelho)

Query separada:
```
FROM agendamento
WHERE statusReuniao = 'agendado'
  AND data = hoje
  AND hora (parte HH) = hora atual
  AND leadId IS NOT NULL
```
Não exige score (reunião ainda em andamento).

### 2. Mês / Total do período (azul)

```
countTotal = countFuture + countPast
```
Soma das futuras (todas) + passadas válidas (com score ou ligação).
O label muda dinamicamente conforme o filtro do header (Hoje, Semana, Mês, etc).

### 3. Agendadas / Futuras (cinza)

```
Reuniões com data/hora > agora
```
Conta TODAS as futuras, sem exigir score (ainda não aconteceram).

### 4. Realizadas (verde)

```
Reuniões com data/hora <= agora
  E (score_final preenchido OU tipo_agendamento = Ligação)
```
Apenas passadas que passam em `isValidMeeting()`.

### 5. Total s/ score (laranja)

```
Reuniões com data/hora <= agora
```
TODAS as passadas, sem nenhum filtro de score ou status.
A diferença entre este card e "Realizadas" mostra quantas reuniões estão **sem score preenchido**.

### 6. Criadas Hoje (roxo)

Query separada:
```
FROM agendamento
WHERE created_at >= hoje 00:00
  AND created_at <= hoje 23:59
  AND leadId IS NOT NULL
```
Conta todas registradas hoje no CRM, independente da data da reunião.

---

## Divergências vs Sistemas Externos (lirica_aurea / Queries SQL)

| Aspecto | Dashboard | lirica_aurea / SQL externo |
|---------|-----------|---------------------------|
| Filtro de status | **Não filtra** (qualquer status com score conta) | Exige `statusReuniao = 'realizada'` |
| Canceladas | Não exclui explicitamente | Exclui `NOT IN ('cancelado','Cancelada')` |
| Score | Exige `score_final` preenchido (exceto ligações) | Não usa `score_final` |
| Ligações | Conta separado via `tipo_agendamento = LIGACAO_ID` | Não diferencia tipo |
| Diretores | Exclui | Geralmente não exclui |
| Agência | Filtra via `leads.agencia` | Geralmente não filtra |
| Futuras | Conta todas | Geralmente não conta |

**Principal divergência:** O dashboard conta qualquer reunião passada com score preenchido, independente do `statusReuniao`. Sistemas externos costumam exigir `statusReuniao = 'realizada'`.

---

## Constantes

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `LIGACAO_TIPO_ID` | `a23a700b-673e-4e7f-afed-8f0eb56c1455` | UUID do tipo "Ligação" em `agendamento.tipo_agendamento` |
