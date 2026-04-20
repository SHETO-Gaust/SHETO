'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EscolaCompleta = {
    id: number;
    regional: string | null;
    cidade: string | null;
    inep: string | null;
    escolar: string | null;
    classificacao: string | null;
    loc: string | null;
};

// ─── Schema de validação ──────────────────────────────────────────────────────

const escolaSchema = z.object({
    regional:      z.string().min(1, 'Regional é obrigatória.'),
    cidade:        z.string().min(1, 'Cidade é obrigatória.'),
    inep:          z.string().min(1, 'INEP é obrigatório.'),
    escolar:       z.string().min(1, 'Nome da escola é obrigatório.'),
    classificacao: z.string().optional().nullable(),
    loc:           z.string().optional().nullable(),
});

export type EscolaInput = z.infer<typeof escolaSchema>;

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function getEscolas(): Promise<EscolaCompleta[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('escolas')
        .select('*')
        .order('escolar', { ascending: true });

    if (error) {
        console.error('Erro ao buscar escolas:', error);
        return [];
    }
    return (data || []) as EscolaCompleta[];
}

export async function createEscola(input: EscolaInput) {
    const validated = escolaSchema.safeParse(input);
    if (!validated.success) {
        return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
    }

    const supabase = await createClient();
    const { error } = await supabase.from('escolas').insert([validated.data]);

    if (error) {
        console.error('Erro ao criar escola:', error);
        if (error.code === '23505') return { error: 'Já existe uma escola com este INEP.' };
        return { error: `Erro ao criar unidade: ${error.message}` };
    }

    revalidatePath('/unidades');
    return { success: true };
}

export async function updateEscola(id: number, input: EscolaInput) {
    const validated = escolaSchema.safeParse(input);
    if (!validated.success) {
        return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('escolas')
        .update(validated.data)
        .eq('id', id);

    if (error) {
        console.error('Erro ao atualizar escola:', error);
        return { error: `Erro ao atualizar unidade: ${error.message}` };
    }

    revalidatePath('/unidades');
    return { success: true };
}

export async function deleteEscola(id: number) {
    const supabase = await createClient();
    const { error } = await supabase.from('escolas').delete().eq('id', id);

    if (error) {
        console.error('Erro ao excluir escola:', error);
        if (error.code === '23503') {
            return { error: 'Esta unidade está vinculada a usuários e não pode ser excluída. Remova os vínculos primeiro.' };
        }
        return { error: `Erro ao excluir unidade: ${error.message}` };
    }

    revalidatePath('/unidades');
    return { success: true };
}
