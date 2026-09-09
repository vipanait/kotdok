/**
 * Where the deletion receipt is kept, and under what name.
 *
 * Its own module so the screen that writes it and the screen that reads it —
 * one inside the account, one after it is gone — agree without importing each
 * other.
 */
export const RECEIPT_KEY = 'lapka.deletion-receipt'
