import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROOM_NAMES } from '../room-names.js';
import { MEMBER_TYPES } from '../member-types.js';
import { UNIMED_DEPENDENCY_DEGREES, UNIMED_MOVEMENT_TYPES } from '../unimed-options.js';

// Listas fixas que existem DUAS VEZES: aqui (o backend recusa valor fora delas)
// e no painel (rotulo + opcoes do select). Nada liga uma a outra — se
// divergirem, o sintoma na tela e um 400 ou 409 sem explicacao nenhuma.
//
// O teste mora aqui, e nao no repositorio do painel, porque ler arquivo e
// nativo no Node: la o tsconfig do app nao tem os tipos do Node e o build
// compila os testes junto, entao um `readFileSync` quebraria o `npm run build`.
//
// Duas camadas:
// 1. Os valores esperados escritos abaixo. Mexer numa lista sem mexer no teste
//    quebra a suite — divergir passa a ser um ato deliberado.
// 2. Quando o repositorio do painel esta ao lado (o caso de quem trabalha nos
//    dois), o teste LE o arquivo de la e compara de verdade.

const ESPERADO: Record<string, string[]> = {
    ROOM_NAMES: ['AUDITORIO', 'COZINHA', 'SALA DE VIDEO CONFERENCIA', 'SALA 1', 'SALA 2', 'SALA APL'],
    MEMBER_TYPES: [
        'ALUNO', 'PRODUTOR RURAL', 'TRABALHADOR RURAL ASSALARIADO', 'TRABALHADOR RURAL AUTONOMO',
    ],
    UNIMED_MOVEMENT_TYPES: [
        'INCLUSAO DE TITULAR', 'INCLUSAO DE DEPENDENTE', 'EXCLUSAO DE TITULAR',
        'EXCLUSAO DE DEPENDENTE', 'ALTERACAO CADASTRAL', 'REATIVACAO',
    ],
    UNIMED_DEPENDENCY_DEGREES: ['TITULAR', 'CONJUGE', 'FILHO(A)', 'ENTEADO(A)', 'PAI/MAE', 'OUTRO'],
};

const DAQUI: Record<string, readonly string[]> = {
    ROOM_NAMES,
    MEMBER_TYPES,
    UNIMED_MOVEMENT_TYPES,
    UNIMED_DEPENDENCY_DEGREES,
};

/** Onde a mesma lista mora no painel, relativo a raiz DAQUELE repositorio. */
const NO_PAINEL: Record<string, string> = {
    ROOM_NAMES: 'src/lib/room-names.ts',
    MEMBER_TYPES: 'src/lib/member-types.ts',
    UNIMED_MOVEMENT_TYPES: 'src/lib/unimed-options.ts',
    UNIMED_DEPENDENCY_DEGREES: 'src/lib/unimed-options.ts',
};

const painel = (arquivo: string) =>
    new URL('../../../../sindicato-rural-tr-client-side/' + arquivo, import.meta.url);

const temPainel = existsSync(painel('package.json'));

/**
 * Os valores da constante no arquivo do painel. As listas de la aparecem de
 * duas formas — textos soltos ('SALA 1') e objetos ({ value: 'ALUNO', label:
 * 'Aluno' }) —, e em ambas o VALOR e o primeiro texto entre aspas de cada item.
 */
function listaDoPainel(arquivo: string, constante: string): string[] {
    const code = readFileSync(painel(arquivo), 'utf8');
    const inicio = code.indexOf('export const ' + constante);
    if (inicio < 0) throw new Error(`${constante} nao encontrada em ${arquivo}`);
    // `= [` e nao `[`: a declaracao do painel pode ter anotacao de tipo antes
    // do valor (`: UnimedOption[] = [`), e o colchete dela vinha primeiro.
    const abre = code.indexOf('= [', inicio) + 2;
    const fecha = code.indexOf(']', abre);
    return code
        .slice(abre, fecha)
        .split('\n')
        .map(linha => /'([^']+)'/.exec(linha)?.[1])
        .filter((v): v is string => !!v);
}

describe('listas fixas compartilhadas com o painel', () => {
    it.each(Object.keys(ESPERADO))('%s bate com os valores esperados', nome => {
        expect([...DAQUI[nome]]).toEqual(ESPERADO[nome]);
    });

    it.each(Object.keys(NO_PAINEL))('%s bate com a lista do painel', nome => {
        if (!temPainel) {
            // Sem o repositorio do painel ao lado nao da para comparar; os
            // valores esperados acima ja foram conferidos pelo teste anterior.
            expect(DAQUI[nome].length).toBeGreaterThan(0);
            return;
        }
        expect(listaDoPainel(NO_PAINEL[nome], nome), NO_PAINEL[nome]).toEqual([...DAQUI[nome]]);
    });
});
