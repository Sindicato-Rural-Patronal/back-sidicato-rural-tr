// Rotas que ainda conferem a permissão do jeito antigo, dentro do controller
// (decisão 001, SR-023). O hook deixa passar só estas sem `config.auth`. A
// lista só encolhe: cada router migrado tira as suas, e o teste de inventário
// reprova rota que já declarou e continua aqui. Some no fim da migração.
export const ROUTE_AUTH_PENDING: readonly string[] = [
];
