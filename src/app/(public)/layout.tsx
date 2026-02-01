
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <main className="flex-grow container mx-auto p-4 sm:p-6">{children}</main>
    </div>
  );
}
