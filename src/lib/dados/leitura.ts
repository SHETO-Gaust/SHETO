/**
 * Leitura dos cadastros que a geração de horário consome.
 *
 * Existe por causa de uma incompatibilidade concreta: `getTurmas`,
 * `getProfessores` e `getTurnos` são Server Actions e começam por
 * `requireEscolaEModulo`, que resolve a sessão a partir dos cookies da
 * requisição. O orquestrador da geração roda DEPOIS que a requisição terminou —
 * ali não há cookie nenhum, e o guard derrubaria o job com "Nao autenticado".
 *
 * A separação também é a mais segura: em vez de dar às actions um jeito de
 * pular o guard (que o cliente poderia acionar), a autorização fica onde
 * sempre esteve — na action — e o orquestrador, que já validou o acesso na hora
 * de criar o job, usa a leitura direta.
 */

import { createClient } from '@/lib/supabase/server';
import type {
    ComponenteCurricular,
    ProfessorComDados,
    SolicitacaoRestricao,
    TurmaComDados,
    Turno,
} from '@/lib/types';

export async function lerTurmas(escolaId: string): Promise<{ data?: TurmaComDados[]; error?: string }> {
    const supabase = await createClient();
    try {
        /*
         * `restricoes` da série é obrigatório no select abaixo.
         *
         * O motor lê `serie_restricoes` em seis pontos de `timetabling.ts` para
         * nunca pôr aula num slot que a série fechou, e o certificado de
         * inviabilidade desconta esses slots da capacidade da turma. Como toda a
         * leitura passa por `?.`, a coluna ausente não dá erro: vira `undefined`,
         * toda comparação com 'proibido' dá falso, e a grade sai violando as
         * restrições em silêncio. O tipo `TurmaComDados` sempre declarou o campo,
         * então o TypeScript também não acusava.
         */
        const { data: turmas, error: turmasError } = await supabase
            .from('turmas')
            .select(`
        *,
        serie:series(id, nome, turno_id, restricoes, componentes:series_componentes(*, componente:componentes_curriculares(id, nome, sigla))),
        professores:turmas_professores(*, professor:professores(id, nome_horario)),
        aulas_fixas:turmas_aulas_fixas(*)
      `)
            .eq('escola_id', escolaId)
            .order('nome', { referencedTable: 'series', ascending: true })
            .order('nome', { ascending: true });

        if (turmasError) throw turmasError;
        if (!turmas) return { data: [] };

        return { data: turmas as any[] };
    } catch (error: any) {
        console.error('Error fetching turmas:', error);
        return { error: 'Não foi possível buscar as turmas.' };
    }
}

export async function lerProfessores(escolaId: string): Promise<{ data?: ProfessorComDados[]; error?: string }> {
    const supabase = await createClient();

    try {
        const { data: professores, error: profError } = await supabase
            .from('professores')
            .select('*')
            .eq('escola_id', escolaId)
            .order('nome_completo', { ascending: true });

        if (profError) throw profError;
        if (!professores || professores.length === 0) return { data: [] };

        const professorIds = professores.map(p => p.id);

        const [
            { data: links },
            { data: componentes },
            { data: turnos },
            { data: solicitacoes }
        ] = await Promise.all([
            supabase.from('professores_componentes').select('professor_id, componente_id').in('professor_id', professorIds),
            supabase.from('componentes_curriculares').select('id, nome, sigla').eq('escola_id', escolaId),
            supabase.from('turnos').select('*').eq('escola_id', escolaId),
            supabase.from('solicitacoes_restricoes').select('*').in('professor_id', professorIds).neq('status', 'concluido').order('created_at', { ascending: false })
        ]);

        const componentesMap = new Map(componentes?.map(c => [c.id, c]) || []);
        const turnosMap = new Map(turnos?.map(t => [t.id, t]) || []);

        const professoresComDados: ProfessorComDados[] = professores.map(prof => {
            const professorComponenteIds = links?.filter(l => l.professor_id === prof.id).map(l => l.componente_id) || [];
            const professorComponentes = professorComponenteIds.map(id => componentesMap.get(id)).filter((c): c is Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'> => !!c);
            const professorTurnos = ((prof.turnos_ids || []) as string[]).map(id => turnosMap.get(id)).filter((t): t is Turno => !!t);
            const sol = solicitacoes?.find(s => s.professor_id === prof.id) || null;

            return {
                ...prof,
                componentes: professorComponentes,
                turnos: professorTurnos,
                solicitacao_pendente: sol as SolicitacaoRestricao
            };
        });

        return { data: professoresComDados };
    } catch (error: any) {
        console.error('Error fetching professors data:', error);
        return { error: 'Não foi possível buscar os dados dos professores.' };
    }
}

/**
 * Só lê. A criação dos turnos padrão de uma escola nova continua em
 * `getTurnos` — é uma escrita, e não tem lugar no caminho da geração.
 */
export async function lerTurnos(escolaId: string): Promise<{ data?: Turno[]; error?: string }> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .order('nome', { ascending: true });

    if (error) {
        console.error('Error fetching turnos:', error);
        return { error: 'Não foi possível buscar os turnos.' };
    }

    return { data: (data ?? []) as Turno[] };
}
