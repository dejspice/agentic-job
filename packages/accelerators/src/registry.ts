import { AtsType } from "@dejsol/core";
import type { AtsAccelerator } from "@dejsol/core";
import { greenhouseAccelerator } from "./greenhouse/index.js";

const registry = new Map<AtsType, AtsAccelerator>([
  [AtsType.GREENHOUSE, greenhouseAccelerator],
]);

/**
 * Resolve an accelerator pack by ATS type.
 * Returns undefined if no accelerator is registered for the given type.
 */
export function getAccelerator(
  atsType: AtsType,
): AtsAccelerator | undefined {
  return registry.get(atsType);
}

/**
 * Returns true if an accelerator pack is registered for the given ATS type.
 */
export function hasAccelerator(atsType: AtsType): boolean {
  return registry.has(atsType);
}

/**
 * Returns the list of ATS types that have registered accelerator packs.
 */
export function registeredAtsTypes(): AtsType[] {
  return [...registry.keys()];
}
