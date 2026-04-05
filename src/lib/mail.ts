
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

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
          <p>É com satisfação que informamos que seu acesso experimental ao sistema <strong>SHE</strong> foi liberado.</p>
          
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
      from: `"SHE - Sistema de Horário Escolar" <${process.env.GMAIL_EMAIL}>`,
      to: data.to,
      subject: 'Acesso Liberado - Sistema de Horário Escolar (SHE)',
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return { error: 'Falha no envio do e-mail de boas-vindas.' };
  }
}

export async function sendRestrictionRequestEmail(data: { to: string, name: string, schoolName: string, token: string }) {
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
        .warning { font-size: 12px; color: #ef4444; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="color: #1e3a8a; margin: 0;">Solicitação de Disponibilidade</h2>
          <p style="color: #64748b;">Sistema de Horário Escolar (SHE)</p>
        </div>
        
        <div class="content">
          <p>Prezado(a) Professor(a) <strong>${data.name}</strong>,</p>
          <p>A coordenação pedagógica da unidade <strong>${data.schoolName}</strong> solicita o preenchimento de suas restrições e disponibilidades de horário para a organização da nova grade escolar.</p>
          
          <p>Por favor, clique no botão abaixo para acessar sua grade individual. Você poderá marcar os horários de folga e planejamento diretamente na tela.</p>

          <div style="text-align: center;">
            <a href="${requestUrl}" class="button">Preencher Minhas Restrições</a>
          </div>

          <p class="warning">Atenção: Este link é pessoal e expira em 48 horas. Pode ser preenchido apenas uma vez.</p>
          
          <p style="font-size: 13px; color: #475569; margin-top: 20px;">
            Não é necessário senha ou login para este acesso temporário.
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
      from: `"SHE - Sistema de Horário Escolar" <${process.env.GMAIL_EMAIL}>`,
      to: data.to,
      subject: `Solicitação de Restrições - ${data.schoolName}`,
      html: html,
    });
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar e-mail de restrição:', error);
    return { error: 'Falha no envio do e-mail para o professor.' };
  }
}
