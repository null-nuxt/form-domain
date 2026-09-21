import domains from '#form-domains'

/** Every domain discovered under `<srcDir>/forms`. */
type Factories = typeof domains

type Factory = Factories[number]

/** The union of every instance — where the typed lookup by slug comes from. */
export type AnyFormDomain = Factories extends readonly (() => infer I)[] ? I : never

/** Distributes over the union, so several domains give a union of slugs. */
type SlugOf<T> = T extends { id: infer Id extends string } ? Id : never

export type FormDomainSlug = SlugOf<Factory>

/**
 * A specific domain, correctly typed for the slug: `useFormDomain('x')` returns
 * exactly that domain, not a union of all of them.
 *
 * Instantiates only the requested one — a factory holds the setup, not its
 * result, so registering costs nothing.
 */
export function useFormDomain<S extends FormDomainSlug>(slug: S) {
  const factory = domains.find(domain => domain.id === slug)

  if (!factory) {
    throw new Error(
      `[@null-nuxt/form-domain] form domain "${slug}" not found. Is it under <srcDir>/forms?`,
    )
  }

  return factory() as Extract<AnyFormDomain, { id: S }>
}

/**
 * Every domain's catalog entry, WITHOUT instantiating any of them — this is the
 * one a listing page wants. `metadata` is static, so it is read straight off
 * the factory: 300 certificates cost 300 property reads, not 300 setups.
 */
export function useFormDomainsMetadata(): Array<Pick<Factory, 'id' | 'metadata'>> {
  return domains.map(factory => ({ id: factory.id, metadata: factory.metadata }))
}

/**
 * Every domain, instantiated. Reach for `useFormDomainsMetadata` in a catalog;
 * this one runs every setup, which is the inherent cost of needing reactive
 * values from all of them at once.
 */
export function useFormDomains(): AnyFormDomain[] {
  return domains.map(factory => factory()) as AnyFormDomain[]
}
