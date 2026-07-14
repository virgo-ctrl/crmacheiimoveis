import { getRawDb, initDb } from "@crm/db";

let isDbInitialized = false;

export function getDb() {
  if (!isDbInitialized) {
    try {
      initDb();
      isDbInitialized = true;
      console.log("SQLite Database initialized successfully.");
    } catch (err) {
      console.error("Error initializing SQLite database:", err);
    }
  }
  return getRawDb();
}
