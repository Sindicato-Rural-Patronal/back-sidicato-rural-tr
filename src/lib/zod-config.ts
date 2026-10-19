import { z } from 'zod';

// Mensagens padrão do Zod em português. As mensagens escritas à mão nos
// schemas continuam valendo; isto cobre o que o Zod gera sozinho ("Invalid
// input: expected string, received undefined" chegava em inglês ao usuário).
// Importado por index.ts e pelo app dos E2E.
z.config(z.locales.ptBR());
z.config({
    customError: issue => {
        // Campo que não veio: o texto do locale cita o tipo e "undefined".
        if (issue.code === 'invalid_type' && issue.input === undefined) {
            const campo = issue.path?.map(String).join('.');
            return campo ? `Informe o campo ${campo}.` : 'Dados obrigatórios não informados.';
        }
        return undefined;
    },
});
