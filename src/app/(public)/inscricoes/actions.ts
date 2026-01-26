'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { validateCPF } from '@/lib/utils';

const formSchema = z.object({
  formacao_id: z.string(),
  nome_completo: z.string().min(3, 'Nome completo é obrigatório.'),
  cpf: z.string().length(14, 'CPF inválido.').refine(validateCPF, 'CPF inválido.'),
  email: z.string().email('Email inválido.'),
  dados: z.record(z.any()),
});


export async function createInscricao(formData: z.infer<typeof formSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = formSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
        error: 'Dados inválidos. Verifique o formulário.',
        errors: validatedFields.error.flatten().fieldErrors,
        };
    }

    const { formacao_id, cpf, email, nome_completo, dados } = validatedFields.data;

    // Check for duplicate CPF for the same formacao
    const { data: existingInscricao, error: existingError } = await supabase
        .from('inscricoes')
        .select('id')
        .eq('formacao_id', formacao_id)
        .eq('cpf', cpf)
        .single();

    if (existingError && existingError.code !== 'PGRST116') { // PGRST116: 'exact-one' violation (no rows)
        console.error('Error checking for existing inscricao:', existingError);
        return { error: 'Ocorreu um erro ao verificar sua inscrição. Tente novamente.' };
    }

    if (existingInscricao) {
        return { error: 'Este CPF já está inscrito nesta formação.' };
    }

    const { data, error } = await supabase
        .from('inscricoes')
        .insert([
        {
            formacao_id,
            cpf,
            nome_completo,
            email,
            dados,
        },
        ])
        .select();

    if (error) {
        console.error('Error creating inscricao:', error);
        return { error: 'Ocorreu um erro ao realizar a inscrição. Tente novamente.' };
    }

    revalidatePath(`/inscricoes/${formacao_id}`);
    return { data };
}


// --- ERGON API INTEGRATION ---

let token: string | null = null;
let tokenExpiresAt: number | null = null;

async function getAuthToken() {
    const now = Date.now();
    // Check if token exists and is not expired (assuming 1-hour expiry for safety)
    if (token && tokenExpiresAt && now < tokenExpiresAt) {
        return token;
    }
    
    if (!process.env.ergon_base || !process.env.ergon_auth || !process.env.ergon_lg || !process.env.ergon_psw) {
        throw new Error('Variáveis de ambiente do SisErgon não configuradas.');
    }

    const authUrl = `${process.env.ergon_base}${process.env.ergon_auth}`;
    
    const loginResponse = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            login: process.env.ergon_lg,
            password: process.env.ergon_psw,
        }),
    });

    if (!loginResponse.ok) {
        console.error('Ergon API Auth failed:', loginResponse.status, loginResponse.statusText);
        throw new Error('Falha na autenticação com o serviço do SisErgon.');
    }
    
    const body = await loginResponse.json();
    
    if(body.token) {
        token = body.token;
        tokenExpiresAt = now + 3600 * 1000; // Cache for 1 hour
        return token;
    }
    
    console.error('Ergon API Auth: Token not found in response body.');
    throw new Error('Token de autenticação não encontrado na resposta do SisErgon.');
}

export async function fetchErgonDataByCpf(cpf: string) {
    if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
        return { error: 'CPF inválido.' };
    }

    try {
        const authToken = await getAuthToken();
        const cpfUrl = `${process.env.ergon_base}${process.env.ergon_cpf}/${cpf.replace(/\D/g, '')}`;
        
        const response = await fetch(cpfUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if(response.status === 404) {
                 return { data: null }; // Not found is not an error, just no data
            }
            console.error('Ergon API CPF fetch failed:', response.status, response.statusText);
            throw new Error(`Falha ao consultar o CPF no SisErgon. Status: ${response.status}`);
        }

        const data = await response.json();
        const personData = Array.isArray(data) ? data[0] : data;

        if (!personData) {
            return { data: null };
        }

        return { data: personData };

    } catch (e: any) {
        console.error('Ergon action error:', e);
        return { error: e.message || 'Ocorreu um erro ao consultar os dados.' };
    }
}
