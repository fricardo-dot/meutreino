/**
 * Helper de persistência do banco no ambiente web (IndexedDB).
 *
 * O sql.js roda em memória — este módvel serializa os bytes do banco
 * (`db.export()`) e os restaura na inicialização. Assim o banco sobrevive
 * a reloads, fechamento de aba e uso offline.
 *
 * Store: banco de dados IndexedDB `meutreino`, object store `app`,
 *        key `database` → Uint8Array.
 *
 * Trata indisponibilidade (modo privado, quotas) com erro compreensível.
 */

const DB_NAME = 'meutreino';
const STORE = 'app';
const KEY = 'database';

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

/**
 * Abre (ou cria) o banco IndexedDB `meutreino`.
 */
function openStore(): Promise<IDBObjectStore> {
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
      const db = request.result;
      const tx = db.transaction(STORE, 'readwrite');
      resolve(tx.objectStore(STORE));
    };
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB'));
  });
}

/**
 * Carrega os bytes do banco salvos. Retorna null se não há (primeira execução).
 */
export async function loadDbBytes(): Promise<Uint8Array | null> {
  const store = await openStore();
  return new Promise<Uint8Array | null>((resolve, reject) => {
    const request = store.get(KEY);
    request.onsuccess = () => {
      const result = request.result;
      if (!result) {
        resolve(null);
        return;
      }
      // Garante Uint8Array (pode vir como ArrayBufferView em alguns browsers).
      resolve(result instanceof Uint8Array ? result : new Uint8Array(result));
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva os bytes do banco. Substitui qualquer versão anterior.
 */
export async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  const store = await openStore();
  return new Promise<void>((resolve, reject) => {
    const request = store.put(bytes, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
