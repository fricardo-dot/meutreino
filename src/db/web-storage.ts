/**
 * Helper de persistência do banco no ambiente web (IndexedDB).
 *
 * O sql.js roda em memória — este módulo serializa os bytes do banco
 * (`db.export()`) e os restaura na inicialização. Assim o banco sobrevive
 * a reloads, fechamento de aba e uso offline.
 *
 * Store: banco de dados IndexedDB `meutreino`, object store `app`,
 *        chave `database`         → Uint8Array (os bytes do SQLite)
 *        chave `database_version` → number     (contador de escrita)
 *
 * O contador existe para detectar escrita concorrente entre ABAS. Cada aba
 * carrega o banco inteiro na memória; se duas abas salvarem, a última
 * gravaria o snapshot dela por cima do da outra e os treinos gravados na
 * primeira sumiriam sem aviso. Guardando o contador junto, quem for salvar
 * confere se a versão no disco ainda é aquela de que partiu — se não for,
 * recusa a escrita em vez de destruir o trabalho da outra aba.
 *
 * Os bytes continuam na MESMA chave e no MESMO formato de antes, e o contador
 * vive numa chave separada, de propósito: uma versão anterior do app continua
 * conseguindo ler o banco normalmente.
 *
 * Trata indisponibilidade (modo privado, quotas) com erro compreensível.
 */

const DB_NAME = 'meutreino';
const STORE = 'app';
const KEY = 'database';
const KEY_VERSION = 'database_version';

/** Snapshot lido do IndexedDB. */
export interface DbSnapshot {
  bytes: Uint8Array;
  /** Contador de escrita no momento da leitura. 0 = banco legado, sem contador. */
  version: number;
}

/**
 * Outra aba gravou depois que esta carregou o banco.
 *
 * Salvar por cima apagaria o que a outra aba registrou, então a escrita é
 * recusada e o app precisa recarregar para partir do estado mais novo.
 */
export class StaleDatabaseError extends Error {
  constructor() {
    super(
      'Os dados foram alterados em outra aba do app. Recarregue esta aba ' +
        'para continuar de onde a outra parou.',
    );
    this.name = 'StaleDatabaseError';
  }
}

/**
 * Verifica se o IndexedDB está disponível (falha em modo privado no Safari).
 */
function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

let connection: IDBDatabase | null = null;

/**
 * Abre (ou cria) o banco IndexedDB `meutreino`, reaproveitando a conexão.
 *
 * Devolve a CONEXÃO, não um object store: uma transação do IndexedDB fecha
 * sozinha assim que a fila de microtasks esvazia sem novas requisições, então
 * guardar um store obtido antes de um `await` dá TransactionInactiveError.
 * Cada operação abre a sua própria transação e a usa imediatamente.
 */
function openConnection(): Promise<IDBDatabase> {
  if (connection) return Promise.resolve(connection);

  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(
        new Error(
          'Armazenamento indisponível. Saia do modo privado do navegador ' +
            'para usar o app offline.',
        ),
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => {
      connection = request.result;
      // Se outra aba pedir um upgrade, soltamos a conexão para não travá-la.
      connection.onversionchange = () => {
        connection?.close();
        connection = null;
      };
      resolve(connection);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
  });
}

/** Lê uma chave dentro de uma transação já aberta. */
function pedir<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Carrega o snapshot salvo. Retorna null se não há (primeira execução).
 */
export async function loadSnapshot(): Promise<DbSnapshot | null> {
  const db = await openConnection();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);

  const [bruto, versao] = await Promise.all([
    pedir<unknown>(store.get(KEY)),
    pedir<unknown>(store.get(KEY_VERSION)),
  ]);

  if (!bruto) return null;

  const bytes =
    bruto instanceof Uint8Array
      ? bruto
      : new Uint8Array(bruto as ArrayBufferLike);

  return {
    bytes,
    // Banco gravado por uma versão antiga do app não tem contador.
    version: typeof versao === 'number' ? versao : 0,
  };
}

/**
 * Salva os bytes do banco, se ninguém tiver gravado no meio do caminho.
 *
 * @param baseVersion contador de que esta aba partiu (o da última leitura ou
 *                    da última gravação bem-sucedida).
 * @returns o novo contador, que o chamador deve passar como `baseVersion` da
 *          próxima vez.
 * @throws StaleDatabaseError se o contador no disco divergir — outra aba
 *         gravou, e sobrescrever apagaria o que ela registrou.
 */
export async function saveSnapshot(
  bytes: Uint8Array,
  baseVersion: number,
): Promise<number> {
  const db = await openConnection();

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let novaVersao = baseVersion + 1;
    let conflito = false;

    // Leitura e escrita na MESMA transação: entre conferir e gravar não há
    // brecha para outra aba entrar.
    const atual = store.get(KEY_VERSION);
    atual.onsuccess = () => {
      const noDisco = typeof atual.result === 'number' ? atual.result : 0;
      const existe = store.get(KEY);
      existe.onsuccess = () => {
        // Banco ainda não gravado: qualquer baseVersion serve (primeira vez).
        const primeiraGravacao = !existe.result;
        if (!primeiraGravacao && noDisco !== baseVersion) {
          conflito = true;
          tx.abort();
          return;
        }
        novaVersao = noDisco + 1;
        store.put(bytes, KEY);
        store.put(novaVersao, KEY_VERSION);
      };
      existe.onerror = () => reject(existe.error);
    };
    atual.onerror = () => reject(atual.error);

    // Só depois do COMMIT a gravação está de fato no disco. Resolver no
    // onsuccess do put mentiria: a transação ainda pode abortar no commit
    // (quota estourada, contexto encerrado) e os bytes antigos permaneceriam.
    tx.oncomplete = () => resolve(novaVersao);
    tx.onabort = () =>
      reject(
        conflito
          ? new StaleDatabaseError()
          : (tx.error ?? new Error('Falha ao gravar no IndexedDB.')),
      );
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar no IndexedDB.'));
  });
}
