/** Map Supabase / Postgres errors to beginner-friendly messages. */
export function userMessageFromError(error: unknown): string {
  if (!error) return "Could not save. Please try again.";

  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);

  const text = raw.toLowerCase();

  if (
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("offline")
  ) {
    return "You are offline. Reconnect and try again.";
  }

  if (text.includes("duplicate_request") || text.includes("duplicate")) {
    return "This payment was already submitted.";
  }

  if (text.includes("already_processed")) {
    return "This payment has already been processed.";
  }

  if (
    text.includes("jwt") ||
    text.includes("session") ||
    text.includes("not authenticated") ||
    text.includes("invalid login")
  ) {
    return "Please log in again.";
  }

  if (
    text.includes("not_authorised") ||
    text.includes("not_authorized") ||
    text.includes("permission") ||
    text.includes("row-level security")
  ) {
    return "You are not authorised for this action.";
  }

  if (text.includes("invalid_party")) {
    return "Please enter a valid party or vendor name.";
  }

  if (text.includes("invalid_amount")) {
    return "Please enter an amount greater than zero.";
  }

  if (text.includes("invalid_reason")) {
    return "Please enter a denial reason.";
  }

  if (text.includes("invalid_payment_mode")) {
    return "Please choose a payment mode.";
  }

  return "Could not save. Please try again.";
}
