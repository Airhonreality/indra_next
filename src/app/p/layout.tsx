/** Public ingestion layout — no nav, no sidebar, full-screen reactor. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#06070d] text-white">
      {children}
    </div>
  );
}
