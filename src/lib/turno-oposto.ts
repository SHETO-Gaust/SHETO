import type { Turno } from '@/lib/types';

/**
 * Turno do contraturno — onde caem as aulas não presenciais.
 *
 * É a mesma regra de `resolverTurnoNP` em `src/lib/timetabling.ts`, repetida de
 * propósito: aquele arquivo é compilado à parte pelo `tsconfig.worker.json`, cujo
 * `include` lista exatamente três arquivos e não resolve o alias `@/`. O motor só
 * funciona sem bundler porque importa **exclusivamente tipos** — um import de
 * valor daqui quebraria o worker em runtime, não no build.
 *
 * Se a regra mudar, mude nos dois lugares.
 */
export function resolverTurnoOposto(turno: Turno, todosTurnos: Turno[]): Turno | null {
    const nome = turno.nome.toLowerCase();
    const outros = todosTurnos.filter(t => t.id !== turno.id);

    const oposto = outros.find(t => {
        const n = t.nome.toLowerCase();
        if (nome.includes('matutino') || nome.includes('manhã'))
            return n.includes('vespertino') || n.includes('tarde');
        if (nome.includes('vespertino') || nome.includes('tarde'))
            return n.includes('matutino') || n.includes('manhã');
        if (nome.includes('noturno') || nome.includes('noite'))
            return n.includes('matutino') || n.includes('manhã') || n.includes('vespertino');
        return false;
    });

    return oposto ?? null;
}
