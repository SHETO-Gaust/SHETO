'use server';

import {
  gerarTokenDeRedefinicao,
  redefinirSenhaComToken,
  VALIDADE_MINUTOS,
} from '@/lib/auth/password-reset';
import { SENHA_MINIMA } from '@/lib/auth/password-rules';
import { sendPasswordResetEmail } from '@/lib/mail';

/**
 * Resposta unica para qualquer desfecho da solicitacao.
 *
 * E-mail inexistente, usuario desativado e limite de tentativas atingido
 * devolvem exatamente esta mensagem - caso contrario o formulario viraria um
 * oraculo para descobrir quem tem conta no sistema.
 */
const RESPOSTA_GENERICA =
  'Se este e-mail estiver cadastrado no sistema, você receberá em instantes um link para criar uma nova senha. Verifique também a caixa de spam.';

export async function solicitarRedefinicaoSenha(
  formData: FormData
): Promise<{ message: string } | { error: string }> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email || !email.includes('@')) {
    return { error: 'Informe um e-mail válido.' };
  }

  try {
    const resultado = await gerarTokenDeRedefinicao(email);

    if (resultado) {
      const envio = await sendPasswordResetEmail({
        to: resultado.usuario.email,
        name: resultado.usuario.nome || resultado.usuario.email.split('@')[0],
        token: resultado.token,
        expiraEmMinutos: VALIDADE_MINUTOS,
      });

      // Falha de SMTP e' problema de infraestrutura, nao de privacidade:
      // aqui vale avisar, senao o usuario espera um e-mail que nunca vem.
      if (envio.error) return { error: envio.error };
    }

    return { message: RESPOSTA_GENERICA };
  } catch (err) {
    console.error('Erro ao solicitar redefinição de senha:', err);
    return { error: 'Não foi possível processar a solicitação. Tente novamente em instantes.' };
  }
}

export async function redefinirSenha(
  token: string,
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const senha = String(formData.get('password') ?? '');
  const confirmacao = String(formData.get('confirmPassword') ?? '');

  if (senha.length < SENHA_MINIMA) {
    return { error: `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` };
  }
  if (senha !== confirmacao) {
    return { error: 'As senhas não conferem.' };
  }

  const resultado = await redefinirSenhaComToken(token, senha);
  if ('error' in resultado) return { error: resultado.error };

  return { success: true };
}
