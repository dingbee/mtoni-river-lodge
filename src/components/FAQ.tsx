import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { FAQItem } from "@/lib/faq-schema";

type FAQProps = {
  faqs: ReadonlyArray<FAQItem>;
  /** Optional small label above the heading */
  eyebrow?: string;
  /** Section heading (omit by passing empty string) */
  heading?: string;
  /** Optional intro paragraph below the heading */
  intro?: string;
  className?: string;
  /** Allow multiple panels open at once. Defaults to single. */
  multiple?: boolean;
};

/**
 * Reusable accordion-style FAQ section.
 * Visible content must mirror the items passed to `buildFAQJsonLd` in the
 * route's `head()` to satisfy Google's FAQPage requirements.
 */
export function FAQ({
  faqs,
  eyebrow = "Frequently asked",
  heading = "Frequently asked questions",
  intro,
  className,
  multiple = false,
}: FAQProps) {
  if (faqs.length === 0) return null;

  return (
    <section
      className={cn(
        "bg-ivory px-6 py-24 text-charcoal lg:px-12 lg:py-32",
        className,
      )}
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl">
        {eyebrow ? (
          <p className="eyebrow text-charcoal/60">{eyebrow}</p>
        ) : null}
        {heading ? (
          <h2
            id="faq-heading"
            className="mt-4 font-display text-4xl leading-[1.1] lg:text-5xl"
          >
            {heading}
          </h2>
        ) : null}
        {intro ? (
          <p className="mt-6 max-w-2xl leading-relaxed text-charcoal/75">
            {intro}
          </p>
        ) : null}

        {multiple ? (
          <Accordion type="multiple" className="mt-12">
            {faqs.map((f, i) => (
              <AccordionItem
                key={f.q}
                value={`faq-${i}`}
                className="border-charcoal/15"
              >
                <AccordionTrigger className="py-6 text-left font-display text-lg text-charcoal lg:text-xl">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-base leading-relaxed text-charcoal/75">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Accordion type="single" collapsible className="mt-12">
            {faqs.map((f, i) => (
              <AccordionItem
                key={f.q}
                value={`faq-${i}`}
                className="border-charcoal/15"
              >
                <AccordionTrigger className="py-6 text-left font-display text-lg text-charcoal lg:text-xl">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-base leading-relaxed text-charcoal/75">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  );
}

export default FAQ;