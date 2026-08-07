/** Map Supabase / Postgres errors to beginner-friendly messages. */

const RULES: Array<{ test: (t: string) => boolean; message: string }> = [
  {
    test: (t) =>
      t.includes("failed to fetch") ||
      t.includes("network") ||
      t.includes("offline"),
    message: "You are offline. Reconnect and try again.",
  },
  {
    test: (t) => t.includes("duplicate_request") || t.includes("duplicate"),
    message: "This payment was already submitted.",
  },
  {
    test: (t) => t.includes("already_processed"),
    message: "This payment has already been processed.",
  },
  {
    test: (t) =>
      t.includes("jwt") ||
      t.includes("session") ||
      t.includes("not authenticated") ||
      t.includes("not_authenticated") ||
      t.includes("jwt expired") ||
      t.includes("invalid login"),
    message: "Please log in again.",
  },
  {
    test: (t) =>
      t.includes("not_authorised") ||
      t.includes("not_authorized") ||
      t.includes("permission") ||
      t.includes("row-level security"),
    message: "You are not authorised for this action.",
  },
  {
    test: (t) => t.includes("confirmed"),
    message: "This shift is marked done. Open it again before editing.",
  },
  {
    test: (t) => t.includes("locked"),
    message: "This day is closed. Only the admin can change it now.",
  },
  {
    test: (t) => t.includes("invalid_informed"),
    message: "Choose whether he told us.",
  },
  {
    // deny_payment and upsert_attendance_entry both raise a bare INVALID_REASON,
    // so one message has to serve the denial box and the absence chips alike.
    test: (t) => t.includes("invalid_reason"),
    message: "Please provide a reason.",
  },
  {
    test: (t) => t.includes("invalid_note"),
    message: "Add a short note for this absence reason.",
  },
  {
    test: (t) => t.includes("invalid_name"),
    message: "Enter a valid worker name.",
  },
  {
    test: (t) => t.includes("invalid_designation"),
    message: "Enter a shorter job title.",
  },
  {
    test: (t) => t.includes("invalid_party"),
    message: "Please enter a valid party or vendor name.",
  },
  {
    test: (t) => t.includes("invalid_amount"),
    message: "Please enter an amount greater than zero.",
  },
  {
    test: (t) => t.includes("invalid_payment_mode"),
    message: "Please choose a payment mode.",
  },
  {
    test: (t) => t.includes("not_history") || t.includes("not_deletable"),
    message: "This payment cannot be deleted in its current status.",
  },
  {
    test: (t) =>
      t.includes("function") &&
      (t.includes("does not exist") || t.includes("not found")),
    message: "Payment functions are missing. Run the SQL migrations in Supabase.",
  },
  {
    test: (t) =>
      t.includes("could not find the table") ||
      t.includes("pgrst205") ||
      t.includes("schema cache") ||
      t.includes("does not exist"),
    message: "Database is not set up yet. Run the SQL migrations in Supabase.",
  },
  {
    test: (t) => t.includes("invalid_title"),
    message: "Please enter a to-do (1–200 characters).",
  },
  {
    test: (t) => t.includes("invalid_priority"),
    message: "Priority must be Normal or Urgent.",
  },
  {
    test: (t) => t.includes("todo_frozen") || t.includes("already_done"),
    message: "This to-do is done and cannot be changed.",
  },
  {
    test: (t) => t.includes("not_found"),
    message: "This payment was not found. Refresh and try again.",
  },
];

function rawMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function userMessageFromError(error: unknown): string {
  const text = rawMessage(error).toLowerCase();
  if (!text) return "Could not save. Please try again.";
  for (const rule of RULES) {
    if (rule.test(text)) return rule.message;
  }
  return "Could not save. Please try again.";
}

