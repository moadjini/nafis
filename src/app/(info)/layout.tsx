import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
