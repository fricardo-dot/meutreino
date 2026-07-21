/**
 * Erro de domínio — representa uma violação de regra de negócio.
 *
 * Diferente de erros de banco (constraint, conexão), erros de domínio são
 * esperados e devem ser tratados pela UI com mensagens amigáveis.
 *
 * O `code` é estável para que a UI possa reagir programaticamente
 * (ex.: EMPTY_WORKOUT → mostra "adicione exercícios antes de iniciar").
 */
export type DomainErrorCode =
  | 'EMPTY_WORKOUT'
  | 'ACTIVE_SESSION_EXISTS'
  | 'WORKOUT_NOT_FOUND'
  | 'EXERCISE_NAME_CONFLICT'
  | 'SESSION_NOT_IN_PROGRESS';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
