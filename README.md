# MeuTreino 🏋️

App de registro de treinos de musculação. Roda como PWA no navegador e, do
mesmo código, como app nativo em Android e iOS.

**No ar:** https://fricardo-dot.github.io/meutreino/

Instale pelo próprio navegador ("Adicionar à tela de início") e ele funciona
offline, inclusive para registrar treino sem sinal.

## O que faz

**Calendário** — a semana em uma tela, com o treino de cada dia e o que já foi
feito. Programação semanal, troca de treino (que reprograma os dias seguintes)
e marcação retroativa de dias passados.

**Treino em andamento** — registro série a série com carga, repetições e RIR.
Cada nova série já vem pré-preenchida com os valores da anterior, então na
maioria das vezes é só confirmar. Cronômetro de descanso que continua correto
mesmo se o celular bloquear ou o app for para segundo plano.

**Recordes** — detectados automaticamente ao salvar a série, em quatro
categorias: maior carga, mais repetições, maior volume e 1RM estimado
(fórmula de Epley). O histórico de recordes é preservado, não sobrescrito.

**Exercícios e fichas** — catálogo próprio, com exercícios personalizados.
Exercício removido é arquivado, nunca apagado, para não quebrar o histórico.

**Perfil** — peso corporal com gráfico de evolução, estatísticas gerais
(sessões, séries, volume, tempo) e volume por grupo muscular.

**Relatório semanal** — exporta os treinos do período em Markdown, num formato
pensado para colar num chat de IA e pedir análise da progressão.

**Backup** — exporta e importa todos os dados num único arquivo JSON, para
trocar de aparelho ou reinstalar sem perder histórico.

## Onde ficam os dados

Tudo no seu dispositivo, num banco SQLite. Não há servidor, conta ou login:
nenhum dado sai do aparelho.

- **Nativo:** arquivo SQLite no diretório do app (expo-sqlite).
- **Web:** SQLite compilado para WebAssembly, persistido no IndexedDB do
  navegador (sql.js).

Como consequência, **não existe backup automático**. Limpar os dados do site
apaga o histórico da versão web. Use a exportação JSON do Perfil de tempos em
tempos — é o que permite restaurar.

## Rodando localmente

Desenvolvido no Node 24, que é a versão usada no CI. O projeto não declara
`engines`, mas é essa a combinação testada.

```bash
npm install
```

```bash
npm start
```

O Expo abre com as opções de plataforma. Para ir direto a uma delas:

```bash
npm run web
```

`npm run android` e `npm run ios` também estão disponíveis. Para o app nativo
sem build próprio, use o [Expo Go](https://expo.dev/go).

Não há testes nem lint configurados. A verificação antes de commitar é o
typecheck:

```bash
npx tsc --noEmit
```

## Organização

Roteamento por arquivos com [Expo Router](https://docs.expo.dev/router/introduction),
em `src/app`.

```
src/
  app/           telas e rotas
  components/    componentes reutilizáveis
  db/            client (nativo e web), schema e migrations
  repositories/  acesso ao banco, uma por tabela
  services/      regras de negócio (treino, recordes, calendário, backup)
  hooks/         estado compartilhado (banco, sessão ativa, cronômetro)
  theme/         cores, espaçamento, tipografia
```

O `CLAUDE.md` na raiz descreve os contratos que o código assume — imutabilidade
das migrations, a fronteira UTC/local nas datas, o subpath do GitHub Pages.
Vale a leitura antes de mexer em qualquer uma dessas áreas.

## Publicação

Todo push na `main` dispara o workflow `Deploy Web (PWA)`, que exporta a versão
web e publica no GitHub Pages. Não há staging: o que entra na `main` vai ao ar.

## Licença

MIT — ver [LICENSE](LICENSE).
