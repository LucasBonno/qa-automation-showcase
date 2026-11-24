# QuoteLab · Vitrine de automação de testes

[![CI](https://github.com/LucasBonno/qa-automation-showcase/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasBonno/qa-automation-showcase/actions/workflows/ci.yml)
[![Playwright](https://img.shields.io/badge/Playwright-TypeScript-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

🇧🇷 Português · 🇬🇧 [English](README.md)

Projeto de automação de testes ponta a ponta com **Playwright e TypeScript**. Ele testa o **QuoteLab**, um pequeno simulador de cotações de locação e venda de equipamentos que vive neste mesmo repositório. Qualquer pessoa clona e roda **os 415 testes em cerca de dois minutos e meio**, sem conta, sem serviço externo e sem configuração além de `npm install`.

> **Relatórios publicados:** <https://lucasbonno.github.io/qa-automation-showcase/> (atualizados pelo CI a cada push na `main`).
>
> O QuoteLab e todos os seus dados são fictícios. Este repositório não tem relação com nenhum empregador ou cliente.

![Formulário de cotação com o painel de cálculo ao vivo](docs/img/form-lease.png)

## O que este projeto demonstra

| Habilidade | Onde ver |
|---|---|
| **Oráculos de cálculo**: cada valor na tela é conferido contra uma fórmula independente, em aritmética exata com `BigInt`, nunca contra o código do próprio app | [`framework/oracles/`](framework/oracles) |
| **Arquitetura em camadas**: Page Objects, cliente de API tipado, fixtures que limpam o que criam, fábricas de cenários | [`framework/`](framework) |
| **Um roteiro, várias categorias**: os mesmos roteiros de locação e venda rodam para quatro categorias, cada uma com taxa, limite e adicional próprios | [`framework/suites/`](framework/suites) |
| **Dados guiados por limites**: a linha de aprovação é *encontrada* com o oráculo (busca binária) e testada uma unidade antes e depois | [`framework/factory/scenarios.ts`](framework/factory/scenarios.ts) |
| **Testes de UI determinísticos**: sem `sleep`. O app publica o estado da tela e o teste espera por ele | [`BasePage.ready`](framework/pages/base.page.ts) |
| **Controle de acesso**: matriz completa perfil × ação, tokens forjados, sessão expirada, duas abas do navegador | [`suites/access/`](suites/access) |
| **Contrato da API e persistência**: mensagens de validação, máquina de estados, controle de versão otimista, trilha de auditoria conferida no armazenamento | [`suites/api/`](suites/api) |
| **Desenho da execução**: dependências entre projetos, portão de smoke, suítes de leitura em paralelo, suítes que alteram dados sozinhas e por último | [`playwright.config.ts`](playwright.config.ts) |
| **Os testes pegam defeitos?** Uma verificação de mutação injeta 10 defeitos propositais e confere que as suítes falham | [`scripts/mutation-check.mjs`](scripts/mutation-check.mjs) |
| **CI/CD**: checagem de tipos, lint, execução completa e relatórios no GitHub Pages | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **Relatório próprio**: resumo de uma página da execução, em português e inglês | [`framework/reporter/`](framework/reporter) |

## Como rodar

Requisito: Node.js 20.12 ou superior.

```bash
npm install
npx playwright install chromium

npm test                  # tudo, na ordem das dependências (cerca de 2,5 minutos)
npm run smoke             # 13 testes, cerca de 7 segundos: o sistema está de pé?
npm run report            # abre o relatório HTML do Playwright
npm run report:summary    # abre o resumo de uma página
```

A execução sobe o QuoteLab sozinha (o `webServer` do Playwright). Para explorar o app manualmente: `npm run app` e abra <http://localhost:4173>.

<details>
<summary>Windows com OneDrive ou Dropbox</summary>

Clientes de sincronização podem travar a pasta onde o Playwright grava capturas e traces durante os testes. Se aparecerem erros `ENOENT` em arquivos `.trace`, envie os artefatos para fora da pasta sincronizada:

```powershell
$env:PW_OUTPUT_DIR = "$env:TEMP\pw-showcase-out"
npm test
```
</details>

## As suítes de teste

415 testes em 13 suítes. Cada linha é uma verificação diferente. As categorias reaproveitam o mesmo roteiro de propósito, porque cada uma tem números diferentes (taxa, limite, adicional).

| Suíte | Testes | O que cobre |
|---|---:|---|
| `smoke` | 13 | Endpoints de saúde, rotas protegidas, login dos quatro perfis, logout. Se falhar, nada mais roda. |
| `access` | 41 | Login e tratamento de token, tokens forjados e expirados, matriz perfil × ação, o que cada perfil enxerga, adulteração do armazenamento do navegador, sessão em várias abas. |
| `api` | 50 | CRUD, validação de cada campo, corpos malformados e grandes demais, atribuição em massa, a máquina de estados de aprovação (todo status × toda ação), versão otimista, persistência e trilha de auditoria. |
| `workflow` | 39 | O ciclo de vida da cotação pela interface, validação do formulário, XSS nas observações, clique duplo, duas pessoas editando a mesma cotação, comportamento da tela de edição. |
| `lease-notebooks` · `lease-printers` · `lease-mobile` · `lease-automation` | 31 cada | Cálculo da locação (8 cenários por API e por tela), todos os prazos de 12 a 60 meses (amortização até zero), limites de quantidade, linha de aprovação, o adicional da categoria. |
| `sale-notebooks` · `sale-printers` · `sale-mobile` | 32 · 26 · 26 | Cálculo da venda (8 cenários por API e por tela), frete e imposto por estado (os seis estados), pagamento à vista, estendido e parcelado, linha de aprovação. |
| `reports` | 55 | A lista de cotações (paginação, filtros, busca, botão voltar) e os relatórios (totais por status, categoria e tipo, exportação CSV), sobre uma massa conhecida restaurada antes da suíte. |
| `reports-live` | 9 | Relatórios reagindo a mudanças reais (aprovar, cancelar, rejeitar, excluir, editar), e ordenação e paginação em dados estáveis. Roda sozinha, por último. |

## Como um cálculo é verificado

O teste nunca pergunta ao aplicativo qual é a resposta certa. Ele calcula a partir das regras de negócio escritas, em aritmética exata, e compara os **centavos inteiros** que a tela expõe *e* o **texto** que o usuário lê.

```ts
// framework/oracles/money.ts: parcela constante, aritmética racional exata
//   PMT = PV · b · Aⁿ / (D · (Aⁿ − Dⁿ))      com A = D + b, D = 10 000, b = taxa em pontos-base
export function pmt(presentValueCents: number, rateBps: number, months: number): number {
  const n = BigInt(months);
  const a = D + BigInt(rateBps);
  const aN = a ** n;
  const dN = D ** n;
  return Number(roundHalfUp(BigInt(presentValueCents) * BigInt(rateBps) * aN, D * (aN - dN)));
}
```

O próprio oráculo é validado por uma propriedade: pagar a parcela *n* vezes deve deixar o saldo do financiamento dentro do resíduo de arredondamento ([`amortizationResidue`](framework/oracles/money.ts)).

## Os testes realmente pegam defeitos?

`npm run mutation-check` injeta um defeito proposital por vez no aplicativo e roda a suíte que deveria percebê-lo. Último resultado: **10 de 10 pegos**.

| ID | Defeito injetado | Pego por | Testes que falharam |
|---|---|---|---:|
| M1 | Arredondamento: "para cima" vira "para baixo" | `lease-notebooks` | 5 |
| M2 | Linha de aprovação: "acima de 10%" vira "10% ou mais" | `lease-printers` | 2 |
| M3 | Um vendedor pode aprovar cotações | `access` | 3 |
| M4 | A quantidade máxima aceita uma unidade a mais | `lease-mobile` | 1 |
| M5 | A parcela compõe *n − 1* períodos | `sale-printers` | 10 |
| M6 | A lista mostra todo valor um centavo acima | `reports` | 1 |
| M7 | Versões antigas deixam de ser detectadas (perda de atualização) | `api` | 1 |
| M8 | Imposto sobre o valor líquido em vez de líquido + frete | `sale-notebooks` | 28 |
| M9 | O CSV perde a marca de ordem de bytes UTF-8 | `reports` | 1 |
| M10 | O adicional marcado é ignorado na prévia ao vivo | `lease-automation` | 6 |

A primeira versão do script apontou um "sobrevivente". A investigação mostrou um servidor antigo sendo reaproveitado, e não uma lacuna nos testes, então o script agora se recusa a reaproveitar servidores. Um teste também encontrou um defeito real no próprio app (o campo de busca perdia o foco durante a digitação), já corrigido neste repositório.

## Arquitetura

```text
app/                  QuoteLab: API em Express + TypeScript, front-end em JavaScript puro
framework/
  oracles/            regras de negócio escritas de forma independente + matemática de dinheiro exata
  api/                cliente de API tipado (não lança erro em status HTTP, facilita os testes negativos)
  pages/              Page Objects (papéis, rótulos e test ids, sem XPath)
  factory/            cenários, construtores de payload, a massa de dados do seed
  fixtures/           fixtures do Playwright: API admin, API por perfil, injeção de sessão, limpeza automática
  assertions/         "painel de resumo igual ao oráculo" em uma chamada
  suites/             os roteiros de locação e venda compartilhados pelas suítes de categoria
  reporter/           resumo de uma página da execução (pt/en)
suites/               uma pasta por projeto: os arquivos de teste
scripts/              verificação de mutação, capturas de tela, gerador do site
```

Mais detalhes em [`docs/architecture.md`](docs/architecture.md).

### Regras de negócio do QuoteLab

| Regra | Valor |
|---|---|
| Prazos de locação | 12, 24, 36, 48 ou 60 meses |
| Taxa mensal por categoria | Notebooks 1,90% · Impressoras 2,40% · Celulares 2,90% · Automação 2,20% |
| Adicional por categoria | Notebooks: garantia (4% do líquido, financiada) · Impressoras: kit de suprimentos (R$ 45,00/unidade/mês) · Celulares: seguro (1,2% do líquido ao mês) · Automação: instalação (R$ 180,00/unidade, financiada) |
| Desconto | 0% a 30%; **acima de 10%** exige aprovação |
| Aprovação por valor | Valor principal **acima de R$ 100.000,00** exige aprovação |
| Venda | líquido + frete (por estado) + imposto (por estado); à vista, estendido 30 dias (+1,5%) ou 2 a 3 parcelas (1,99% a.m.) |
| Perfis | Administrador, Vendedor (só as próprias cotações), Aprovador, Consulta (somente leitura) |

### Contas de demonstração

| Usuário | Senha | Perfil |
|---|---|---|
| `admin` | `Admin@123` | Administrador |
| `vendedor` | `Vend@123` | Vendedor |
| `aprovador` | `Aprov@123` | Aprovador |
| `consulta` | `Cons@123` | Consulta |

São credenciais de um ambiente de demonstração com dados fictícios, publicadas de propósito (também aparecem na tela de login).

## Telas

| | |
|---|---|
| ![Lista de cotações](docs/img/list.png) | ![Cotação aguardando aprovação](docs/img/detail-sale.png) |
| ![Relatórios](docs/img/reports.png) | ![Login](docs/img/login.png) |

## Todos os comandos

| Comando | O que faz |
|---|---|
| `npm test` | Todas as suítes, na ordem das dependências |
| `npm run smoke` · `access` · `api` · `workflow` | Uma suíte base (sem dependências) |
| `npm run lease` · `sale` | As quatro suítes de locação ou as três de venda |
| `npm run reports` | Restaura o seed, roda as suítes de relatório e depois as "ao vivo" |
| `npm run suite -- <projeto>` | Qualquer projeto isolado, por exemplo `npm run suite -- lease-mobile` |
| `npm run list` | Lista todos os testes sem executá-los |
| `npm run check` | Checagem de tipos, lint e descoberta dos testes |
| `npm run mutation-check` | Injeta defeitos propositais e confere que os testes os pegam |
| `npm run site` | Monta o site do GitHub Pages a partir da última execução |
| `npm run screenshots` | Regera as imagens em `docs/img` |

## Configuração

| Variável | Padrão | Significado |
|---|---|---|
| `BASE_URL` | sobe o próprio servidor em `http://localhost:4173` | Testa um QuoteLab já em execução (precisa rodar com `QL_TEST_MODE=1`) |
| `PORT` | `4173` | Porta do app que o Playwright inicia |
| `REPORT_LANG` | `pt` | Idioma de `reports/summary/index.html` (`pt` ou `en`; os dois arquivos são sempre gerados) |
| `PW_OUTPUT_DIR` | `reports/test-results` | Onde ficam capturas de tela e traces |
| `PW_FRESH_SERVER` | não definida | `1` nunca reaproveita um servidor em execução |

`QL_TEST_MODE=1` habilita três endpoints exclusivos de teste (restaurar dados, despejar o armazenamento, tokens de curta duração). Ele nunca é necessário para usar o app.

## Licença

[MIT](LICENSE) © Lucas Bonno
