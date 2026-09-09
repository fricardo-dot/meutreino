# MeuTreino

Registro de treinos. O mesmo código roda nativo (Expo) e como PWA web.

## Banco de dados

- **Migrations são imutáveis.** Nunca edite uma entrada já publicada de
  `src/db/migrations.ts`, nem uma constante SQL de `src/db/schema.ts` que já
  seja usada por uma delas. Correção entra como versão nova no fim do array.
  `TARGET_DB_VERSION` é derivado da última entrada — não escreva o número à mão.
- **Migrations são aditivas.** O banco vive no dispositivo do usuário e não tem
  backup automático. Nenhuma migration pode destruir treino já registrado.
  (A v5 fez reset destrutivo: exceção da fase de testes, não um padrão.)
- **Dois clients, uma interface.** `client.ts` (expo-sqlite, nativo) e
  `client.web.ts` (sql.js/WASM + IndexedDB) implementam `AppDatabase`; o Metro
  resolve `.web.ts` primeiro. Método novo tem que entrar nos dois. O web é o
  delicado: fila serializando as escritas feitas pela conexão, contador de
  versão do snapshot para detectar gravação de outra aba, e persistência só
  depois do COMMIT.
- **Dentro de `withTransactionAsync`, todo SQL passa pelo `tx`** que o
  callback recebe. Escrever pela conexão (`db.runAsync`) lá dentro entra na
  fila e fica esperando a própria transação terminar — trava. O compilador não
  pega isso: `db` continua no escopo. Transação aninhada não existe; `tx` não
  expõe `withTransactionAsync` de propósito.
- `execAsync` com PRAGMA ou SELECT exige `{ persist: false }` — sem isso o
  client web reexporta o banco inteiro pro IndexedDB à toa.
- **DDL e PRAGMA vão por `execAsync`, nunca por `runAsync`.** O client web só
  persiste um `runAsync` que tenha alterado linha, e `getRowsModified()`
  devolve 0 para DDL — um `CREATE TABLE` por `runAsync` mudaria só a memória
  e sumiria no reload.
- **Repositórios só persistem.** Recebem `AppDatabase`, `DbExecutor` ou `tx`
  como primeiro argumento. Regra de negócio e atomicidade ficam em
  `src/services/`: `workoutEngine.saveSet` grava série + PR num único
  `withTransactionAsync`. A exceção é `sessions.repository`, cujas duas
  operações de criação de sessão são atômicas por natureza e abrem a própria
  transação.
- **Invariantes moram no schema.** Índices únicos parciais garantem no máximo
  uma sessão `em_andamento`, um PR vigente por exercício+tipo e um nome ativo
  por exercício. Não replique essas checagens em JS.
- **Exercício não se apaga, se arquiva** (`is_active = 0`) — o histórico
  referencia o exercício.
- **`personal_records` bloqueia exclusões.** `session_set_id` e `session_id`
  usam `ON DELETE RESTRICT`: apagar série ou sessão exige apagar os recordes
  ANTES, na mesma transação. Já quebrou o botão "apagar todas as séries".
- **Import de backup nunca usa `INSERT OR REPLACE`.** REPLACE apaga a linha
  conflitante antes de inserir e dispara as FKs — abortava a importação por
  RESTRICT e apagava filhos por CASCADE. Use `ON CONFLICT DO UPDATE`.
- `ensureSeedData` roda em toda inicialização e precisa continuar idempotente.

## Datas e timezone

O SQLite grava `CURRENT_TIMESTAMP` em **UTC**; as telas raciocinam em data
**local**. Essa fronteira já causou três bugs.

- Nunca compare `started_at` cru com data local e nunca use
  `toISOString().slice(0, 10)` para data de negócio: treino às 21h30 no Brasil
  (UTC-3) cai no dia seguinte em UTC. Converta com `utcToLocalISODate`.
- Para exibir `YYYY-MM-DD` como `Date`, ancore no meio-dia
  (`new Date(iso + 'T12:00:00')`), nunca à meia-noite.
- A semana começa na **segunda** (`calendarService.getWeekStart`).

## Web / PWA

- **A app é servida num subpath** (`/meutreino/` no GitHub Pages; raiz em dev).
  Todo caminho de asset em runtime precisa ser **relativo** (`./sql-wasm.wasm`,
  `./sw.js`). Caminho absoluto funciona em dev e quebra em produção — o erro só
  aparece depois do deploy. Dentro de `public/sw.js` isso vale em dobro: derive
  tudo de `BASE` (calculado a partir de `self.location`), nunca escreva `/…`.
- `BASE_URL` só existe no build do CI; `app.config.js` o repassa para
  `experiments.baseUrl`.
- **A config estática vive em `app.json`.** O `app.config.js` recebe esse
  objeto e só acrescenta o que é dinâmico. Não duplique campo nos dois.
- **`Alert.alert` não funciona em PWA no Safari iOS.** Use `<ConfirmDialog />`.
- `public/` vai como está para `dist/`. Ao mudar asset cacheado, suba o
  `CACHE_VERSION` em `public/sw.js` — senão o usuário fica na versão velha.
- Rota interna aberta direto pela URL só funciona porque o CI copia o
  `index.html` para `dist/404.html` — o GitHub Pages não tem fallback de SPA.
  Se o build sair do workflow atual, esse passo tem que ir junto.
- Push na `main` publica sozinho (Actions → Pages). Não existe staging.

## Convenções

- Import interno sempre por `@/`.
- **Cor sempre vem de `@/theme`**, nunca literal hex ou `rgba()`. Cor nova
  entra em `src/theme/colors.ts` primeiro e só então é usada. Não há uma única
  exceção hoje em `src/` — se aparecer um literal, é regressão.
- **Espaçamento e raio usam `spacing`/`radius` quando existe token exato.**
  As escalas são deliberadamente curtas — `spacing` tem 4/8/12/16/20/24/32/
  40/48, `radius` tem 10/12/14/16/20 — e não devem crescer para acomodar
  valor solto: a escala existe justamente para conter o drift. Onde a tela
  precisa de um valor fora da escala (10, 14, 2, 6 e alguns one-offs), o
  número fica literal mesmo, marcando a exceção. Nunca encaixe um valor no
  token mais próximo "para padronizar" — isso muda o layout.
- `fontSize` usa `typography.size` pela mesma regra do espaçamento: token
  quando bate exato, literal quando não bate.
- **`lineHeight` no React Native é em PIXELS, não multiplicador.** Os
  `typography.variants` já guardam o valor em px, com a proporção no
  comentário ao lado. Nunca escreva a proporção crua (1.2, 1.4) ali: o texto
  fica com entrelinha de 1,2 px. O arquivo nasceu assim e passou despercebido
  porque nenhum componente vivo usava as variantes.
- Contagem de tempo é baseada em **timestamp de término**, nunca em contador em
  memória — o app volta do background com o valor certo (`useRestTimer`).
- Comentários em português, explicando o **porquê**.

## Verificação

Não há teste automatizado nem lint. O portão é o typecheck, rodado antes de
commitar e também pelo CI, que não publica se ele falhar:

```bash
npx tsc --noEmit
```

`strict: true` está ligado e o projeto está sem erros — mantenha assim.
