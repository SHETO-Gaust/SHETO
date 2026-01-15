'use client';
import { createClient } from './supabase/client';

export async function getRegionais(): Promise<string[]> {
    const supabase = createClient();
    const { data, error } = await supabase.from('escolas').select('regional');

    if (error) {
        console.error('Error fetching regionais:', error);
        return [];
    }
    
    // Get unique regionais and sort them
    const regionais = [...new Set(data.map(item => item.regional))].sort((a, b) => a.localeCompare(b));
    
    return regionais;
}

export async function getEscolasPorRegional(regional: string): Promise<string[]> {
    if (!regional) return [];

    const supabase = createClient();
    const { data, error } = await supabase
        .from('escolas')
        .select('escola')
        .eq('regional', regional)
        .order('escola', { ascending: true });

    if (error) {
        console.error(`Error fetching escolas for regional ${regional}:`, error);
        return [];
    }

    return data.map(item => item.escola);
}
