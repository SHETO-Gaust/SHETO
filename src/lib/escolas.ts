'use client';
import { createClient } from './supabase/client';

export async function getRegionais(): Promise<string[]> {
    const supabase = createClient();
    const { data, error } = await supabase.from('escolas').select('regional');

    if (error) {
        console.error('Error fetching regionais:', error);
        return [];
    }
    
    if (!data) {
        return [];
    }
    
    // Get unique regionais, filter out null/undefined/empty, and sort them
    const regionais = [...new Set(data.map(item => item.regional))]
        .filter((r): r is string => r != null && r !== '')
        .sort((a, b) => a.localeCompare(b));
    
    return regionais;
}

export async function getEscolasPorRegional(regional: string): Promise<string[]> {
    if (!regional) return [];

    const supabase = createClient();
    const { data, error } = await supabase
        .from('escolas')
        .select('escolar')
        .eq('regional', regional)
        .order('escolar', { ascending: true });

    if (error) {
        console.error(`Error fetching escolas for regional ${regional}:`, error);
        return [];
    }

    if (!data) {
        return [];
    }

    return data.map(item => item.escolar)
        .filter((e): e is string => e != null && e !== '');
}
