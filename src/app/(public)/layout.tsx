import Image from 'next/image';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
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
      <main className="container mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
