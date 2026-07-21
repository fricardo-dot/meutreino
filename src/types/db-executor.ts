import type { AppDatabase } from './app-database';

/**
 * Executor compartilhado — o subconjunto de métodos da conexão que os
 * repositórios precisam para executar SQL.
 *
 * Por que existe:
 *  - Permite que vários repositórios operem DENTRO da mesma transação.
 *    O WorkoutEngine abre uma transação com `db.withTransactionAsync()` e
 *    passa o próprio `db` (que implementa DbExecutor) para cada repositório.
 *    Assim, salvar série + calcular PR + registrar PR são atômicos.
 *  - Mantém os repositórios desacoplados da conexão completa.
 */
export type DbExecutor = Pick<
  AppDatabase,
  'runAsync' | 'getFirstAsync' | 'getAllAsync'
>;
