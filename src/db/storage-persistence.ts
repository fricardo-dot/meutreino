import { Platform } from 'react-native';

/**
 * Durabilidade do armazenamento do navegador.
 *
 * O banco inteiro deste app vive no IndexedDB do navegador, e por padrão esse
 * armazenamento é "melhor esforço": quando o aparelho fica sem espaço, o
 * navegador descarta dados de sites para liberar — e descarta a origem
 * INTEIRA, não um pedaço. Aqui isso significaria perder o histórico de treino
 * sem aviso e sem como recuperar, porque não há servidor nenhum por trás.
 *
 * `navigator.storage.persist()` troca esse regime por "persistente", em que o
 * navegador se compromete a só apagar por ação explícita do usuário. Não é
 * pedido em toda inicialização à toa: `persisted()` responde antes, e só quem
 * ainda não tem é que pede.
 *
 * Quem decide é o navegador, não o app. No Chrome, um PWA instalado na tela de
 * início normalmente recebe sem perguntar nada. O Firefox pergunta. O Safari
 * pode nem expor a API — daí `null` em vez de `false`: "não dá para saber" é
 * diferente de "foi negado", e a tela precisa dizer a verdade nos dois casos.
 *
 * No nativo isto não se aplica: lá o banco é um arquivo do app, que só some se
 * o app for desinstalado.
 */
export interface EstadoDoArmazenamento {
  /** `null` quando o navegador não expõe a API (ou não é web). */
  persistente: boolean | null;
  usadoBytes: number | null;
  cotaBytes: number | null;
}

/** Só existe no web, e nem em todo navegador. */
function api(): StorageManager | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined') return null;
  return navigator.storage ?? null;
}

/**
 * Pede ao navegador que não descarte os dados deste app.
 *
 * Nunca lança e nunca bloqueia: é chamada sem `await` na inicialização do
 * banco, porque falhar aqui não pode impedir o app de abrir — sem persistência
 * ele continua funcionando, só com uma garantia a menos.
 *
 * @returns o estado DEPOIS do pedido, ou `null` se não deu para saber.
 */
export async function pedirPersistencia(): Promise<boolean | null> {
  const storage = api();
  if (!storage?.persist || !storage.persisted) return null;

  try {
    // Já concedido? Pedir de novo não muda nada e, no Firefox, mostraria uma
    // permissão a cada abertura.
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    // Alguns navegadores lançam em modo privado. Não é motivo para quebrar.
    return null;
  }
}

/** Lê o estado atual sem pedir nada. */
export async function lerEstadoDoArmazenamento(): Promise<EstadoDoArmazenamento> {
  const storage = api();
  const vazio: EstadoDoArmazenamento = {
    persistente: null,
    usadoBytes: null,
    cotaBytes: null,
  };
  if (!storage) return vazio;

  try {
    const persistente = storage.persisted ? await storage.persisted() : null;
    const estimativa = storage.estimate ? await storage.estimate() : null;
    return {
      persistente,
      usadoBytes: estimativa?.usage ?? null,
      cotaBytes: estimativa?.quota ?? null,
    };
  } catch {
    return vazio;
  }
}
