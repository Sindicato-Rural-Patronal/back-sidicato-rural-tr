import { upperNoAccents } from './text.js';

// Salas do sindicato: lista fixa escolhida no painel (não é mais texto livre).
export const ROOM_NAMES = [
    'AUDITORIO',
    'COZINHA',
    'SALA DE VIDEO CONFERENCIA',
    'SALA 1',
    'SALA 2',
    'SALA APL',
] as const;

export type RoomName = (typeof ROOM_NAMES)[number];

/** Maiúsculas, sem acento e sem espaço sobrando — o formato dos nomes da lista. */
export function normalizeRoomName(name: string): string {
    return upperNoAccents(name);
}

export function isRoomName(name: string): name is RoomName {
    return (ROOM_NAMES as readonly string[]).includes(name);
}
