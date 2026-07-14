// Validation and Sanitization core rules (D3/D4)

/**
 * Validates if the phone number adheres to the E.164 standard.
 * Standard format: +[country_code][subscriber_number] up to 15 digits total.
 */
export function validatePhoneE164(phone: string): boolean {
  const cleanPhone = phone.replace(/\s+/g, "").replace(/-/g, "").replace(/\(/g, "").replace(/\)/g, "");
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(cleanPhone);
}

/**
 * Validates if the email syntax is standard.
 */
export function validateEmail(email: string): boolean {
  if (!email) return true; // Nullable check is acceptable at DB level
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Sanitizes lead name by stripping out email signatures, automatic client footer footprints, etc. (D3)
 */
export function sanitizeName(name: string): string {
  if (!name) return "";
  return name
    .replace(/Enviado do meu (iPhone|Android|iPad|Dispositivo|Windows)/gi, "")
    .replace(/Atenciosamente,?.*/gi, "")
    .replace(/Com os melhores cumprimentos,?.*/gi, "")
    .replace(/Enviado por.*/gi, "")
    .replace(/De:.*/gi, "")
    .replace(/Para:.*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes development/company names to create standard comparison keys.
 * Removes symbols, spaces, accents, and company suffixes (D4).
 */
export function normalizeKey(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s]/g, "") // Remove symbols
    .replace(/\b(incorporadora|construtora|empreendimento|residencial|condominio|e|ltda|s\/?a|club|house|towers?|residences?)\b/g, "")
    .replace(/\s+/g, "") // Remove all spacing
    .trim();
}

/**
 * Checks for a duplication suspect based on normalized keys.
 */
export function isFuzzyDuplicate(nameA: string, nameB: string): boolean {
  return normalizeKey(nameA) === normalizeKey(nameB);
}
