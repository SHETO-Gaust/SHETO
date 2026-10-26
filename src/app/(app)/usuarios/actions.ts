'use server';

import { createClient, createAdminClient } from '@/lib/db/server';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'crypto';
import type { Profile, Escola } from '@/lib/types';
import { z } from 'zod';
import { sendWelcomeEmail } from '@/lib/mail';
import { requireAdmin } from '@/lib/auth/guards';
import {
    LIMITE_LINHAS_LOTE,
    resolverLinhaDeUsuario,
    type LinhaLoteBruta,
    type LinhaLoteResolvida,
} from '@/lib/usuarios-lote';

type DbAdmin = Awaited<ReturnType<typeof createAdminClient>>;
type EscolaResumo = Pick<Escola, 'id' | 'escolar' | 'inep' | 'regional' | 'cidade'>;

export async function getUsers(): Promise<Profile[]> {
    await requireAdmin();
    const dbAdmin = await createAdminClient();

    // Usamos o Admin Client para ver todos os perfis ignorando RLS de usuário comum
    const { data, error } = await dbAdmin
        .from('profiles')
        .select('*, escolas(id, escolar, regional)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }

    return (data || []) as Profile[];
}

async function buscarEscola(dbAdmin: DbAdmin, ue: string | null | undefined): Promise<EscolaResumo | null> {
    if (!ue || ue === 'null') return null;
    const { data } = await dbAdmin
        .from('escolas')
        .select('id, escolar, inep, regional, cidade')
        .eq('id', ue)
        .maybeSingle();
    return (data as EscolaResumo) ?? null;
}

/** Com escola, a regional é a dela; sem escola, vale a informada. */
function regionalDoUsuario(escola: EscolaResumo | null, regionalInformada: string | null | undefined) {
    if (escola?.regional) return escola.regional;
    const r = (regionalInformada ?? '').trim();
    return r && r !== 'null' ? r : null;
}

export async function updateUserPermissions(
    userId: string,
    modules: string[],
    role: 'admin' | 'user',
    ue: string | null | undefined,
    escolas_favoritas?: string[],
    regional?: string | null,
) {
    await requireAdmin();
    const dbAdmin = await createAdminClient();

    const ueFinal = role === 'admin' ? null : (ue === 'null' ? null : ue ?? null);
    const escola = await buscarEscola(dbAdmin, ueFinal);

    const { error } = await dbAdmin
        .from('profiles')
        .update({
            modules,
            role,
            ue: ueFinal,
            regional: regionalDoUsuario(escola, regional),
            escolas_favoritas: role === 'admin' ? (escolas_favoritas || []) : [],
        })
        .eq('id', userId);

    if (error) {
        console.error('Error updating user permissions:', error);
        return { error: 'Ocorreu um erro ao atualizar as permissões do usuário.' };
    }

    revalidatePath('/usuarios');
    return { success: true };
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
    const admin = await requireAdmin();
    if (admin.id === userId && currentStatus) {
        return { error: 'Você não pode suspender a sua própria conta.' };
    }
    const dbAdmin = await createAdminClient();
    const { error } = await dbAdmin
        .from('profiles')
        .update({ active: !currentStatus })
        .eq('id', userId);

    if (error) {
        console.error('Error toggling status:', error);
        return { error: 'Erro ao alterar status do usuário.' };
    }

    revalidatePath('/usuarios');
    return { success: true };
}

export async function deleteUser(userId: string) {
    const admin = await requireAdmin();
    if (admin.id === userId) {
        return { error: 'Você não pode excluir a sua própria conta.' };
    }

    const dbAdmin = await createAdminClient();
    const { error } = await dbAdmin.auth.admin.deleteUser(userId);
    if (error) {
        console.error('Error deleting user:', error);
        return { error: `Erro ao excluir usuário: ${error.message}` };
    }

    revalidatePath('/usuarios');
    return { success: true };
}

const createUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: "Email inválido." }),
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
  role: z.enum(['admin', 'user']),
  modules: z.array(z.string()),
  ue: z.string().nullable().optional(),
  regional: z.string().nullable().optional(),
  escolas_favoritas: z.array(z.string()).optional(),
});

type NovaConta = {
    email: string;
    password: string;
    name?: string;
    role: 'admin' | 'user';
    modules: string[];
    escola: EscolaResumo | null;
    regional: string | null;
    escolas_favoritas?: string[];
};

/** Cria conta + perfil. Compartilhado pelo cadastro individual e pelo lote. */
async function criarConta(dbAdmin: DbAdmin, conta: NovaConta): Promise<{ error?: string }> {
    const { data: authData, error: authError } = await dbAdmin.auth.admin.createUser({
        email: conta.email,
        password: conta.password,
        email_confirm: true,
        user_metadata: { name: conta.name }
    });

    if (authError) {
        console.error('Error creating auth user:', authError);
        return { error: authError.message.includes('já existe') || authError.message.includes('already registered')
            ? 'Um usuário com este email já existe.'
            : `Erro no Auth: ${authError.message}` };
    }
    if (!authData.user) {
        return { error: 'Não foi possível criar o usuário no Auth.' };
    }

    const isAdmin = conta.role === 'admin';
    const { error: profileError } = await dbAdmin
        .from('profiles')
        .upsert({
            id: authData.user.id,
            name: conta.name,
            role: conta.role,
            modules: conta.modules,
            email: conta.email,
            ue: isAdmin ? null : (conta.escola ? String(conta.escola.id) : null),
            regional: conta.regional,
            escolas_favoritas: isAdmin ? (conta.escolas_favoritas || []) : [],
            active: true,
        }, { onConflict: 'id' });

    if (profileError) {
        // Sem perfil o usuário loga e não vê nada: desfaz a conta em vez de deixá-la órfã.
        console.error('Error explicitly creating profile:', profileError);
        await dbAdmin.auth.admin.deleteUser(authData.user.id);
        return { error: 'Falha ao gravar o perfil do usuário.' };
    }
    return {};
}

async function enviarBoasVindas(conta: NovaConta) {
    return sendWelcomeEmail({
        to: conta.email,
        name: conta.name || 'Usuário(a)',
        password: conta.password,
        schoolName: conta.escola?.escolar?.trim() ?? null,
        regional: conta.regional,
        city: conta.escola?.cidade ?? null,
        inep: conta.escola?.inep ?? null,
    });
}

export async function createUser(formData: z.infer<typeof createUserSchema>) {
    await requireAdmin();
    const dbAdmin = await createAdminClient();

    const validatedFields = createUserSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }

    const { email, password, name, role, modules, ue, regional, escolas_favoritas } = validatedFields.data;
    const escola = role === 'admin' ? null : await buscarEscola(dbAdmin, ue);

    const conta: NovaConta = {
        email, password, name, role, modules, escola,
        regional: regionalDoUsuario(escola, regional),
        escolas_favoritas,
    };

    const criado = await criarConta(dbAdmin, conta);
    if (criado.error) return { error: criado.error };

    try {
        await enviarBoasVindas(conta);
    } catch (mailErr) {
        console.warn('Erro ao enviar email:', mailErr);
    }

    revalidatePath('/usuarios');
    return { success: true };
}

// ─── Cadastro em lote ────────────────────────────────────────────────────────

async function resolverLote(dbAdmin: DbAdmin, linhas: LinhaLoteBruta[]): Promise<LinhaLoteResolvida[]> {
    const [{ data: escolas }, { data: perfis }] = await Promise.all([
        dbAdmin.from('escolas').select('id, escolar, inep, regional, cidade'),
        dbAdmin.from('profiles').select('email'),
    ]);

    const emailsJaUsados = new Set<string>(
        ((perfis || []) as { email: string }[]).map(p => String(p.email ?? '').trim().toLowerCase()),
    );

    return linhas.map(bruta => {
        const resolvida = resolverLinhaDeUsuario(bruta, (escolas || []) as EscolaResumo[], emailsJaUsados);
        if (resolvida.email) emailsJaUsados.add(resolvida.email);
        return resolvida;
    });
}

/** Prévia: valida a planilha sem gravar nada. */
export async function validarLoteUsuarios(linhas: LinhaLoteBruta[]) {
    await requireAdmin();
    if (!Array.isArray(linhas) || linhas.length === 0) {
        return { error: 'A planilha não tem linhas de usuário.' };
    }
    if (linhas.length > LIMITE_LINHAS_LOTE) {
        return { error: `A planilha tem ${linhas.length} linhas; o limite por envio é ${LIMITE_LINHAS_LOTE}.` };
    }
    const dbAdmin = await createAdminClient();
    return { linhas: await resolverLote(dbAdmin, linhas) };
}

/** Senha legível, sem caracteres que se confundem (0/O, 1/l/I). */
function gerarSenha(tamanho = 10) {
    const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let senha = '';
    for (let i = 0; i < tamanho; i++) senha += alfabeto[randomInt(alfabeto.length)];
    return senha;
}

export type ResultadoLinhaLote = {
    linha: number;
    email: string;
    nome: string;
    status: 'criado' | 'erro' | 'ignorado';
    mensagem?: string;
    /** Só preenchida quando a senha foi gerada pelo sistema, para o admin repassar. */
    senhaGerada?: string;
    emailEnviado?: boolean;
};

/**
 * Importa o lote. Revalida tudo no servidor: linhas com erro são ignoradas,
 * as demais são criadas uma a uma (um erro não derruba o resto).
 */
export async function importarLoteUsuarios(linhas: LinhaLoteBruta[], enviarEmail: boolean) {
    await requireAdmin();
    if (!Array.isArray(linhas) || linhas.length === 0) {
        return { error: 'A planilha não tem linhas de usuário.' };
    }
    if (linhas.length > LIMITE_LINHAS_LOTE) {
        return { error: `A planilha tem ${linhas.length} linhas; o limite por envio é ${LIMITE_LINHAS_LOTE}.` };
    }

    const dbAdmin = await createAdminClient();
    const resolvidas = await resolverLote(dbAdmin, linhas);
    const { data: escolas } = await dbAdmin.from('escolas').select('id, escolar, inep, regional, cidade');
    const escolaPorId = new Map(((escolas || []) as EscolaResumo[]).map(e => [String(e.id), e]));

    const resultados: ResultadoLinhaLote[] = [];
    const paraEnviar: { conta: NovaConta; resultado: ResultadoLinhaLote }[] = [];

    for (const r of resolvidas) {
        const base = { linha: r.linha, email: r.email, nome: r.nome };
        if (r.erros.length > 0) {
            resultados.push({ ...base, status: 'ignorado', mensagem: r.erros.join(' ') });
            continue;
        }

        const senhaGerada = r.senha ? undefined : gerarSenha();
        const conta: NovaConta = {
            email: r.email,
            password: r.senha || senhaGerada!,
            name: r.nome || undefined,
            role: r.role,
            modules: r.modules,
            escola: r.ue ? escolaPorId.get(r.ue) ?? null : null,
            regional: r.regional,
        };

        const criado = await criarConta(dbAdmin, conta);
        if (criado.error) {
            resultados.push({ ...base, status: 'erro', mensagem: criado.error });
            continue;
        }
        const resultado: ResultadoLinhaLote = { ...base, status: 'criado', senhaGerada, emailEnviado: false };
        resultados.push(resultado);
        if (enviarEmail) paraEnviar.push({ conta, resultado });
    }

    // SMTP é o gargalo: alguns envios em paralelo, sem abrir centenas de conexões.
    const PARALELO = 5;
    for (let i = 0; i < paraEnviar.length; i += PARALELO) {
        await Promise.all(paraEnviar.slice(i, i + PARALELO).map(async ({ conta, resultado }) => {
            try {
                const envio = await enviarBoasVindas(conta);
                resultado.emailEnviado = !envio?.error;
            } catch (mailErr) {
                console.warn('Erro ao enviar email do lote:', mailErr);
            }
        }));
    }

    revalidatePath('/usuarios');
    return { resultados };
}
