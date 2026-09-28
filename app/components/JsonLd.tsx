import { serializeJsonLd } from "@/lib/seo/structured-data";

/** Renders escaped structured data; the serializer neutralizes `</script>`. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
