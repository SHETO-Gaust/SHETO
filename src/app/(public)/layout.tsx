import Image from 'next/image';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="py-4 bg-white border-b">
        <div className="container mx-auto flex justify-center">
           <Image
              src="/img/logogforms.png"
              alt="GForms Logo"
              width={200}
              height={50}
              priority
            />
        </div>
      </header>
      <main className="flex-grow container mx-auto p-4 sm:p-6">{children}</main>
      <footer className="bg-white border-t p-4 text-center text-xs text-muted-foreground">
        Desenvolvido pela Gerência de Apoio ao Usuário e Suporte Técnico da Seduc Tocantins - Todos os direitos reservados © 2026
      </footer>
    </div>
  );
}
