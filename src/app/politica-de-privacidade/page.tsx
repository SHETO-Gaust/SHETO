import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidade — SHE',
  description: 'Política de Privacidade do Sistema de Horário Escolar (SHE) da SEDUC-TO.',
};

export default function PoliticaDePrivacidadePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar ao sistema
        </Link>

        <h1 className="mb-2 text-3xl font-bold">Política de Privacidade</h1>
        <p className="mb-10 text-sm text-muted-foreground">Última atualização: maio de 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="mb-3 text-lg font-semibold">1. Quem somos</h2>
            <p>
              O SHE (Sistema de Horário Escolar) é uma plataforma de gestão de horários escolares desenvolvida
              e operada pela <strong>Secretaria de Educação do Tocantins (SEDUC-TO)</strong>. Esta Política de
              Privacidade descreve como coletamos, usamos e protegemos informações dos usuários, em conformidade
              com a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">2. Dados coletados e finalidades</h2>

            <h3 className="mb-2 font-semibold">2.1 Dados de cadastro e autenticação</h3>
            <p className="mb-4">
              Para acessar o sistema, os usuários utilizam credenciais de acesso (e-mail institucional e senha)
              gerenciadas por meio do serviço de autenticação Supabase Auth. Esses dados são usados
              exclusivamente para identificar o usuário, controlar permissões de acesso e manter a segurança
              da sessão. Senhas são armazenadas de forma criptografada e nunca são acessíveis em texto plano.
            </p>

            <h3 className="mb-2 font-semibold">2.2 Dados de perfil do usuário</h3>
            <p className="mb-4">
              São armazenados nome, e-mail, função (papel no sistema) e módulos autorizados de cada usuário.
              Essas informações são utilizadas para personalizar a experiência, exibir dados relevantes e
              aplicar controles de acesso por unidade escolar.
            </p>

            <h3 className="mb-2 font-semibold">2.3 Dados escolares e operacionais</h3>
            <p>
              O sistema armazena informações institucionais como unidades escolares, turnos, séries, turmas,
              componentes curriculares, professores, suas disciplinas, cargas horárias e restrições de
              disponibilidade. Esses dados são de natureza operacional e não contêm dados sensíveis de alunos.
              São utilizados exclusivamente para geração e gestão de grades horárias escolares.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">3. Armazenamento e retenção de dados</h2>
            <p>
              Todos os dados são armazenados em banco de dados hospedado na plataforma Supabase, com acesso
              restrito por políticas de segurança em nível de linha (Row Level Security — RLS). Os dados são
              mantidos enquanto o vínculo institucional do usuário estiver ativo. Usuários desativados perdem
              acesso ao sistema, mas seus registros históricos podem ser retidos para fins de auditoria
              conforme as políticas internas da SEDUC-TO.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">4. Compartilhamento de dados</h2>
            <p>
              Os dados não são vendidos, alugados nem compartilhados com terceiros para fins comerciais. 
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-1">
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">5. Cookies e armazenamento local</h2>
            <p>
              O sistema utiliza cookies de sessão estritamente necessários para manter o estado de
              autenticação do usuário. Não são utilizados cookies de publicidade ou rastreamento de terceiros.
              Você pode gerenciar ou excluir cookies nas configurações do seu navegador; isso encerrará sua
              sessão no sistema.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">6. Segurança</h2>
            <p>
              Adotamos medidas técnicas para proteger as informações transmitidas e armazenadas, incluindo
              conexão criptografada via HTTPS, autenticação segura gerenciada pelo Supabase Auth e controle
              de acesso granular por políticas RLS no banco de dados. O acesso ao sistema é restrito a
              servidores e colaboradores autorizados pela SEDUC-TO.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">7. Direitos dos titulares (LGPD)</h2>
            <p>
              Nos termos da LGPD, os titulares dos dados têm direito a confirmação de tratamento, acesso,
              correção, eliminação e portabilidade dos seus dados, além de informações sobre
              compartilhamentos realizados. Para exercer esses direitos, entre em contato com o setor
              responsável da Secretaria de Educação do Tocantins.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">8. Alterações nesta política</h2>
            <p>
              Esta Política pode ser atualizada periodicamente. A data da última revisão está indicada no
              topo desta página. Recomendamos que você a consulte ocasionalmente para se manter informado
              sobre eventuais mudanças.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-6 text-xs text-muted-foreground text-center">
          Secretaria de Educação do Tocantins — SEDUC-TO © 2026
        </div>
      </div>
    </div>
  );
}
