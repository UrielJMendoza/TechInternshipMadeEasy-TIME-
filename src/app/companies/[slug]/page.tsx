import { permanentRedirect } from "next/navigation";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = slug.replaceAll("-", " ");
  permanentRedirect(`/jobs?q=${encodeURIComponent(company)}`);
}
