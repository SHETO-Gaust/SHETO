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
  const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://she.seduc.to.gov.br'}/login`;

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
            <p style="margin: 0;"><strong>Responsável:</strong> ${data.name}</p>
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
