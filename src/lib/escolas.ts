'use client';

import { createClient } from './supabase/client';

/**
 * Busca todas as regionais únicas da tabela escolas
 */
export async function getRegionais(): Promise<string[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('escolas')
    .select('regional');

  if (error) {
    console.error('[getRegionais] Supabase error:', error);
    return [];
  }

  if (!data || data.length === 0) {
    console.warn('[getRegionais] Nenhuma regional encontrada');
    return [];
  }

  const regionais = Array.from(
    new Set(
      data
        .map(item => item.regional)
        .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return regionais;
}

/**
 * Busca escolas filtradas por regional
 */
export async function getEscolasPorRegional(regional: string): Promise<string[]> {
  if (!regional || regional.trim() === '') {
    return [];
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from('escolas')
    .select('escolar')
    .eq('regional', regional)
    .order('escolar', { ascending: true });

  if (error) {
    console.error(
      `[getEscolasPorRegional] Erro ao buscar escolas da regional "${regional}":`,
      error
    );
    return [];
  }

  if (!data || data.length === 0) {
    console.warn(
      `[getEscolasPorRegional] Nenhuma escola encontrada para a regional "${regional}"`
    );
    return [];
  }

  const escolas = data
    .map(item => item.escolar)
    .filter((e): e is string => typeof e === 'string' && e.trim() !== '');

  // Remove duplicates to avoid React key errors
  return Array.from(new Set(escolas));
}
