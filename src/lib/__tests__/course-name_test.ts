import { describe, it, expect } from 'vitest';
import { CURSO_SEM_NOME, nomeDoCurso } from '../course-name.js';

describe('nomeDoCurso', () => {
    it('titulo digitado passa igual', () => {
        expect(nomeDoCurso('HORTA CASEIRA')).toBe('HORTA CASEIRA');
    });

    it('vazio, so espaco, null ou ausente vira o nome generico', () => {
        // Sem isto o curso apareceria como uma linha em branco nas listas.
        for (const v of ['', '   ', null, undefined]) {
            expect(nomeDoCurso(v), String(v)).toBe(CURSO_SEM_NOME);
        }
    });

    it('tira o espaco das pontas', () => {
        expect(nomeDoCurso('  PODA  ')).toBe('PODA');
    });

    it('o generico e em caixa alta, como os outros titulos', () => {
        // O formulario do painel grava titulo em maiuscula; um "Curso sem nome"
        // em caixa baixa destoaria dos vizinhos na lista.
        expect(CURSO_SEM_NOME).toBe(CURSO_SEM_NOME.toUpperCase());
    });
});
