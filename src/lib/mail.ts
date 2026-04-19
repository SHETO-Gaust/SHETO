import nodemailer from 'nodemailer';

/**
 * Cria o transporte apenas se as credenciais existirem no .env
 */
function getTransporter() {
  const user = process.env.GMAIL_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });
}

export type WelcomeEmailData = {
  to: string;
  name: string;
  password: string;
  schoolName: string;
  regional: string;
  city: string;
  inep: string;
};

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  const transporter = getTransporter();
  
  if (!transporter) {
    console.error('ERRO DE CONFIGURAÇÃO: GMAIL_EMAIL ou GMAIL_APP_PASSWORD não definidos no .env');
    return { error: 'Serviço de e-mail não configurado. Verifique as credenciais no .env' };
  }

  const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://sheto.vercel.app'}/login`;

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
          <h1 style="color: #1e3a8a; margin: 0;">Bem-vindo(a) ao SHE</h1>
          <p style="margin-top: 5px;">Sistema de Horário Escolar - SEDUC Tocantins</p>
        </div>
        
        <div class="content">
          <p>Olá, <strong>${data.name}</strong>!</p>
          <p>É com satisfação que informamos que seu acesso ao sistema <strong>SHE</strong> foi liberado.</p>
          
          <p>Você foi vinculado(a) à seguinte unidade escolar:</p>
          
          <div class="school-info">
            <p style="margin: 0;"><strong>Escola:</strong> ${data.schoolName}</p>
            <p style="margin: 0;"><strong>Regional:</strong> ${data.regional}</p>
            <p style="margin: 0;"><strong>Município:</strong> ${data.city}</p>
            <p style="margin: 0;"><strong>INEP:</strong> ${data.inep}</p>
          </div>

          <p>Utilize as credenciais abaixo para seu primeiro acesso:</p>
          
          <div class="credentials">
            <p style="margin: 0;"><strong>Login (E-mail):</strong> ${data.to}</p>
            <p style="margin: 0;"><strong>Senha Temporária:</strong> ${data.password}</p>
          </div>

          <div style="text-align: center;">
            <a href="${loginUrl}" class="button">Acessar o Sistema</a>
          </div>
        </div>

        <p style="font-size: 14px; color: #475569;">
          <em>Recomendamos que você altere sua senha logo após o primeiro acesso clicando no seu perfil.</em>
        </p>

        <div class="footer">
          <p>Secretaria da Educação do Estado do Tocantins</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"SHE - Sistema de Horário Escolar" <${user}>`,
      to: data.to,
      subject: 'Acesso Liberado - Sistema de Horário Escolar (SHE)',
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return { error: 'Falha no envio do e-mail de boas-vindas. Verifique a configuração SMTP.' };
  }
}

export async function sendRestrictionRequestEmail(data: { to: string, name: string, schoolName: string, token: string }) {
  const transporter = getTransporter();
  const user = process.env.GMAIL_EMAIL;

  if (!transporter) {
    console.error('ERRO: GMAIL_EMAIL ou GMAIL_APP_PASSWORD não configurados no .env');
    return { error: 'Serviço de e-mail não configurado. Informe ao administrador do sistema.' };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sheto.vercel.app';
  const requestUrl = `${baseUrl}/restricoes/${data.token}`;

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
<<<<<<< HEAD
        
        <div class="content">
          <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
          <p>A coordenação pedagógica da unidade <strong>${data.schoolName}</strong> solicita que você informe sua disponibilidade e sugestão de <strong>Livre Docência (2 meios períodos livres)</strong>.</p>
          
          <p>Clique no botão abaixo para acessar sua grade individual:</p>
=======
                <div class="content">
          <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
          <p>A coordenação pedagógica da unidade <strong>${data.schoolName}</strong> solicita que você informe suas preferências de horário para a montagem da grade escolar.</p>
          
          <p>Clique no botão abaixo para acessar seu formulário individual:</p>
>>>>>>> 3bc12c2 (teste)

          <div style="text-align: center;">
            <a href="${requestUrl}" class="button">Informar Minhas Preferências</a>
          </div>

<<<<<<< HEAD
=======
          <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; font-weight: bold; font-size: 13px;">O formulário contém 4 seções:</p>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.8;">
              <li><strong>Livre Docência</strong> — 2 meios períodos livres (obrigatório)</li>
              <li><strong>Dias Preferidos</strong> — dias em que prefere concentrar suas aulas (opcional)</li>
              <li><strong>Indisponibilidades</strong> — horários com outros vínculos ou restrições</li>
              <li><strong>Justificativa</strong> — observações que auxiliem a coordenação</li>
            </ol>
          </div>

>>>>>>> 3bc12c2 (teste)
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
      from: `"SHE - Sistema de Horário Escolar" <${user}>`,
      to: data.to,
      subject: `Preferências de Horário - ${data.schoolName}`,
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail de restrição:', error);
    return { error: 'Falha no envio do e-mail. Verifique a configuração SMTP do servidor.' };
  }
<<<<<<< HEAD
=======
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
  const emailUser = process.env.GMAIL_EMAIL;
  if (!transporter || !emailUser) return { error: 'Serviço de e-mail não configurado.' };

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
      from: `"SHE - Sistema de Horário Escolar" <${emailUser}>`,
      to: data.to,
      subject: `Confirmação de Preferências — ${data.schoolName}`,
      html,
    });
    return { success: true };
  } catch (err) {
    console.error('Erro ao enviar confirmação:', err);
    return { error: 'Falha no envio do e-mail de confirmação.' };
  }
>>>>>>> 3bc12c2 (teste)
}