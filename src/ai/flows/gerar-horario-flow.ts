'use server';
/**
 * @fileOverview Fluxo de IA para geração automática de horários escolares.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { createClient } from '@/lib/supabase/server';

const GerarHorarioInputSchema = z.object({
  escolaId: z.string(),
  turnoId: z.string(),
});

const HorarioGeradoOutputSchema = z.object({
  aulas: z.array(z.object({
    turma_id: z.string(),
    componente_id: z.string(),
    professor_id: z.string().nullable(),
    dia_semana: z.string(),
    aula_index: z.number(),
    tipo: z.enum(['presencial', 'nao_presencial']),
  })),
});

export async function gerarHorarioIA(escolaId: string, turnoId: string) {
  return gerarHorarioFlow({ escolaId, turnoId });
}

const prompt = ai.definePrompt({
  name: 'gerarHorarioPrompt',
  input: { schema: z.any() },
  output: { schema: HorarioGeradoOutputSchema },
  prompt: `Você é um assistente especializado em gestão escolar e organização de horários (Timetabling).
Sua tarefa é gerar uma grade horária válida para o turno selecionado, respeitando estritamente as restrições fornecidas.

DADOS DO TURNO:
- Nome: {{turno.nome}}
- Dias da Semana Ativos: {{turno.dias_semana}}
- Aulas por Dia: {{turno.aulas_por_dia}}

TURMAS A SEREM ALOCADAS:
{{#each turmas}}
- Turma: {{this.nome}} (Série: {{this.serie.nome}})
  Disciplinas e Cargas:
  {{#each this.serie.componentes}}
    * {{this.componente.nome}} (ID: {{this.componente_id}}): {{this.aulas_presenciais}} presenciais, {{this.aulas_nao_presenciais}} não presenciais.
  {{/each}}
  Professores Alocados:
  {{#each this.professores}}
    * Professor ID {{this.professor_id}} para Disciplina ID {{this.componente_id}}.
  {{/each}}
{{/each}}

RESTRIÇÕES DOS PROFESSORES:
{{#each professores}}
- Prof ID {{this.id}} ({{this.nome_horario}}):
  * Restrições: {{json this.restricoes}}
{{/each}}

REGRAS DE OURO:
1. NUNCA coloque o mesmo professor em duas turmas diferentes no mesmo horário.
2. Respeite as restrições de "indisponivel" dos professores.
3. Se um professor estiver em "planejamento", você PODE alocar aula, mas tente evitar se possível.
4. Distribua todas as aulas presenciais dentro da grade do turno (dias ativos e aulas por dia).
5. As aulas "nao_presencial" NÃO ocupam slots na grade principal do turno, mas devem ser incluídas no JSON de saída com dia e aula_index fictícios ou zero, apenas para registro.
6. Tente não deixar janelas (aulas vagas no meio do dia) para as turmas.

Retorne um JSON contendo o array "aulas".`,
});

const gerarHorarioFlow = ai.defineFlow(
  {
    name: 'gerarHorarioFlow',
    inputSchema: GerarHorarioInputSchema,
    outputSchema: HorarioGeradoOutputSchema,
  },
  async (input) => {
    const supabase = await createClient();

    // 1. Buscar Turno
    const { data: turno } = await supabase.from('turnos').select('*').eq('id', input.turnoId).single();
    
    // 2. Buscar Turmas do Turno com componentes da série e professores alocados
    const { data: turmas } = await supabase
      .from('turmas')
      .select(`
        id, nome, 
        serie:series(id, nome, turno_id, componentes:series_componentes(*, componente:componentes_curriculares(id, nome))),
        professores:turmas_professores(*)
      `)
      .eq('escola_id', input.escolaId)
      .filter('serie.turno_id', 'eq', input.turnoId);

    // 3. Buscar Professores e suas restrições
    const { data: professores } = await supabase
        .from('professores')
        .select('id, nome_horario, restricoes')
        .eq('escola_id', input.escolaId);

    const { output } = await prompt({
      turno,
      turmas: turmas || [],
      professores: professores || [],
    });

    return output!;
  }
);
