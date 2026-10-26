import nodemailer from 'nodemailer';

/**
 * Cria o transporte apenas se as credenciais existirem no .env
 */
function getTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);

  if (!user || !pass || !host) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function getFrom() {
  return process.env.SMTP_FROM || '"SHETO" <no-reply@seduc.to.gov.br>';
}

/** Dominio oficial da aplicacao - usado quando nenhuma variavel esta definida. */
const BASE_URL_PADRAO = 'https://sheto.seduc.to.gov.br';

/**
 * URL base usada nos links dos e-mails.
 *
 * Prefere APP_BASE_URL porque e' lida em tempo de execucao: basta editar o
 * .env e reiniciar. NEXT_PUBLIC_SITE_URL continua aceita por compatibilidade,
 * mas o Next substitui variaveis NEXT_PUBLIC_* no momento do build - mudar o
 * valor dela exige `npm run build` de novo.
 */
function getBaseUrl() {
  const url = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || BASE_URL_PADRAO;
  return url.replace(/\/+$/, '');
}

export type WelcomeEmailData = {
  to: string;
  name: string;
  password: string;
  /** Nulo quando o usuario nao tem escola vinculada (admin, equipe de regional). */
  schoolName: string | null;
  regional: string | null;
  city: string | null;
  inep: string | null;
};

/** Nome, escola e regional chegam de formulario e de planilha: nada entra cru no HTML. */
function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  const transporter = getTransporter();

  if (!transporter) {
    console.error('ERRO DE CONFIGURAÇÃO: SMTP_HOST, SMTP_USER ou SMTP_PASS não definidos no .env');
    return { error: 'Serviço de e-mail não configurado. Verifique as credenciais no .env' };
  }

  const loginUrl = `${getBaseUrl()}/login`;
  const e = (v: string | null | undefined, padrao = 'Não informado') => escaparHtml(v || padrao);

  const vinculo = data.schoolName
    ? `
          <p>Seu acesso está vinculado à seguinte unidade escolar:</p>
          <div class="school-info">
            <p style="margin: 0;"><strong>Escola:</strong> ${e(data.schoolName)}</p>
            <p style="margin: 0;"><strong>Regional:</strong> ${e(data.regional, 'Não informada')}</p>
            <p style="margin: 0;"><strong>Município:</strong> ${e(data.city)}</p>
            <p style="margin: 0;"><strong>INEP:</strong> ${e(data.inep, 'N/A')}</p>
          </div>`
    : data.regional
      ? `
          <div class="school-info">
            <p style="margin: 0;"><strong>Regional:</strong> ${e(data.regional)}</p>
          </div>`
      : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 30px; }
        .content { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .school-info { border-left: 4px solid #1e3a8a; padding-left: 15px; margin: 20px 0; }
        .credentials { background-color: #fff; padding: 15px; border: 1px dashed #cbd5e1; border-radius: 4px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #1e3a8a; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        strong { color: #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="color: #1e3a8a; margin: 0;">Bem-vindo(a) ao SHETO</h1>
          <p style="margin-top: 5px;">Sistema de Horário Escolar - SEDUC Tocantins</p>
        </div>

        <div class="content">
          <p>Olá, <strong>${e(data.name, 'Usuário(a)')}</strong>!</p>
          <p>Seja bem-vindo(a) ao <strong>SHETO</strong>, o Sistema de Horário Escolar da Secretaria da Educação do Tocantins. Sua conta já está ativa.</p>
          <p>No sistema você cadastra turnos, componentes curriculares, professores e turmas, gera o quadro de horários da unidade e faz os ajustes até chegar à versão final.</p>
          ${vinculo}

          <p>Utilize as credenciais abaixo para seu primeiro acesso:</p>

          <div class="credentials">
            <p style="margin: 0;"><strong>Login (E-mail):</strong> ${e(data.to)}</p>
            <p style="margin: 0;"><strong>Senha Temporária:</strong> ${e(data.password)}</p>
          </div>

          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Acessar o Sistema</a>
          </div>
        </div>

        <p style="font-size: 14px; color: #475569;">
          <em>Por segurança, altere sua senha logo após o primeiro acesso, clicando no seu perfil.</em>
        </p>

        <div class="footer">
          <p>Secretaria da Educação do Estado do Tocantins</p>
          <p style="margin: 4px 0 0;">Não responda a este e-mail.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: data.to,
      subject: 'Bem-vindo(a) ao SHETO - Sistema de Horário Escolar',
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return { error: 'Falha no envio do e-mail de boas-vindas. Verifique a configuração SMTP.' };
  }
}

// ─── E-mail de redefinição de senha ──────────────────────────────────────────

export type PasswordResetEmailData = {
  to: string;
  name: string;
  token: string;
  expiraEmMinutos: number;
};

export async function sendPasswordResetEmail(data: PasswordResetEmailData) {
  const transporter = getTransporter();

  if (!transporter) {
    console.error('ERRO: Variáveis SMTP não configuradas no .env');
    return { error: 'Serviço de e-mail não configurado. Informe ao administrador do sistema.' };
  }

  const resetUrl = `${getBaseUrl()}/redefinir-senha/${data.token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 25px; }
        .content { background-color: #f8fafc; padding: 25px; border-radius: 8px; }
        .button { display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff !important; text-decoration: none; border-radius: 999px; font-weight: bold; margin: 20px 0; }
        .warning { font-size: 13px; color: #475569; margin-top: 20px; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; }
        .link-fallback { font-size: 11px; color: #94a3b8; word-break: break-all; margin-top: 16px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="color: #1e3a8a; margin: 0;">Redefinição de Senha</h2>
          <p style="color: #64748b;">Sistema de Horário Escolar (SHE)</p>
        </div>

        <div class="content">
          <p>Olá, <strong>${data.name}</strong>!</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no SHE.</p>

          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Criar Nova Senha</a>
          </div>

          <div class="warning">
            <strong>Atenção:</strong> este link é pessoal, vale por
            <strong>${data.expiraEmMinutos} minutos</strong> e pode ser usado
            <strong>uma única vez</strong>.
            <br/><br/>
            Se você não solicitou a redefinição, ignore este e-mail — sua senha
            atual permanece válida e nenhuma ação é necessária.
          </div>

          <p class="link-fallback">
            Se o botão não funcionar, copie e cole este endereço no navegador:<br/>
            ${resetUrl}
          </p>
        </div>

        <div class="footer">
          <p>Secretaria da Educação do Estado do Tocantins © ${new Date().getFullYear()}</p>
          <p style="margin: 4px 0 0;">Não responda a este e-mail.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: data.to,
      subject: 'Redefinição de Senha - Sistema de Horário Escolar (SHE)',
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail de redefinição:', error);
    return { error: 'Falha no envio do e-mail. Verifique a configuração SMTP do servidor.' };
  }
}

export async function sendRestrictionRequestEmail(data: { to: string, name: string, schoolName: string, token: string }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.error('ERRO: Variáveis SMTP não configuradas no .env');
    return { error: 'Serviço de e-mail não configurado. Informe ao administrador do sistema.' };
  }

  const requestUrl = `${getBaseUrl()}/restricoes/${data.token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .header { text-align: center; margin-bottom: 25px; }
        .content { background-color: #f8fafc; padding: 25px; border-radius: 8px; }
        .button { display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
        .warning { font-size: 13px; color: #475569; margin-top: 20px; padding: 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="color: #1e3a8a; margin: 0;">Preferências de Disponibilidade</h2>
          <p style="color: #64748b;">Sistema de Horário Escolar (SHE)</p>
        </div>
                <div class="content">
          <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
          <p>A coordenação pedagógica da unidade <strong>${data.schoolName}</strong> solicita que você informe suas preferências de horário para a montagem da grade escolar.</p>
          
          <p>Clique no botão abaixo para acessar seu formulário individual:</p>

          <div style="text-align: center;">
            <a href="${requestUrl}" class="button">Informar Minhas Preferências</a>
          </div>

          <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; font-weight: bold; font-size: 13px;">O formulário contém 4 seções:</p>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.8;">
              <li><strong>Livre Docência</strong> — 2 meios períodos livres (obrigatório)</li>
              <li><strong>Dias Preferidos</strong> — dias em que prefere concentrar suas aulas (opcional)</li>
              <li><strong>Indisponibilidades</strong> — horários com outros vínculos ou restrições</li>
              <li><strong>Justificativa</strong> — observações que auxiliem a coordenação</li>
            </ol>
          </div>

          <div class="warning">
            <strong>Atenção:</strong> As informações preenchidas são tratadas como <strong>preferências</strong>. 
            A coordenação fará o possível para atendê-las, mas a definição final da grade depende das necessidades logísticas e pedagógicas da unidade escolar.
          </div>
          
          <p style="font-size: 12px; color: #94a3b8; margin-top: 20px; text-align: center;">
            Este link é pessoal, expira em 48 horas e pode ser preenchido apenas uma vez.
          </p>
        </div>

        <div class="footer">
          <p>Secretaria da Educação do Estado do Tocantins - Todos os direitos reservados © 2026</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: data.to,
      subject: `Preferências de Horário - ${data.schoolName}`,
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail de restrição:', error);
    return { error: 'Falha no envio do e-mail. Verifique a configuração SMTP do servidor.' };
  }
}

// ─── E-mail de confirmação de preferências ───────────────────────────────────

export type ConfirmacaoPreferenciasData = {
  to: string;
  name: string;
  schoolName: string;
  diasPreferidos: string[];
  livreDocencia: { dia: string; periodo: string }[];
  semPreferencia: boolean;
  restricoes?: Record<string, Record<string, Record<number, string>>>;
  turnoNomes?: Record<string, string>;
  turnoHorarios?: Record<string, { inicio: string; fim: string }[]>;
};

const DIAS_LABELS: Record<string, string> = {
  segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira',
  quinta: 'Quinta-feira', sexta: 'Sexta-feira', sabado: 'Sábado',
};
const PERIODO_LABELS: Record<string, string> = {
  matutino: 'Manhã', vespertino: 'Tarde', noturno: 'Noite',
};

export async function sendPreferenciasConfirmacaoEmail(data: ConfirmacaoPreferenciasData) {
  const transporter = getTransporter();
  if (!transporter) return { error: 'Serviço de e-mail não configurado.' };

  const livreHtml = data.semPreferencia
    ? '<em style="color:#64748b">Sem preferência — sistema escolherá automaticamente.</em>'
    : data.livreDocencia.length > 0
      ? data.livreDocencia.map(ld =>
          `<span style="display:inline-block;margin:2px 4px;padding:3px 12px;background:#dbeafe;color:#1d4ed8;border-radius:6px;font-size:12px;font-weight:700">
            ${PERIODO_LABELS[ld.periodo] || ld.periodo} — ${DIAS_LABELS[ld.dia] || ld.dia}
          </span>`).join('')
      : '<em style="color:#64748b">Nenhum período definido.</em>';

  const diasHtml = data.diasPreferidos.length > 0
    ? data.diasPreferidos.map(d =>
        `<span style="display:inline-block;margin:2px 4px;padding:3px 12px;background:#6d28d9;color:#fff;border-radius:6px;font-size:12px;font-weight:700">
          ${DIAS_LABELS[d] || d}
        </span>`).join('')
    : '<em style="color:#64748b">Nenhum dia específico — qualquer dia disponível será usado.</em>';

  // ── Restrições por turno ──────────────────────────────────────────────────
  const DIA_SHORT: Record<string, string> = {
    segunda: 'Seg', terca: 'Ter', quarta: 'Qua',
    quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb',
  };

  let restricoesHtml = '';
  if (data.restricoes && Object.keys(data.restricoes).length > 0) {
    const turnoNomes = data.turnoNomes || {};
    const turnoHorarios = data.turnoHorarios || {};

    const turnoBlocks = Object.entries(data.restricoes).map(([turnoId, diasObj]) => {
      const turnoNome = turnoNomes[turnoId] || 'Turno';
      const horarios = turnoHorarios[turnoId] || [];

      // Agrupar slots por status
      const grupos: Record<string, { dia: string; aulas: string[] }[]> = {
        indisponivel: [], planejamento: [],
      };

      Object.entries(diasObj).forEach(([dia, aulasObj]) => {
        const indispAulas: string[] = [];
        const planAulas: string[] = [];
        Object.entries(aulasObj).forEach(([idx, status]) => {
          const n = parseInt(idx);
          const hora = horarios[n]?.inicio ? ` (${horarios[n].inicio})` : '';
          const label = `${n + 1}\u00aa${hora}`;
          if (status === 'indisponivel') indispAulas.push(label);
          if (status === 'planejamento') planAulas.push(label);
        });
        if (indispAulas.length) grupos.indisponivel.push({ dia: DIA_SHORT[dia] || dia, aulas: indispAulas });
        if (planAulas.length) grupos.planejamento.push({ dia: DIA_SHORT[dia] || dia, aulas: planAulas });
      });

      const hasAny = grupos.indisponivel.length > 0 || grupos.planejamento.length > 0;
      if (!hasAny) return '';

      const renderGrupo = (items: { dia: string; aulas: string[] }[], cor: string, label: string) =>
        items.length === 0 ? '' :
        `<div style="margin-bottom:8px">
          <span style="font-size:10px;font-weight:900;color:${cor};text-transform:uppercase;letter-spacing:.06em">${label}</span><br/>
          ${items.map(g =>
            `<span style="display:inline-block;margin:2px 3px"><strong style="color:#334155">${g.dia}:</strong> ${g.aulas.join(', ')}</span>`
          ).join(' &nbsp;')}
        </div>`;

      return `<div style="margin-bottom:12px;padding:10px 14px;background:#f8fafc;border-radius:6px;border-left:3px solid #cbd5e1">
        <div style="font-size:10px;font-weight:900;text-transform:uppercase;color:#475569;margin-bottom:6px">${turnoNome}</div>
        ${renderGrupo(grupos.indisponivel, '#dc2626', '🚫 Indisponível')}
        ${renderGrupo(grupos.planejamento, '#2563eb', '📋 Planejamento')}
      </div>`;
    }).filter(Boolean).join('');

    if (turnoBlocks) {
      restricoesHtml = `<div class="section" style="border-left:4px solid #64748b;background:#f8fafc">
        <div class="label" style="color:#475569">🗓️ Restrições de Horário Registradas</div>
        ${turnoBlocks}
      </div>`;
    }
  }

  const html = `<!DOCTYPE html><html><head><style>
    body{font-family:'PT Sans',sans-serif;line-height:1.6;color:#333}
    .container{max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px}
    .section{padding:14px 18px;border-radius:8px;margin:14px 0}
    .label{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
    .note{font-size:12px;color:#64748b;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-top:20px}
    .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;border-top:1px solid #f1f5f9;padding-top:16px}
  </style></head><body>
  <div class="container">
    <div style="text-align:center;margin-bottom:24px">
      <h2 style="color:#1e3a8a;margin:0">Confirmação de Preferências</h2>
      <p style="color:#64748b;margin:4px 0 0">Sistema de Horário Escolar (SHE) — ${data.schoolName}</p>
    </div>
    <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
    <p>Suas preferências de horário foram <strong>revisadas e oficializadas</strong> pela coordenação pedagógica. Veja abaixo como ficou o seu perfil:</p>
    <div class="section" style="border-left:4px solid #6d28d9;background:#faf5ff">
      <div class="label" style="color:#6d28d9">📅 Dias Preferidos para Concentração de Aulas</div>
      <div>${diasHtml}</div>
    </div>
    <div class="section" style="border-left:4px solid #2563eb;background:#eff6ff">
      <div class="label" style="color:#2563eb">⭐ Livre Docência Confirmada</div>
      <div>${livreHtml}</div>
    </div>
    ${restricoesHtml}
    <div class="note"><strong>Atenção:</strong> Estas preferências serão respeitadas na medida do possível durante a montagem da grade escolar. A definição final depende das necessidades pedagógicas e logísticas da unidade escolar.</div>
    <div class="footer"><p>Secretaria da Educação do Estado do Tocantins © ${new Date().getFullYear()}</p></div>
  </div>
  </body></html>`;

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: data.to,
      subject: `Confirmação de Preferências — ${data.schoolName}`,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error('Erro ao enviar confirmação:', err);
    return { error: 'Falha no envio do e-mail de confirmação.' };
  }
}

// ─── E-mail de Comunicado em Massa ───────────────────────────────────

export type MassCommunicationData = {
  bcc: string[];
  subject: string;
  htmlContent: string;
};

export async function sendMassCommunicationEmail(data: MassCommunicationData) {
  const transporter = getTransporter();

  if (!transporter) {
    return { error: 'Serviço de e-mail não configurado.' };
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f5; margin: 0; padding: 20px 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; border-top: 4px solid #1e3a8a; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
        .content { margin-bottom: 30px; font-size: 15px; color: #1e293b; }
        .content p { margin-top: 0; margin-bottom: 15px; }
        .content strong { color: #0f172a; font-weight: bold; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px; }
        .disclaimer { font-size: 11px; color: #64748b; text-align: center; background-color: #f8fafc; padding: 10px; border-radius: 4px; margin-top: 20px; }
        ul, ol { margin-top: 0; margin-bottom: 15px; padding-left: 20px; color: #1e293b; }
        li { margin-bottom: 5px; }
        h1, h2, h3 { color: #0f172a; margin-top: 0; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="color: #1e3a8a; margin: 0; font-size: 20px;">Comunicado Institucional</h2>
          <p style="color: #64748b; margin: 5px 0 0; font-size: 13px;">Sistema de Horário Escolar (SHE) - SEDUC TO</p>
        </div>
        
        <div class="content">
          ${data.htmlContent}
        </div>

        <div class="disclaimer">
          Você está recebendo este e-mail pois é usuário cadastrado no Sistema de Horário Escolar.
        </div>

        <div class="footer">
          <p style="margin: 0;">Secretaria da Educação do Estado do Tocantins © ${new Date().getFullYear()}</p>
          <p style="margin: 4px 0 0;">Não responda a este e-mail.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const CHUNK_SIZE = 100;
    const bccChunks = [];
    for (let i = 0; i < data.bcc.length; i += CHUNK_SIZE) {
        bccChunks.push(data.bcc.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of bccChunks) {
        await transporter.sendMail({
          from: getFrom(),
          to: process.env.SMTP_USER!,
          bcc: chunk,
          subject: data.subject,
          html: html,
        });
    }

    return { success: true };
  } catch (err) {
    console.error('Erro ao enviar comunicado em massa:', err);
    return { error: 'Falha no disparo em lote. Verifique o servidor SMTP.' };
  }
}

// ─── Chamados de suporte ─────────────────────────────────────────────────────

/** Caixa da equipe do SHETO que recebe os chamados. */
function getEmailSuporte() {
  return process.env.SUPORTE_EMAIL || 'sheto@seduc.to.gov.br';
}

const PRIORIDADE_ROTULO: Record<string, { texto: string; cor: string }> = {
  alta: { texto: 'ALTA', cor: '#dc2626' },
  media: { texto: 'MÉDIA', cor: '#d97706' },
  baixa: { texto: 'BAIXA', cor: '#16a34a' },
};

/** Quebras de linha do texto digitado viram <br> depois de escapar o HTML. */
function textoParaHtml(texto: string) {
  return escaparHtml(texto).replace(/\r?\n/g, '<br/>');
}

export type ChamadoEmailData = {
  id: string;
  protocolo: number;
  tipo: 'duvida' | 'erro';
  prioridade: 'alta' | 'media' | 'baixa';
  mensagem: string;
  userNome: string | null;
  userEmail: string;
  escolaNome: string | null;
  tela: string;
  conversa: { papel: 'usuario' | 'ia'; texto: string }[];
  anexos: { nome: string; mime: string; dados: Buffer }[];
};

export async function sendChamadoEmail(data: ChamadoEmailData) {
  const transporter = getTransporter();
  if (!transporter) {
    console.error('ERRO: Variáveis SMTP não configuradas no .env');
    return { error: 'Serviço de e-mail não configurado.' };
  }

  const responderUrl = `${getBaseUrl()}/chamados/${data.id}`;
  const prioridade = PRIORIDADE_ROTULO[data.prioridade];
  const tipo = data.tipo === 'erro' ? 'Relato de erro' : 'Dúvida';

  const conversaHtml = data.conversa.length
    ? data.conversa.map(m => `
          <div style="margin: 6px 0; padding: 8px 12px; border-radius: 6px; font-size: 13px; ${m.papel === 'ia' ? 'background:#eef2ff;' : 'background:#fff;border:1px solid #e2e8f0;'}">
            <strong style="font-size: 11px; color: #64748b;">${m.papel === 'ia' ? 'ASSISTENTE (IA)' : 'USUÁRIO'}</strong><br/>
            ${textoParaHtml(m.texto)}
          </div>`).join('')
    : '<p style="font-size: 13px; color: #64748b;"><em>O chamado foi aberto sem conversa com a IA.</em></p>';

  const anexosHtml = data.anexos.length
    ? `<p style="font-size: 13px; color: #475569;">📎 ${data.anexos.length} foto(s) em anexo neste e-mail.</p>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 640px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .content { background-color: #f8fafc; padding: 20px; border-radius: 8px; }
        .info { border-left: 4px solid #1e3a8a; padding-left: 15px; margin: 16px 0; font-size: 14px; }
        .mensagem { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 12px 0; }
        .button { display: inline-block; padding: 14px 28px; background-color: #1e3a8a; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2 style="color: #1e3a8a; margin: 0 0 4px;">Chamado #${data.protocolo} — ${tipo}</h2>
        <span style="display: inline-block; padding: 3px 12px; border-radius: 999px; background: ${prioridade.cor}; color: #fff; font-size: 12px; font-weight: bold;">
          PRIORIDADE ${prioridade.texto}
        </span>

        <div class="content" style="margin-top: 16px;">
          <div class="info">
            <p style="margin: 0;"><strong>Usuário:</strong> ${escaparHtml(data.userNome || 'Não informado')}</p>
            <p style="margin: 0;"><strong>E-mail:</strong> ${escaparHtml(data.userEmail)}</p>
            <p style="margin: 0;"><strong>Escola:</strong> ${escaparHtml(data.escolaNome || 'Sem escola selecionada')}</p>
            <p style="margin: 0;"><strong>Tela:</strong> ${escaparHtml(data.tela)}</p>
          </div>

          <p style="margin: 16px 0 0; font-weight: bold;">Mensagem</p>
          <div class="mensagem">${textoParaHtml(data.mensagem)}</div>
          ${anexosHtml}

          <div style="text-align: center;">
            <a href="${responderUrl}" class="button">Responder chamado</a>
          </div>

          <p style="margin: 16px 0 4px; font-weight: bold;">Conversa com a IA antes da abertura</p>
          ${conversaHtml}
        </div>

        <div class="footer">
          <p>Suporte do Sistema de Horário Escolar — SEDUC/TO</p>
          <p style="margin: 4px 0 0;">A resposta dada pelo botão aparece para o usuário dentro do sistema e por e-mail.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const resumo = data.mensagem.replace(/\s+/g, ' ').slice(0, 60);

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: getEmailSuporte(),
      // "Responder" no cliente de e-mail vai direto para quem abriu o chamado.
      replyTo: data.userEmail,
      subject: `[SHE Suporte][${prioridade.texto}] #${data.protocolo} — ${tipo}: ${resumo}`,
      html,
      attachments: data.anexos.map(a => ({ filename: a.nome, content: a.dados, contentType: a.mime })),
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail do chamado:', error);
    return { error: 'Falha no envio do e-mail do chamado.' };
  }
}

export type RespostaChamadoEmailData = {
  to: string;
  nome: string | null;
  protocolo: number;
  mensagem: string;
  resposta: string;
  correcao: string | null;
};

export async function sendRespostaChamadoEmail(data: RespostaChamadoEmailData) {
  const transporter = getTransporter();
  if (!transporter) return { error: 'Serviço de e-mail não configurado.' };

  const correcaoHtml = data.correcao
    ? `
          <p style="margin: 16px 0 0; font-weight: bold;">O que foi corrigido</p>
          <div class="bloco" style="border-left: 4px solid #16a34a;">${textoParaHtml(data.correcao)}</div>`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'PT Sans', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .content { background-color: #f8fafc; padding: 20px; border-radius: 8px; }
        .bloco { background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 8px 0; }
        .button { display: inline-block; padding: 12px 24px; background-color: #1e3a8a; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2 style="color: #1e3a8a; margin: 0;">Seu chamado #${data.protocolo} foi respondido</h2>
        <p style="color: #64748b; margin-top: 4px;">Sistema de Horário Escolar (SHE)</p>

        <div class="content">
          <p>Olá, <strong>${escaparHtml(data.nome || 'Usuário(a)')}</strong>!</p>
          <p style="margin: 16px 0 0; font-weight: bold;">Você escreveu</p>
          <div class="bloco" style="color: #64748b;">${textoParaHtml(data.mensagem)}</div>

          <p style="margin: 16px 0 0; font-weight: bold;">Resposta da equipe do SHE</p>
          <div class="bloco" style="border-left: 4px solid #1e3a8a;">${textoParaHtml(data.resposta)}</div>
          ${correcaoHtml}

          <div style="text-align: center;">
            <a href="${getBaseUrl()}/dashboard" class="button">Abrir o SHE</a>
          </div>
        </div>

        <div class="footer">
          <p>Secretaria da Educação do Estado do Tocantins</p>
          <p style="margin: 4px 0 0;">Se precisar de mais ajuda, abra um novo chamado pelo botão "Suporte" no sistema.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: data.to,
      subject: `Resposta ao seu chamado #${data.protocolo} - SHE`,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar resposta do chamado:', error);
    return { error: 'Falha no envio do e-mail de resposta.' };
  }
}