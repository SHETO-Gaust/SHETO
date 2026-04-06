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
        
        <div class="content">
          <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
          <p>A coordenação pedagógica da unidade <strong>${data.schoolName}</strong> solicita que você informe sua disponibilidade e sugestão de <strong>Livre Docência (2 meios períodos livres)</strong>.</p>
          
          <p>Clique no botão abaixo para acessar sua grade individual:</p>

          <div style="text-align: center;">
            <a href="${requestUrl}" class="button">Informar Minhas Preferências</a>
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
}