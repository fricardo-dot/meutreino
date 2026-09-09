/**
 * Extrai de um erro a frase que faz sentido mostrar ao usuário.
 *
 * Os erros que chegam à UI hoje já têm mensagem escrita para ser lida por
 * gente — `StaleDatabaseError` diz para recarregar a aba, `DomainError` diz o
 * que falta preencher, e a recusa de backup diz que o arquivo é de uma versão
 * mais nova. Repassar `error.message` é o certo nesses casos.
 *
 * O fallback existe para o que não é `Error` (throw de string, rejeição sem
 * motivo): melhor uma frase genérica que um "[object Object]" na tela.
 */
export function mensagemDeErro(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Algo deu errado. Tente de novo; se continuar, recarregue o app.';
}
