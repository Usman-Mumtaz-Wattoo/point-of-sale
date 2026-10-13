require("dotenv").config({ path: ".env.local" });
const path = require("path");
const createJiti = require("jiti");

const jiti = createJiti(process.cwd(), {
  alias: {
    "@": path.resolve("./src"),
    "server-only": path.resolve("./node_modules/server-only/empty.js"),
  },
});

jiti("./src/app/settings/settings.test.ts");
